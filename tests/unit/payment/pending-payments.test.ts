import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  forgetSessionPayments,
  getPending,
  PENDING_KEY,
  prunePending,
  removePending,
  savePending,
  type PendingPayment,
} from '@/features/payment/pending-payments'

// The payment context kept before the browser leaves for a bank (Plan 4 Global Constraints):
// `ff-pending-payments` in localStorage, by payment uuid, for the result page (Task 5) to find
// the order again; entries older than 7 days go. A storage that refuses never throws. Each says
// whether it was saved with a session (the flag cookie then): a logout forgets those, and the
// entries kept before that mark (whose they are cannot be told), never a guest's (final fix wave).

const DAY = 24 * 60 * 60 * 1000
const NOW = Date.parse('2026-10-18T06:00:00+03:30')

const entry = (changes: Partial<PendingPayment> = {}): PendingPayment => ({
  kind: 'order',
  orderCode: '5592580094',
  linkToken: 'ubiClbz6wHu1G-pJ9F98soBsfDqrITpZULlnO_4bi3U',
  route: 'bank_gateway',
  amount: 1_049_000,
  startedAt: NOW,
  ...changes,
})

function flagCookie(present: boolean) {
  document.cookie = present ? 'ff_auth=login-a-0123456789; path=/' : 'ff_auth=; max-age=0; path=/'
}

beforeEach(() => localStorage.clear())
afterEach(() => {
  vi.restoreAllMocks()
  flagCookie(false)
})

describe('pending payments', () => {
  it('saves an entry by payment uuid and reads it back', () => {
    expect(savePending('uuid-1', entry())).toBe(true)
    expect(getPending('uuid-1')).toEqual({ ...entry(), session: false })
    expect(getPending('uuid-2')).toBeNull()
    expect(JSON.parse(localStorage.getItem(PENDING_KEY)!)).toEqual({
      'uuid-1': { ...entry(), session: false },
    })
  })

  it('prunePending drops entries older than 7 days', () => {
    // Saved a week ago and more: each save prunes at its own moment.
    vi.spyOn(Date, 'now').mockReturnValue(NOW - 8 * DAY)
    savePending('old', entry({ startedAt: NOW - 7 * DAY - 1 }))
    savePending('edge', entry({ startedAt: NOW - 7 * DAY }))
    savePending('new', entry({ startedAt: NOW - DAY }))
    prunePending(NOW)
    expect(getPending('old')).toBeNull()
    expect(getPending('edge')).not.toBeNull()
    expect(getPending('new')).not.toBeNull()
  })

  it('a save prunes first; a removal forgets one entry', () => {
    vi.spyOn(Date, 'now').mockReturnValue(NOW)
    localStorage.setItem(
      PENDING_KEY,
      JSON.stringify({ stale: entry({ startedAt: NOW - 8 * DAY }) }),
    )
    savePending('fresh', entry())
    expect(Object.keys(JSON.parse(localStorage.getItem(PENDING_KEY)!))).toEqual(['fresh'])
    removePending('fresh')
    expect(getPending('fresh')).toBeNull()
  })

  it('malformed storage reads as empty, and a refusing storage never throws', () => {
    localStorage.setItem(PENDING_KEY, '{not json')
    expect(getPending('x')).toBeNull()
    localStorage.setItem(PENDING_KEY, JSON.stringify({ bad: { kind: 'order' }, list: [1] }))
    expect(getPending('bad')).toBeNull()
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('quota', 'QuotaExceededError')
    })
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('denied', 'SecurityError')
    })
    expect(savePending('uuid-1', entry())).toBe(false)
    expect(getPending('uuid-1')).toBeNull()
    expect(() => prunePending(NOW)).not.toThrow()
    expect(() => removePending('uuid-1')).not.toThrow()
  })
})

describe('whose they are: a logout forgets the session’s', () => {
  it('saved while signed in (the flag cookie set): the session’s; without it: a guest’s', () => {
    flagCookie(true)
    savePending('uuid-signed-in', entry())
    flagCookie(false)
    savePending('uuid-guest', entry())
    expect(getPending('uuid-signed-in')?.session).toBe(true)
    expect(getPending('uuid-guest')?.session).toBe(false)
  })

  it('forgets the session’s and the ones kept before the mark; a guest’s stay', () => {
    const now = Date.now()
    localStorage.setItem(
      PENDING_KEY,
      JSON.stringify({
        mine: entry({ startedAt: now, session: true }),
        guest: entry({ startedAt: now, session: false }),
        'old-topup': { kind: 'topup', route: 'bank_gateway', amount: 50_000, startedAt: now },
        'old-link': entry({ startedAt: now }),
      }),
    )
    forgetSessionPayments()
    expect(Object.keys(JSON.parse(localStorage.getItem(PENDING_KEY)!) as object)).toEqual(['guest'])
  })

  it('nothing to forget, or a storage that refuses: never throws', () => {
    expect(() => forgetSessionPayments()).not.toThrow()
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('denied', 'SecurityError')
    })
    expect(() => forgetSessionPayments()).not.toThrow()
  })
})
