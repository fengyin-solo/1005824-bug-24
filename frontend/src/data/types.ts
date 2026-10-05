/** 纯前端数据层的公共类型：与全栈版后端返回的结构保持一致，换回后端时页面不用改。 */

export type EntryRow = {
  id: number
  status: string
  pending: boolean
  abnormal: boolean
  /** 档案版本号：每次受控改动 +1，提交时必须带上读到的版本，后到的提交按冲突挡回。 */
  version?: number
  /** 兼容既有归属：老档案迁移补登版本号时打标，业务取值仍保持建账当时的值。 */
  legacy?: boolean
  [field: string]: string | number | boolean | undefined
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

/** 提交入口：列表行内改动与详情页改动走同一个数据层函数，规则只在这里判一次。 */
export type SubmitSource = 'list' | 'detail'

/** 操作人身份：归属校验只认这里的片区，页面选择后显式传进数据层。 */
export type Identity = {
  operator: string
  district: string
}

/** 泵站档案中受归属保护的字段，只有本片区能改。 */
export type StationPatch = {
  站名?: string
  所属片区?: string
  设计流量?: string
}

/** 挡回原因：页面按这个码展示文案，审计里也按码倒查。 */
export type RejectReason =
  | 'station-not-found'
  | 'station-decommissioned'
  | 'cross-district'
  | 'version-conflict'
  | 'duplicate-name'
  | 'unknown-action'

export type FieldChange = {
  field: string
  from: string | number
  to: string | number
}

export type UpdateStationInput = {
  identity: Identity
  stationId: number
  patch: StationPatch
  /** 提交方打开档案时读到的版本；与现值不一致即过期提交，只接受先到的一版。 */
  expectedVersion: number
  source: SubmitSource
  at?: number
}

export type UpdateStationResult = {
  ok: boolean
  message: string
  reason?: RejectReason
  /** 重名挡回时，指出跟哪一座站撞了。 */
  conflictStation?: { id: number; name: string; district: string }
  /** 版本冲突时，指出先到的一版是谁、什么时候、从哪个入口落的。 */
  latestChange?: { operator: string; at: number; source: SubmitSource | 'system' }
  station?: EntryRow
  version?: number
}

/** 审计记录：被挡下的尝试也必须能倒查「谁、什么时候、想动哪一座站」。 */
export type AuditEntry = {
  id: number
  at: number
  operator: string
  operatorDistrict: string
  stationId: number | null
  stationName: string
  stationDistrict: string
  source: SubmitSource | 'system'
  action: 'update-station' | 'change-status' | 'migrate-legacy'
  accepted: boolean
  reason?: RejectReason
  detail: string
  changes?: FieldChange[]
  expectedVersion?: number
  actualVersion?: number
}

/** 概览看板：片区装机台数按各站当前归属实时重算。 */
export type DistrictInstall = {
  district: string
  stations: number
  installed: number
  decommissioned: number
  decommissionedUnits: number
}

export type OverviewResult = {
  cards: { label: string; value: number }[]
  modules: { name: string; created: number; pending: number; abnormal: number }[]
  pumpDistricts: DistrictInstall[]
  pumpInstalledTotal: number
}
