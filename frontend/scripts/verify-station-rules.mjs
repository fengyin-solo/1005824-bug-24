/**
 * 数据层归属规则验证脚本（node 运行，不经过浏览器）。
 * 用 esbuild 把真实的 src 模块打成临时包并注入 localStorage 桩，
 * 逐条验证：跨片区挡回、已停用只读、重名挡回、留痕、概览重算、
 * 重复/并发先到先得、既有档案兼容、列表与详情同一口径。
 */
import { build } from 'esbuild'
import { rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const require = createRequire(import.meta.url)
const root = new URL('../', import.meta.url)
const resolve = (p) => new URL(p, root).pathname

// ---- localStorage 桩：模拟浏览器持久化 ----
function createMemoryStorage() {
  const map = new Map()
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
    clear: () => map.clear(),
    _dump: () => Object.fromEntries(map),
  }
}

const HARNESS = `
import { installedByDistrict, listStations, getStation, updateStation, changeStationStatus, stationAudit } from '@/api/station-service'
import { clearAudit } from '@/data/audit-store'
import { loadOverview } from '@/api/local-service'
globalThis.__svc = { installedByDistrict, listStations, getStation, updateStation, changeStationStatus, stationAudit, clearAudit, loadOverview }
`

const entry = resolve('node_modules/.tmp-station-harness.mjs')
writeFileSync(entry, HARNESS)

const outfile = resolve('node_modules/.tmp-station-bundle.mjs')
await build({
  entryPoints: [entry],
  bundle: true,
  format: 'esm',
  platform: 'node',
  outfile,
  alias: { '@': resolve('src') },
  logLevel: 'silent',
})

let passed = 0
let failed = 0
function check(name, cond, extra = '') {
  if (cond) {
    passed += 1
    console.log(`  ✅ ${name}`)
  } else {
    failed += 1
    console.log(`  ❌ ${name}${extra ? ` —— ${extra}` : ''}`)
  }
}

async function freshEnv() {
  globalThis.window = undefined
  const storage = createMemoryStorage()
  globalThis.window = { localStorage: storage }
  // 重新 import 一份全新的模块图，缓存随之重置。
  const mod = await import(pathToFileURL(outfile).href + `?v=${Date.now()}-${Math.random()}`)
  return { svc: globalThis.__svc, storage }
}

const EAST = { operator: '李卫东', district: '城东片区' }
const WEST = { operator: '王建国', district: '城西片区' }

console.log('\n场景1：本片区合法改动可落档（站名）')
{
  const { svc } = await freshEnv()
  const r = svc.updateStation({
    identity: EAST, stationId: 1, patch: { 站名: '城东中心泵站（改造）' },
    expectedVersion: 1, source: 'list', at: 1_800_000_000_000,
  })
  check('返回成功', r.ok === true, r.message)
  check('版本号升到 v2', r.version === 2)
  check('数据层现值已更新', svc.getStation(1)['站名'] === '城东中心泵站（改造）')
  check('审计有一条已落档记录', svc.stationAudit({ stationId: 1, acceptedOnly: true }).length >= 1)
}

console.log('\n场景2：跨片区改站名，列表与详情都被挡回，文案写明越界点')
for (const source of ['list', 'detail']) {
  const { svc } = await freshEnv()
  const before = svc.getStation(1)
  const r = svc.updateStation({
    identity: WEST, stationId: 1, patch: { 站名: '被城西改的名' },
    expectedVersion: 1, source, at: 1_800_000_001_000,
  })
  check(`[${source}] 挡回 ok=false`, r.ok === false)
  check(`[${source}] 原因=跨片区越权`, r.reason === 'cross-district')
  check(`[${source}] 文案含双方片区、操作人、入口`,
    r.message.includes('城西片区') && r.message.includes('城东片区') &&
    r.message.includes('王建国') && r.message.includes(source === 'list' ? '列表' : '详情'))
  check(`[${source}] 存储原值未被改动`, svc.getStation(1)['站名'] === before['站名'])
  const logs = svc.stationAudit({ stationId: 1, rejectedOnly: true })
  check(`[${source}] 挡回尝试已留痕（谁/何时/哪座站）`,
    logs.length === 1 && logs[0].operator === '王建国' && logs[0].at === 1_800_000_001_000)
}

