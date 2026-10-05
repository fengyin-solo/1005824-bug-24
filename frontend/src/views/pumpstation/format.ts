import type { RejectReason, SubmitSource } from '@/data/types'

// 数据层返回的是机器可读的码，这里集中翻成人看的中文。
export function formatTime(at: number): string {
  const date = new Date(at)
  const pad = (value: number) => String(value).padStart(2, '0')
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ` +
    `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
  )
}

export function sourceLabel(source: SubmitSource | 'system'): string {
  if (source === 'list') return '列表'
  if (source === 'detail') return '详情'
  return '系统'
}

export const REJECT_LABELS: Record<RejectReason, string> = {
  'station-not-found': '站档不存在',
  'station-decommissioned': '已停用只读',
  'cross-district': '跨片区越权',
  'version-conflict': '版本冲突/重复提交',
  'duplicate-name': '同片区站名重复',
  'unknown-action': '未登记动作',
}
