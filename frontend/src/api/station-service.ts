import { getMeta, listRows, saveRows, setMeta } from '@/data/local-store'
import { listAudit, recordAudit } from '@/data/audit-store'
import type {
  AuditEntry,
  DistrictInstall,
  EntryRow,
  FieldChange,
  Identity,
  RejectReason,
  SubmitSource,
  StationPatch,
  UpdateStationInput,
  UpdateStationResult,
} from '@/data/types'

// 泵站台账的数据层规则：归属只认存储中每座站当前的「所属片区」，页面只是薄壳。
// 列表与详情两个入口都只能走这里，校验只在这一道、谁都绕不过。

export const PUMP_MODULE_KEY = 'pumpstation'
export const STATION_STATUS_DECOMMISSIONED = '已停用'

// 受归属保护的三个字段：站名、所属片区、设计流量，只有本片区能改。
const GUARDED_FIELDS = ['站名', '所属片区', '设计流量'] as const
const MIGRATION_MARK = 'pumpstation:legacy-migrated-v1'

function stations(): EntryRow[] {
  return listRows(PUMP_MODULE_KEY)
}

function persist(rows: EntryRow[]): void {
  saveRows(PUMP_MODULE_KEY, rows)
}

function findStation(rows: EntryRow[], id: number): EntryRow | undefined {
  return rows.find((row) => Number(row.id) === id)
}

function asText(value: unknown): string {
  return String(value ?? '').trim()
}

function isDecommissioned(row: EntryRow): boolean {
  return asText(row.status) === STATION_STATUS_DECOMMISSIONED
}

// 兼容既有归属：老档案没有版本号。首次触达时只补控制字段，业务取值一律保持建账当时的值。
function ensureLegacyMigrated(): void {
  if (getMeta<boolean>(MIGRATION_MARK)) {
    return
  }
  const rows = stations()
  const legacyIds: number[] = []
  const next = rows.map((row) => {
    if (typeof row.version === 'number') {
      return row
    }
    legacyIds.push(Number(row.id))
    return { ...row, version: 1, legacy: true }
  })
  if (legacyIds.length > 0) {
    persist(next)
    recordAudit({
      identity: null,
      stationId: null,
      stationName: '泵站台账（全部既有档案）',
      stationDistrict: '—',
      source: 'system',
      action: 'migrate-legacy',
      accepted: true,
      detail: `兼容既有归属：${legacyIds.length} 座站的站档记录保持当时取值，仅补登版本号 v1，编号 ${legacyIds.join('、')}`,
    })
  }
  setMeta(MIGRATION_MARK, true)
}

export type StationFilter = {
  district?: string
  keyword?: string
}

// 统一读取口径：列表、详情、看板都从这里拿同一份数据，不再各算各的。
export function listStations(filter: StationFilter = {}): EntryRow[] {
  ensureLegacyMigrated()
  const district = filter.district?.trim() ?? ''
  const keyword = filter.keyword?.trim() ?? ''
  return stations().filter((row) => {
    if (district && asText(row['所属片区']) !== district) {
      return false
    }
    if (
      keyword &&
      !asText(row['站名']).includes(keyword) &&
      !asText(row['所属片区']).includes(keyword) &&
      !asText(row['设计流量']).includes(keyword)
    ) {
      return false
    }
    return true
  })
}

export function getStation(id: number): EntryRow | null {
  ensureLegacyMigrated()
  return findStation(stations(), id) ?? null
}

export function listDistricts(): string[] {
  ensureLegacyMigrated()
  return [...new Set(stations().map((row) => asText(row['所属片区'])).filter(Boolean))]
}

function diffPatch(row: EntryRow, patch: StationPatch): FieldChange[] {
  const changes: FieldChange[] = []
  for (const field of GUARDED_FIELDS) {
    if (patch[field] === undefined) {
      continue
    }
    const to = String(patch[field]).trim()
    const from = asText(row[field])
    if (to !== from) {
      changes.push({ field, from, to })
    }
  }
  return changes
}

function recordRejection(
  input: UpdateStationInput,
  row: EntryRow | null,
  reason: RejectReason,
  message: string,
  changes: FieldChange[],
): UpdateStationResult {
  recordAudit({
    identity: input.identity,
    stationId: row ? Number(row.id) : input.stationId,
    stationName: row ? asText(row['站名']) : `编号 ${input.stationId}`,
    stationDistrict: row ? asText(row['所属片区']) : '—',
    source: input.source,
    action: 'update-station',
    accepted: false,
    reason,
    detail: message,
    changes,
    expectedVersion: input.expectedVersion,
    actualVersion: row?.version,
  }, input.at)
  return { ok: false, message, reason }
}

