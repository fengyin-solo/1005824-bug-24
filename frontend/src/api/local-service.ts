import { MODULE_BY_KEY } from '@/data/modules'
import { allRows, listAudit, listRows, recordAudit, resetRows, saveRows } from '@/data/local-store'
import type {
  ActionResult,
  AuditEntry,
  EntryRow,
  ModuleMeta,
  OperatorContext,
  OverviewResult,
  PageResult,
  StationChange,
} from '@/data/types'

// 会写进数据的「往回走」动作：命中就把这条记录标成异常态，看板上能一眼看出来。
const NEGATIVE_ACTIONS = ['撤销', '作废', '拒绝', '驳回', '停用', '忽略', '下线', '回滚']

export function moduleMeta(key: string): ModuleMeta {
  const meta = MODULE_BY_KEY.get(key)
  if (!meta) {
    throw new Error(`没有登记名为 ${key} 的业务模块`)
  }
  return meta
}

export function filterRows(rows: EntryRow[], filters: Record<string, string>): EntryRow[] {
  const pairs = Object.entries(filters).filter(([, value]) => value.trim() !== '')
  if (pairs.length === 0) {
    return rows
  }
  return rows.filter((row) =>
    pairs.every(([field, value]) => String(row[field] ?? '').includes(value.trim())),
  )
}

export function listEntries(key: string, filters: Record<string, string> = {}): PageResult {
  const matched = filterRows(listRows(key), filters)
  return { items: matched, total: matched.length, page: 1, size: matched.length }
}

export function runAction(key: string, id: number, action: string): ActionResult {
  const meta = moduleMeta(key)
  const target = meta.actionTargets[action]
  if (!target) {
    return { ok: false, message: `${meta.entity}没有登记「${action}」这个动作` }
  }
  const rows = listRows(key)
  const index = rows.findIndex((row) => Number(row.id) === id)
  if (index < 0) {
    return { ok: false, message: `没有找到编号为 ${id} 的${meta.entity}` }
  }
  const current = String(rows[index].status)
  if (current === target) {
    return { ok: false, message: `${meta.entity}已经是「${target}」，不用重复操作` }
  }
  const lastStatus = meta.statuses[meta.statuses.length - 1]
  const updated: EntryRow = {
    ...rows[index],
    status: target,
    pending: target !== lastStatus,
    abnormal: NEGATIVE_ACTIONS.some((verb) => action.startsWith(verb)),
  }
  const next = [...rows]
  next[index] = updated
  saveRows(key, next)
  return { ok: true, message: `${meta.entity}已${action}，当前状态「${target}」` }
}

export function resetModule(key: string): PageResult {
  resetRows(key)
  return listEntries(key)
}

// —— 泵站台账：片区归属在数据层卡死，页面只负责把操作上下文带进来 ——

const STATION_KEY = 'pumpstation'
// 已停用的站整条受控：任何片区、任何入口都改不动。
const STATION_LOCKED_STATUS = '已停用'
// 只有本片区能改的三个字段，其余字段这个入口一律不收。
const STATION_GUARDED_FIELDS = ['站名', '所属片区', '设计流量'] as const

export function getPumpStation(id: number): EntryRow {
  const row = listRows(STATION_KEY).find((item) => Number(item.id) === id)
  if (!row) {
    throw new Error(`没有找到编号为 ${id} 的排水泵站`)
  }
  return row
}

export function listStationRegions(): string[] {
  // 片区目录从台账现值里归集：既有归属（包括历史数据里的写法）一律承认、保持原值。
  const regions = new Set<string>()
  for (const row of listRows(STATION_KEY)) {
    const region = String(row['所属片区'] ?? '').trim()
    if (region) {
      regions.add(region)
    }
  }
  return [...regions].sort((a, b) => a.localeCompare(b, 'zh-Hans-CN'))
}

export function listStationAudit(stationId?: number): AuditEntry[] {
  const entries = listAudit()
  return stationId === undefined
    ? entries
    : entries.filter((entry) => entry.stationId === stationId)
}

function stationRevision(row: EntryRow): number {
  // 既有站档没有版本号，按 0 算，兼容旧数据。
  const revision = Number(row.revision)
  return Number.isFinite(revision) && revision >= 0 ? Math.floor(revision) : 0
}

function describeAttempt(changes: StationChange): string {
  const parts = STATION_GUARDED_FIELDS.filter((field) => changes[field] !== undefined).map(
    (field) => `${field}→「${String(changes[field]).trim()}」`,
  )
  return parts.length > 0 ? parts.join('；') : '（未提交字段改动）'
}

