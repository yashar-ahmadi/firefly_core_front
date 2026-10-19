import 'server-only'
import { readFileSync } from 'node:fs'
import path from 'node:path'

// The running build's id, the service worker's version (its caches are named after it): Next
// writes it to `.next/BUILD_ID`, which the standalone output keeps beside `server.js` (the
// server's working directory) as `next start` has it in the project. Read once per process.

const BUILD_ID = /^[\w-]{1,64}$/
const FALLBACK = 'development'

/** The id `read` returns, trimmed; "development" when there is none or it is not an id. */
export function readBuildVersion(read: () => string): string {
  try {
    const id = read().trim()
    return BUILD_ID.test(id) ? id : FALLBACK
  } catch {
    return FALLBACK
  }
}

let version: string | null = null

export function buildVersion(): string {
  version ??= readBuildVersion(() =>
    readFileSync(path.join(process.cwd(), '.next', 'BUILD_ID'), 'utf8'),
  )
  return version
}