// 改动泵站档案的唯一入口。先校验、后落档；任何挡回都写审计。
export function updateStation(input: UpdateStationInput): UpdateStationResult {
  ensureLegacyMigrated()
  const rows = stations()
  const row = findStation(rows, input.stationId)
  const sourceLabel = input.source === 'list' ? '列表' : '详情'
  const patch = input.patch

  if (!row) {
    const message = `没有找到编号为 ${input.stationId} 的排水泵站`
    return recordRejection(input, null, 'station-not-found', message, [])
  }

  const changes = diffPatch(row, patch)
  const operatorDistrict = asText(input.identity.district)
  const stationDistrict = asText(row['所属片区'])
  const stationName = asText(row['站名'])

  // 已停用的站整条受控、只读：连本片区也不能改动，更不能从停用改回别的状态。
  if (isDecommissioned(row)) {
    const fields = changes.map((item) => item.field).join('、') || '档案'
    const message =
      `「${stationName}」已停用，整条站档受控只读，任何片区（含本片区 ${stationDistrict}）都不得改动` +
      (changes.length ? `，本次${sourceLabel}提交想动的是：${fields}` : '')
    return recordRejection(input, row, 'station-decommissioned', message, changes)
  }

  // 归属口径：每座站的归属只算它所在的片区，只有本片区的人能改受保护字段。
  if (operatorDistrict !== stationDistrict) {
    const touched = GUARDED_FIELDS.filter((field) => patch[field] !== undefined)
    const fields = touched.join('、') || '受保护字段'
    const message =
      `越权挡回（${sourceLabel}入口）：操作人 ${input.identity.operator} 属「${operatorDistrict}」，` +
      `泵站「${stationName}」归属「${stationDistrict}」，跨片区不得改动 ${fields}`
    return recordRejection(input, row, 'cross-district', message, changes)
  }

  // 同一座站重复/并发提交：只接受先到的一版，后到者按版本冲突挡回。
  if (Number(input.expectedVersion) !== Number(row.version)) {
    const message =
      `提交已过期（${sourceLabel}入口）：「${stationName}」先到的一版（v${row.version}）已经落档，` +
      `你手里还是 v${input.expectedVersion}，本次重复提交不予接受；请重新读取后再改`
    const result = recordRejection(input, row, 'version-conflict', message, changes)
    result.latestChange = {
      operator: input.identity.operator,
      at: input.at ?? Date.now(),
      source: input.source,
    }
    return result
  }

  // 同一片区下站名不能重名：改片区时按目标片区查重；重号挡回并指出跟谁撞了。
  const nextName = patch['站名'] !== undefined ? String(patch['站名']).trim() : stationName
  const nextDistrict =
    patch['所属片区'] !== undefined ? String(patch['所属片区']).trim() : stationDistrict
  if (nextName) {
    const collision = rows.find(
      (other) =>
        Number(other.id) !== Number(row.id) &&
        asText(other['所属片区']) === nextDistrict &&
        asText(other['站名']) === nextName,
    )
    if (collision) {
      const message =
        `重名挡回（${sourceLabel}入口）：片区「${nextDistrict}」下站名「${nextName}」已被占用，` +
        `与编号 ${collision.id} 的「${asText(collision['站名'])}」撞号；同一片区站名必须唯一`
      const result = recordRejection(input, row, 'duplicate-name', message, changes)
      result.conflictStation = {
        id: Number(collision.id),
        name: asText(collision['站名']),
        district: nextDistrict,
      }
      return result
    }
  }

  if (changes.length === 0) {
    const message = `「${stationName}」提交内容与现值一致，没有需要落档的改动`
    recordAudit({
      identity: input.identity,
      stationId: Number(row.id),
      stationName,
      stationDistrict,
      source: input.source,
      action: 'update-station',
      accepted: true,
      detail: message,
      changes: [],
      expectedVersion: input.expectedVersion,
      actualVersion: row.version,
    }, input.at)
    return { ok: true, message, station: row, version: Number(row.version) }
  }

  const updated: EntryRow = { ...row }
  for (const item of changes) {
    updated[item.field] = item.to
  }
  updated.version = Number(row.version) + 1
  const next = [...rows]
  next[rows.indexOf(row)] = updated
  persist(next)

  const summary = changes.map((item) => `${item.field}：${item.from} → ${item.to}`).join('；')
  const message =
    `「${stationName}」改动已落档（v${updated.version}，${sourceLabel}入口）：${summary}`
  recordAudit({
    identity: input.identity,
    stationId: Number(row.id),
    stationName,
    stationDistrict,
    source: input.source,
    action: 'update-station',
    accepted: true,
    detail: message,
    changes,
    expectedVersion: input.expectedVersion,
    actualVersion: updated.version,
  }, input.at)
  return { ok: true, message, station: updated, version: Number(updated.version) }
}

