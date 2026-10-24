import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

// The backend's anonymous budget across full runs (Plan 4 Task 10 fix round). THROTTLE_ANON is
// 2000 requests an hour per address on the sample backend. A full run made about 700 of them in
// Plan 4 (a third run within an hour met 429 midway); Plan 5's specs (the blog, content pages,
// contact, the audits, the PWA: mostly a guest's pages) took it to about 1,400 (Plan 5 Task 9: a
// second run started 16 minutes after the first met 429 seven minutes in, the bucket full with
// about 3,800 requests of both in it, so about 53% of a run's 2,700 are anonymous). One full run
// an hour, then: the next waits until the last one is an hour old. The API says
// nothing of what is left before it refuses (no rate-limit headers; its counters live in the
// server's memory), so the global setup keeps the start of every full run in a ledger on disk and
// stops a full run at once when the full runs of the past hour leave too little for it ("wait N
// s"). Other traffic (a focused run, browsing) is not counted: the probe's 429 catches an
// exhausted budget still. `E2E_SKIP_ANON_LEDGER=1` skips it (a budget known to be free).

export const ANON_BUDGET = 2000
export const FULL_RUN_ANON = 1400
export const WINDOW_MS = 3_600_000

/** Options that filter the suite (a project, a grep, a shard, the last failures). */
const FILTERS = /^(?:--project|-g|--grep|--grep-invert|--last-failed|--only-changed|--shard)(?:=|$)/
/** Options whose value is the next argument (and filters nothing). */
const TAKES_VALUE = new Set([
  '-c',
  '--config',
  '--reporter',
  '-j',
  '--workers',
  '--retries',
  '--timeout',
  '--max-failures',
  '--output',
  '--repeat-each',
  '--global-timeout',
  '--trace',
  '--tsconfig',
  '--browser',
])

/** Whether the command line runs the whole suite (no file, project, grep or other filter). */
export function isFullRun(argv: readonly string[]): boolean {
  const at = argv.indexOf('test')
  const args = at >= 0 ? argv.slice(at + 1) : argv.slice(2)
  for (let index = 0; index < args.length; index++) {
    const arg = args[index]!
    if (FILTERS.test(arg)) return false
    if (TAKES_VALUE.has(arg)) index++
    else if (!arg.startsWith('-')) return false
  }
  return true
}

/** Seconds to wait before one more full run fits the budget (null: it fits now). */
export function ledgerWait(
  starts: readonly number[],
  now: number,
  { budget = ANON_BUDGET, perRun = FULL_RUN_ANON } = {},
): number | null {
  const recent = starts.filter((start) => now - start < WINDOW_MS).sort((a, b) => a - b)
  const others = Math.max(0, Math.floor(budget / perRun) - 1)
  if (recent.length <= others) return null
  const until = recent[recent.length - others - 1]! + WINDOW_MS
  return Math.ceil((until - now) / 1000)
}

/** The message that stops a full run (null: go on). */
export function ledgerVerdict(starts: readonly number[], now: number): string | null {
  const wait = ledgerWait(starts, now)
  if (wait === null) return null
  const recent = starts.filter((start) => now - start < WINDOW_MS)
  return [
    `${recent.length} full run${recent.length === 1 ? '' : 's'} started in the past hour on this machine; with about`,
    `${FULL_RUN_ANON} anonymous API calls each, one more would use up the backend's`,
    `${ANON_BUDGET} an hour per address (THROTTLE_ANON) midway. Wait ${wait} s, or set`,
    'E2E_SKIP_ANON_LEDGER=1 when the budget is known to be free. See docs/ARCHITECTURE.md',
    '(Testing).',
  ].join(' ')
}

/** The ledger's starts (none when it is missing or unreadable). */
export async function readStarts(file: string): Promise<number[]> {
  try {
    const starts: unknown = JSON.parse(await readFile(file, 'utf8'))
    return Array.isArray(starts) ? starts.filter((start) => typeof start === 'number') : []
  } catch {
    return []
  }
}

/** This run's start added, the ones older than the hour dropped. */
export async function recordStart(file: string, starts: readonly number[], now: number) {
  await mkdir(path.dirname(file), { recursive: true })
  const kept = starts.filter((start) => now - start < WINDOW_MS)
  await writeFile(file, JSON.stringify([...kept, now]))
}
