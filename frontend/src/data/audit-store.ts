import { getMeta, setMeta } from './local-store'
import type { AuditEntry, FieldChange, Identity, RejectReason, SubmitSource } from './types'

// 审计留痕单独存一份：接受的、挡回的尝试都写，谁、什么时候、想动哪座站都能倒查。
const AUDIT_KEY = 'pumpstation:audit-log'
const AUDIT_SEQ_KEY = 'pumpstation:audit-seq'

type AuditDraft = {
  identity: Identity | null
  stationId: number | null
  stationName: string
  stationDistrict: string
  source: SubmitSource | 'system'
  action: AuditEntry['action']
  accepted: boolean
  reason?: RejectReason
  detail: string
  changes?: FieldChange[]
  expectedVersion?: number
  actualVersion?: number
}

function readLog(): AuditEntry[] {
  return getMeta<AuditEntry[]>(AUDIT_KEY) ?? []
}

function writeLog(entries: AuditEntry[]): void {
  setMeta(AUDIT_KEY, entries)
}

export function recordAudit(draft: AuditDraft, at: number = Date.now()): AuditEntry {
  const seq = (getMeta<number>(AUDIT_SEQ_KEY) ?? 0) + 1
  setMeta(AUDIT_SEQ_KEY, seq)
  const entry: AuditEntry = {
    id: seq,
    at,
    operator: draft.identity?.operator ?? '系统',
    operatorDistrict: draft.identity?.district ?? '系统',
    stationId: draft.stationId,
    stationName: draft.stationName,
    stationDistrict: draft.stationDistrict,
    source: draft.source,
    action: draft.action,
    accepted: draft.accepted,
    reason: draft.reason,
    detail: draft.detail,
    changes: draft.changes,
    expectedVersion: draft.expectedVersion,
    actualVersion: draft.actualVersion,
  }
  // 新记录放最前，页面上最近的尝试排最上面。
  writeLog([entry, ...readLog()])
  return entry
}

export type AuditFilter = {
  stationId?: number
  acceptedOnly?: boolean
  rejectedOnly?: boolean
}

export function listAudit(filter: AuditFilter = {}): AuditEntry[] {
  return readLog().filter((entry) => {
    if (filter.stationId !== undefined && entry.stationId !== filter.stationId) {
      return false
    }
    if (filter.acceptedOnly && !entry.accepted) {
      return false
    }
    if (filter.rejectedOnly && entry.accepted) {
      return false
    }
    return true
  })
}

export function clearAudit(): void {
  writeLog([])
  setMeta(AUDIT_SEQ_KEY, 0)
}
