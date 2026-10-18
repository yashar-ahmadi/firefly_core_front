// Web storage that never throws: a private window, a full quota or blocked site data make a read
// come back empty and a write report false, and the page goes on without it. Values are JSON;
// what comes back is `unknown`, for the caller to check field by field. Pure: safe in any bundle
// (no storage on the server: reads are empty there).

export type StorageArea = 'local' | 'session'

function storage(area: StorageArea): Storage {
  return area === 'local' ? window.localStorage : window.sessionStorage
}

/** The stored text, or null (none, no storage, or a storage that refuses). */
export function readText(area: StorageArea, key: string): string | null {
  try {
    return storage(area).getItem(key)
  } catch {
    return null
  }
}

/** Stores `text` (null removes it); false when the storage refused. */
export function writeText(area: StorageArea, key: string, text: string | null): boolean {
  try {
    if (text === null) storage(area).removeItem(key)
    else storage(area).setItem(key, text)
    return true
  } catch {
    return false
  }
}

/** The stored value parsed, or null (none, malformed, refused). */
export function readJson(area: StorageArea, key: string): unknown {
  const text = readText(area, key)
  if (text === null) return null
  try {
    return JSON.parse(text) as unknown
  } catch {
    return null
  }
}

/** Stores `value` as JSON; false when the storage refused. */
export function writeJson(area: StorageArea, key: string, value: unknown): boolean {
  return writeText(area, key, JSON.stringify(value))
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