console.log('\n场景3：跨片区改所属片区、设计流量同样挡回')
{
  const { svc } = await freshEnv()
  const r1 = svc.updateStation({ identity: WEST, stationId: 1, patch: { 所属片区: '城西片区' }, expectedVersion: 1, source: 'detail' })
  const r2 = svc.updateStation({ identity: WEST, stationId: 1, patch: { 设计流量: '99' }, expectedVersion: 1, source: 'list' })
  check('改片区被挡', r1.ok === false && r1.reason === 'cross-district')
  check('改流量被挡', r2.ok === false && r2.reason === 'cross-district')
  check('归属仍是城东片区', svc.getStation(1)['所属片区'] === '城东片区')
  check('设计流量未变', String(svc.getStation(1)['设计流量']) === '12.5')
}

console.log('\n场景4：已停用站整条只读，本片区也不能改，状态复活也挡')
{
  const { svc } = await freshEnv()
  const south = { operator: '陈志远', district: '城南片区' }
  const r = svc.updateStation({
    identity: south, stationId: 6, patch: { 站名: '想改老南门' },
    expectedVersion: 1, source: 'list',
  })
  check('本片区改名被挡', r.ok === false && r.reason === 'station-decommissioned')
  const s = svc.changeStationStatus({
    identity: south, stationId: 6, action: '提交投运', target: '运行中', source: 'detail',
  })
  check('停用站状态复活被挡', s.ok === false && s.reason === 'station-decommissioned')
  check('状态仍是已停用', svc.getStation(6).status === '已停用')
  check('两次尝试都留痕', svc.stationAudit({ stationId: 6, rejectedOnly: true }).length === 2)
}

console.log('\n场景5：同片区站名重名挡回，并指出跟谁撞了')
{
  const { svc } = await freshEnv()
  const r = svc.updateStation({
    identity: EAST, stationId: 2, patch: { 站名: '城东中心泵站' },
    expectedVersion: 1, source: 'list',
  })
  check('重名被挡', r.ok === false && r.reason === 'duplicate-name')
  check('指出撞的是 #1 城东中心泵站',
    r.conflictStation && r.conflictStation.id === 1 && r.conflictStation.name === '城东中心泵站')
  check('文案含撞号编号', r.message.includes('编号 1'))
  // 不同片区允许同名
  const r2 = svc.updateStation({
    identity: WEST, stationId: 3, patch: { 站名: '城东中心泵站' },
    expectedVersion: 1, source: 'detail',
  })
  check('跨片区同名不受重名限制（但城西改城西自己的站，站3在城西，同名站1在城东→允许）', r2.ok === true, r2.message)
}

console.log('\n场景6：概览装机台数按当前归属重算；被挡回的改动不影响')
{
  const { svc } = await freshEnv()
  const before = svc.installedByDistrict()
  const eastBefore = before.find((d) => d.district === '城东片区')
  check('城东片区初始 2 站 7 台', eastBefore.stations === 2 && eastBefore.installed === 7,
    JSON.stringify(eastBefore))
  // 被挡回：城西想把城东的站改成城西
  svc.updateStation({ identity: WEST, stationId: 1, patch: { 所属片区: '城西片区' }, expectedVersion: 1, source: 'list' })
  const after = svc.installedByDistrict()
  const eastAfter = after.find((d) => d.district === '城东片区')
  const westAfter = after.find((d) => d.district === '城西片区')
  check('挡回后城东仍是 7 台', eastAfter.installed === 7)
  check('挡回后城西仍是 5 台', westAfter.installed === 5)
  // 合法改片区：城东把 #2 调到城北 → 城东 4 台，城北原 3+4=7 台 + 迁入 3 台 = 10 台
  svc.updateStation({ identity: EAST, stationId: 2, patch: { 所属片区: '城北片区' }, expectedVersion: 1, source: 'detail' })
  const moved = svc.installedByDistrict()
  check('合法改片区后城东 4 台', moved.find((d) => d.district === '城东片区').installed === 4)
  check('合法改片区后城北 10 台', moved.find((d) => d.district === '城北片区').installed === 10)
  const overview = svc.loadOverview()
  check('看板总数仍守恒 = 4+5+7+10 = 26 台', overview.pumpInstalledTotal === 26, String(overview.pumpInstalledTotal))
}

