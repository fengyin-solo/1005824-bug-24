import { SEED_ROWS } from './seed'
import type { EntryRow } from './types'

// 本地持久化：数据放在 localStorage 里，刷新、关掉再打开都还在。
const STORAGE_KEY = 'drainage-pump:entries'
// 数据层自己用的元信息（迁移标记、审计序号等），跟业务数据分开存。
const META_KEY = 'drainage-pump:meta'

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function readStorage(): Record<string, EntryRow[]> {
  const fallback = clone(SEED_ROWS)
  if (typeof window === 'undefined' || !window.localStorage) {
    return fallback
  }
  const raw = window.localStorage.getItem(STORAGE_KEY)
  if (!raw) {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(fallback))
    return fallback
  }
  try {
    const parsed = JSON.parse(raw) as Record<string, EntryRow[]>
    return { ...fallback, ...parsed }
  } catch {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(fallback))
    return fallback
  }
}

let cache: Record<string, EntryRow[]> | null = null

export function allRows(): Record<string, EntryRow[]> {
  if (cache === null) {
    cache = readStorage()
  }
  return cache
}

export function listRows(key: string): EntryRow[] {
  return allRows()[key] ?? []
}

export function saveRows(key: string, rows: EntryRow[]): void {
  const next = { ...allRows(), [key]: rows }
  cache = next
  if (typeof window !== 'undefined' && window.localStorage) {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  }
}

export function resetRows(key: string): EntryRow[] {
  const rows = clone(SEED_ROWS[key] ?? [])
  saveRows(key, rows)
  return rows
}

export function storageKey(): string {
  return STORAGE_KEY
}

function readMeta(): Record<string, unknown> {
  if (typeof window === 'undefined' || !window.localStorage) {
    return {}
  }
  try {
    return JSON.parse(window.localStorage.getItem(META_KEY) ?? '{}') as Record<string, unknown>
  } catch {
    return {}
  }
}

export function getMeta<T>(key: string): T | null {
  const value = readMeta()[key]
  return value === undefined ? null : (value as T)
}

export function setMeta(key: string, value: unknown): void {
  if (typeof window === 'undefined' || !window.localStorage) {
    return
  }
  const next = readMeta()
  next[key] = value
  window.localStorage.setItem(META_KEY, JSON.stringify(next))
}