type ChangeStatusInput = {
  identity: Identity
  stationId: number
  action: string
  target: string
  source: SubmitSource
  at?: number
}

type ChangeStatusResult = {
  ok: boolean
  message: string
  reason?: RejectReason
  station?: EntryRow
  version?: number
}

// 状态流转同样过数据层：已停用站整档只读，任何「复活」尝试都挡回并留痕。
export function changeStationStatus(input: ChangeStatusInput): ChangeStatusResult {
  ensureLegacyMigrated()
  const rows = stations()
  const row = findStation(rows, input.stationId)
  const sourceLabel = input.source === 'list' ? '列表' : '详情'

  if (!row) {
    const message = `没有找到编号为 ${input.stationId} 的排水泵站`
    recordAudit({
      identity: input.identity,
      stationId: input.stationId,
      stationName: `编号 ${input.stationId}`,
      stationDistrict: '—',
      source: input.source,
      action: 'change-status',
      accepted: false,
      reason: 'station-not-found',
      detail: message,
    }, input.at)
    return { ok: false, message, reason: 'station-not-found' }
  }

  const stationName = asText(row['站名'])
  const stationDistrict = asText(row['所属片区'])

  if (isDecommissioned(row)) {
    const message =
      `「${stationName}」已停用，整条站档受控只读，操作「${input.action}」被挡回（${sourceLabel}入口），` +
      `本片区 ${stationDistrict} 也不能改动`
    recordAudit({
      identity: input.identity,
      stationId: Number(row.id),
      stationName,
      stationDistrict,
      source: input.source,
      action: 'change-status',
      accepted: false,
      reason: 'station-decommissioned',
      detail: message,
      actualVersion: row.version,
    }, input.at)
    return { ok: false, message, reason: 'station-decommissioned' }
  }

  if (asText(row.status) === asText(input.target)) {
    const message = `「${stationName}」已经是「${input.target}」，不用重复操作`
    return { ok: true, message, station: row, version: Number(row.version) }
  }

  const updated: EntryRow = {
    ...row,
    status: input.target,
    pending: input.target !== STATION_STATUS_DECOMMISSIONED,
    abnormal: false,
    version: Number(row.version) + 1,
  }
  const next = [...rows]
  next[rows.indexOf(row)] = updated
  persist(next)

  const message = `「${stationName}」已${input.action}，当前状态「${input.target}」（v${updated.version}）`
  recordAudit({
    identity: input.identity,
    stationId: Number(row.id),
    stationName,
    stationDistrict,
    source: input.source,
    action: 'change-status',
    accepted: true,
    detail: message,
    changes: [{ field: 'status', from: asText(row.status), to: input.target }],
    expectedVersion: row.version,
    actualVersion: updated.version,
  }, input.at)
  return { ok: true, message, station: updated, version: Number(updated.version) }
}

// 概览口径：装机台数按各站当前归属实时聚合。被挡回的改动没落档，自然不会串进统计。
export function installedByDistrict(): DistrictInstall[] {
  ensureLegacyMigrated()
  const byDistrict = new Map<string, DistrictInstall>()
  for (const row of stations()) {
    const district = asText(row['所属片区']) || '未划分片区'
    const item =
      byDistrict.get(district) ??
      { district, stations: 0, installed: 0, decommissioned: 0, decommissionedUnits: 0 }
    item.stations += 1
    const units = Number(row['装机台数'])
    const count = Number.isFinite(units) ? units : 0
    item.installed += count
    if (isDecommissioned(row)) {
      item.decommissioned += 1
      item.decommissionedUnits += count
    }
    byDistrict.set(district, item)
  }
  return [...byDistrict.values()].sort((a, b) => a.district.localeCompare(b.district, 'zh-Hans-CN'))
}

// 审计倒查经数据层导出，页面不直接碰审计存储。
export function stationAudit(filter?: Parameters<typeof listAudit>[0]): AuditEntry[] {
  ensureLegacyMigrated()
  return listAudit(filter)
}
