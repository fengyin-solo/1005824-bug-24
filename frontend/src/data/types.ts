/** 纯前端数据层的公共类型：与全栈版后端返回的结构保持一致，换回后端时页面不用改。 */

export type EntryRow = {
  id: number
  status: string
  pending: boolean
  abnormal: boolean
  [field: string]: string | number | boolean
}

export type ModuleMeta = {
  key: string
  name: string
  entity: string
  desc: string
  fields: string[]
  statuses: string[]
  actions: string[]
  actionTargets: Record<string, string>
  metrics: string[]
}

export type PageResult = {
  items: EntryRow[]
  total: number
  page: number
  size: number
}

export type ActionResult = {
  ok: boolean
  message: string
}

/** 泵站台账允许改动的字段：站名、所属片区、设计流量，其余字段数据层一律不收。 */
export type StationChange = {
  站名?: string
  所属片区?: string
  设计流量?: string
}

/** 一次台账改动提交的操作上下文：谁、代表哪个片区、基于台账的哪个版本。 */
export type OperatorContext = {
  operator: string
  region: string
  baseRevision: number
}

/** 台账改动留痕：受理与挡回都记，谁、什么时候、想动哪一座站都能倒查。 */
export type AuditEntry = {
  id: number
  time: string
  operator: string
  operatorRegion: string
  stationId: number
  stationName: string
  attempt: string
  result: '已受理' | '已挡回'
  reason: string
}

export type OverviewResult = {
  cards: { label: string; value: number }[]
  modules: { name: string; created: number; pending: number; abnormal: number }[]
  /** 泵站装机台数按现行片区归属归集，归属口径改过之后每次统计都按新归属重算。 */
  stationRegions: { region: string; stations: number; units: number }[]
}