export function updatePumpStation(
  id: number,
  changes: StationChange,
  ctx: OperatorContext,
): ActionResult {
  const rows = listRows(STATION_KEY)
  const index = rows.findIndex((row) => Number(row.id) === id)
  if (index < 0) {
    return { ok: false, message: `没有找到编号为 ${id} 的排水泵站` }
  }
  const current = rows[index]
  const stationName = String(current['站名'] ?? `编号${id}`)
  const attempt = describeAttempt(changes)
  const operator = ctx.operator.trim() || '未登记值班员'
  const region = ctx.region.trim()
  const reject = (reason: string): ActionResult => {
    // 被挡下的尝试一律留痕：谁、什么时候、想动哪一座站、越在哪，都能倒查。
    recordAudit({
      time: new Date().toISOString(),
      operator,
      operatorRegion: region || '未指定片区',
      stationId: id,
      stationName,
      attempt,
      result: '已挡回',
      reason,
    })
    return { ok: false, message: reason }
  }

  // 已停用：整条受控只读，连本片区也不能改动。
  if (String(current.status) === STATION_LOCKED_STATUS) {
    return reject(`「${stationName}」已停用，整条台账受控只读，连本片区也不能改动`)
  }

  // 归属：每座站只算它所在的片区，跨片区的提交直接退回并写明越在哪。
  const homeRegion = String(current['所属片区'] ?? '').trim()
  if (!region || region !== homeRegion) {
    return reject(
      `跨片区改动被退回：「${stationName}」归属「${homeRegion || '未登记片区'}」，` +
        `当前值班片区是「${region || '未指定'}」，站名、所属片区、设计流量只有本片区的值班账号能改`,
    )
  }

  // 版本：同一座站只落先到的那一版，后到的提交（无论来自哪个入口）都退回。
  const revision = stationRevision(current)
  if (ctx.baseRevision !== revision) {
    return reject(
      `「${stationName}」已被先到的改动更新到版本 ${revision}，本次提交基于版本 ${ctx.baseRevision}，` +
        `只接受先到的那一版，请刷新后重新提交`,
    )
  }

  // 归整改动：空值不收，没变的字段不写。
  const next: Record<string, string> = {}
  for (const field of STATION_GUARDED_FIELDS) {
    const raw = changes[field]
    if (raw === undefined) {
      continue
    }
    const value = String(raw).trim()
    if (!value) {
      return { ok: false, message: `${field}不能为空` }
    }
    if (value !== String(current[field] ?? '')) {
      next[field] = value
    }
  }
  if (Object.keys(next).length === 0) {
    return { ok: false, message: '提交的内容与台账现值一致，没有需要保存的改动' }
  }

  // 重名：同一片区下站名唯一，撞了要指出跟谁撞。
  const targetRegion = next['所属片区'] ?? homeRegion
  const targetName = next['站名'] ?? stationName
  const clash = rows.find(
    (row) =>
      Number(row.id) !== id &&
      String(row['所属片区'] ?? '').trim() === targetRegion &&
      String(row['站名'] ?? '') === targetName,
  )
  if (clash) {
    return reject(
      `站名「${targetName}」在「${targetRegion}」与编号 ${clash.id} 的泵站` +
        `「${String(clash['站名'] ?? '')}」重名，同一片区下站名不能重复`,
    )
  }

  const updated: EntryRow = { ...current, ...next, revision: revision + 1 }
  const nextRows = [...rows]
  nextRows[index] = updated
  saveRows(STATION_KEY, nextRows)
  recordAudit({
    time: new Date().toISOString(),
    operator,
    operatorRegion: region,
    stationId: id,
    stationName,
    attempt,
    result: '已受理',
    reason: '',
  })
  const changedText = Object.entries(next)
    .map(([field, value]) => `${field}改为「${value}」`)
    .join('，')
  return {
    ok: true,
    message: `「${targetName}」台账已更新（${changedText}），概览装机台数将按新归属重算`,
  }
}

export function exportEntries(key: string): { filename: string; content: string } {
  const meta = moduleMeta(key)
  const header = ['编号', ...meta.fields, '当前状态']
  const lines = [header.join(',')]
  for (const row of listRows(key)) {
    lines.push([row.id, ...meta.fields.map((field) => row[field] ?? ''), row.status].join(','))
  }
  return { filename: `${meta.name}-清单.csv`, content: `\uFEFF${lines.join('\n')}` }
}

export function downloadEntries(key: string): void {
  const { filename, content } = exportEntries(key)
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  document.body.removeChild(anchor)
  URL.revokeObjectURL(url)
}

export function loadOverview(): OverviewResult {
  const rows = allRows()
  const modules = [...MODULE_BY_KEY.values()].map((meta) => {
    const entries = rows[meta.key] ?? []
    return {
      name: meta.name,
      created: entries.length,
      pending: entries.filter((row) => row.pending).length,
      abnormal: entries.filter((row) => row.abnormal).length,
    }
  })
  // 装机台数按现行片区归属归集：归属口径改过之后，每次统计都按最新所属片区重算。
  const regionMap = new Map<string, { region: string; stations: number; units: number }>()
  let totalUnits = 0
  for (const row of rows[STATION_KEY] ?? []) {
    const region = String(row['所属片区'] ?? '').trim() || '未登记片区'
    const units = Number(row['装机台数'])
    const safeUnits = Number.isFinite(units) ? units : 0
    const bucket = regionMap.get(region) ?? { region, stations: 0, units: 0 }
    bucket.stations += 1
    bucket.units += safeUnits
    regionMap.set(region, bucket)
    totalUnits += safeUnits
  }
  const stationRegions = [...regionMap.values()].sort((a, b) =>
    a.region.localeCompare(b.region, 'zh-Hans-CN'),
  )
  const cards = [
    { label: '业务模块', value: modules.length },
    { label: '登记总量', value: modules.reduce((sum, item) => sum + item.created, 0) },
    { label: '待处理', value: modules.reduce((sum, item) => sum + item.pending, 0) },
    { label: '异常量', value: modules.reduce((sum, item) => sum + item.abnormal, 0) },
    { label: '泵站装机台数', value: totalUnits },
  ]
  return { cards, modules, stationRegions }
}
