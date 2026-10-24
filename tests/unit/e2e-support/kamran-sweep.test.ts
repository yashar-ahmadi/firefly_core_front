import { afterEach, describe, expect, it, vi } from 'vitest'
import { sweepOrders } from '../../e2e/support/kamran-sweep'

// The `kamran` guard's sweep after a test (tests/e2e/support/kamran-guard.ts; ruling P4-R4: the
// order journeys use k.yazdi, never sara, and cancel every order they leave awaiting payment).
// It cancels every order the test handed over, and every order of his awaiting payment now that
// was not before the test (one the test placed but never handed over: an answer it did not read).
// His older orders are never touched. A second read that fails skips that part (said, the
// handed-over ones go anyway); a first read that failed leaves nothing to compare with. The
// codes it could not cancel are what it returns (the guard fails the test with them).

const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
afterEach(() => warn.mockClear())

function cancels(refused: string[] = []) {
  const cancel = vi.fn(async (code: string) => !refused.includes(code))
  return cancel
}

describe('sweepOrders', () => {
  it('cancels the handed-over orders and the new awaiting ones, never his older ones', async () => {
    const cancel = cancels()
    const left = await sweepOrders({
      placed: ['1111111111'],
      before: new Set(['9000000001', '9000000002']),
      readNow: async () => ['9000000001', '9000000002', '2222222222'],
      cancel,
    })
    expect(cancel.mock.calls.map(([code]) => code).sort()).toEqual(['1111111111', '2222222222'])
    expect(left).toEqual([])
    expect(warn).not.toHaveBeenCalled()
  })

  it('a handed-over order also awaiting payment now is cancelled once', async () => {
    const cancel = cancels()
    await sweepOrders({
      placed: ['1111111111'],
      before: new Set(),
      readNow: async () => ['1111111111'],
      cancel,
    })
    expect(cancel).toHaveBeenCalledTimes(1)
  })

  it('returns the orders it could not cancel', async () => {
    const left = await sweepOrders({
      placed: ['1111111111', '3333333333'],
      before: new Set(),
      readNow: async () => ['2222222222'],
      cancel: cancels(['3333333333', '2222222222']),
    })
    expect(left.sort()).toEqual(['2222222222', '3333333333'])
  })

  it('the second read failing: the handed-over orders go anyway, the skip said', async () => {
    const cancel = cancels()
    const left = await sweepOrders({
      placed: ['1111111111'],
      before: new Set(['9000000001']),
      readNow: async () => {
        throw new Error('500')
      },
      cancel,
    })
    expect(cancel.mock.calls.map(([code]) => code)).toEqual(['1111111111'])
    expect(left).toEqual([])
    expect(warn).toHaveBeenCalledTimes(1)
    expect(warn.mock.calls[0]!.join(' ')).toMatch(/k\.yazdi/)
  })

  it('no first read (it failed): nothing to compare with, only the handed-over orders, no second read', async () => {
    const readNow = vi.fn(async () => ['2222222222'])
    const cancel = cancels()
    await sweepOrders({ placed: ['1111111111'], before: null, readNow, cancel })
    expect(readNow).not.toHaveBeenCalled()
    expect(cancel.mock.calls.map(([code]) => code)).toEqual(['1111111111'])
  })

  it('nothing handed over and nothing new: nothing cancelled', async () => {
    const cancel = cancels()
    const left = await sweepOrders({
      placed: [],
      before: new Set(['9000000001']),
      readNow: async () => ['9000000001'],
      cancel,
    })
    expect(cancel).not.toHaveBeenCalled()
    expect(left).toEqual([])
  })
})