console.log('\n场景7：同一座站重复/两个入口并发提交，只接受先到的一版')
{
  const { svc } = await freshEnv()
  // 两个入口都读到 v1（模拟打开了两个表单）
  const first = svc.updateStation({ identity: EAST, stationId: 1, patch: { 设计流量: '13.0' }, expectedVersion: 1, source: 'list' })
  const second = svc.updateStation({ identity: EAST, stationId: 1, patch: { 设计流量: '99.0' }, expectedVersion: 1, source: 'detail' })
  check('先到的一版落档', first.ok === true && first.version === 2)
  check('后到的一版版本冲突挡回', second.ok === false && second.reason === 'version-conflict')
  check('现值为先到版本 13.0', String(svc.getStation(1)['设计流量']) === '13.0')
  check('列表与详情读到同一份值',
    svc.listStations({}).find((r) => Number(r.id) === 1)['设计流量'] === svc.getStation(1)['设计流量'])
  // 用新版本号重提可成功
  const retry = svc.updateStation({ identity: EAST, stationId: 1, patch: { 设计流量: '14.0' }, expectedVersion: 2, source: 'detail' })
  check('刷新版本后重提成功（v3）', retry.ok === true && retry.version === 3)
}

console.log('\n场景8：既有老档案（无版本号）兼容：业务取值不动，仅补登 v1 并留迁移痕')
{
  const { storage } = await freshEnv()
  // 写入老格式数据：没有 version，且字段值是老样例
  storage.setItem('drainage-pump:entries', JSON.stringify({
    pumpstation: [{
      id: 99, status: '运行中', pending: true, abnormal: false,
      站名: '老档案站', 所属片区: '老片区', 设计流量: '5.5', 装机台数: 2,
      服务面积: '100', 投运日期: '2010-01-01', 站长: '老站长', 站点状态: '正常',
    }],
  }))
  storage.removeItem('drainage-pump:meta')
  globalThis.__svc = null
  const mod = await import(pathToFileURL(outfile).href + `?v=legacy-${Date.now()}`)
  const svc = globalThis.__svc
  const row = svc.getStation(99)
  check('业务取值保持当时不变（片区/流量/站名）',
    row['所属片区'] === '老片区' && String(row['设计流量']) === '5.5' && row['站名'] === '老档案站')
  check('补登版本号 v1', row.version === 1 && row.legacy === true)
  const migration = svc.stationAudit({}).filter((e) => e.action === 'migrate-legacy')
  check('留有一条系统迁移记录', migration.length === 1 && migration[0].accepted === true)
  // 老片区的人按既有归属即可正常改
  const r = svc.updateStation({
    identity: { operator: '老站长', district: '老片区' }, stationId: 99,
    patch: { 站名: '老档案站-改名' }, expectedVersion: 1, source: 'list',
  })
  check('既有归属可用：本片区改动成功', r.ok === true, r.message)
}

rmSync(entry, { force: true })
rmSync(outfile, { force: true })

console.log(`\n结果：${passed} 通过，${failed} 失败`)
process.exit(failed === 0 ? 0 : 1)
