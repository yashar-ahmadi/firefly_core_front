import { describe, expect, it } from 'vitest'
import { isFullRun, ledgerWait, ledgerVerdict, WINDOW_MS } from '../../e2e/support/anon-budget'

// The backend's anonymous budget across full runs (Plan 4 Task 10 fix round): THROTTLE_ANON is
// 2000 an hour per address, and the API says nothing of what is left before it refuses. A full
// run made about 700 anonymous calls then; since Plan 5 it makes about 1,400 (Plan 5 Task 9: two
// runs back to back met 429 seven minutes into the second). So the global setup keeps the start
// of every full run, and the next waits until the last one is an hour old.

const MIN = 60_000
const NOW = Date.parse('2026-10-19T04:00:00Z')

describe('isFullRun', () => {
  const cli = (...args: string[]) => ['node', '/x/playwright/cli.js', 'test', ...args]

  it('the whole suite: `playwright test`, options that filter nothing', () => {
    expect(isFullRun(cli())).toBe(true)
    expect(isFullRun(cli('--reporter', 'list', '--workers=2'))).toBe(true)
    expect(isFullRun(cli('-j', '3', '--retries=1'))).toBe(true)
  })

  it('a filtered run: files, a project, a grep, the last failures', () => {
    expect(isFullRun(cli('tests/e2e/checkout/guest-cod.spec.ts'))).toBe(false)
    expect(isFullRun(cli('guest-cod'))).toBe(false)
    expect(isFullRun(cli('--project=journeys', '--no-deps'))).toBe(false)
    expect(isFullRun(cli('--project', 'desktop'))).toBe(false)
    expect(isFullRun(cli('-g', 'wallet'))).toBe(false)
    expect(isFullRun(cli('--grep=wallet'))).toBe(false)
    expect(isFullRun(cli('--last-failed'))).toBe(false)
  })
})

describe('ledgerWait', () => {
  it('no full run in the past hour: go on', () => {
    expect(ledgerWait([], NOW)).toBeNull()
    expect(ledgerWait([NOW - 70 * MIN, NOW - 65 * MIN], NOW)).toBeNull()
    expect(ledgerWait([NOW - WINDOW_MS], NOW)).toBeNull()
  })

  it('one within the hour: wait until it has left it (two do not fit the budget)', () => {
    expect(ledgerWait([NOW - 10 * MIN], NOW)).toBe(50 * 60)
    expect(ledgerWait([NOW - 70 * MIN, NOW - 40 * MIN], NOW)).toBe(20 * 60)
  })

  it('two within the hour: until the later one has left it', () => {
    expect(ledgerWait([NOW - 40 * MIN, NOW - 20 * MIN], NOW)).toBe(40 * 60)
    expect(ledgerWait([NOW - 20 * MIN, NOW - 40 * MIN], NOW)).toBe(40 * 60)
  })

  it('a larger budget lets more runs through', () => {
    const starts = [NOW - 40 * MIN, NOW - 20 * MIN]
    expect(ledgerWait(starts, NOW, { budget: 20_000, perRun: 1_400 })).toBeNull()
    expect(ledgerWait([NOW - 20 * MIN], NOW, { budget: 2_000, perRun: 700 })).toBeNull()
  })
})

describe('ledgerVerdict', () => {
  it('the message: the runs seen, the wait in seconds, the way to skip it', () => {
    const message = ledgerVerdict([NOW - 20 * MIN], NOW)!
    expect(message).toMatch(/1 full run started in the past hour/)
    expect(message).toMatch(/about 1400 anonymous API calls/)
    expect(message).toMatch(/Wait 2400 s/)
    expect(message).toMatch(/E2E_SKIP_ANON_LEDGER=1/)
    expect(ledgerVerdict([NOW - WINDOW_MS - 1], NOW)).toBeNull()
  })
})
