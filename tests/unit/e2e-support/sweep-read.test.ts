import { afterEach, describe, expect, it, vi } from 'vitest'
import { readForSweep } from '../../e2e/support/sweep-read'

// The `kamran` guard's second read of his orders awaiting payment (Plan 4 final fix wave): after
// the test it cancels every one of them that was not there before. When that read fails the
// sweep cannot run, and an order the test placed but never handed over could stay awaiting
// payment (ruling P4-R4) unseen: the guard says so, naming the account, never an order's code,
// link or uuid.

const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
afterEach(() => warn.mockClear())

describe('readForSweep', () => {
  it('the codes read: nothing said', async () => {
    expect(await readForSweep(async () => ['1234567890'], 'k.yazdi')).toEqual(['1234567890'])
    expect(warn).not.toHaveBeenCalled()
  })

  it('a read that fails: no codes, and a warning that the sweep was skipped, naming the account', async () => {
    const failing = async (): Promise<string[]> => {
      throw new Error('his awaiting orders: 500 /api/bff/order/pay/SECRET-TOKEN/ 0404614013')
    }
    expect(await readForSweep(failing, 'k.yazdi')).toEqual([])
    expect(warn).toHaveBeenCalledTimes(1)
    const said = warn.mock.calls[0]!.join(' ')
    expect(said).toMatch(/k\.yazdi/)
    expect(said).toMatch(/skipped/)
    // Nothing from the failure itself: it could carry an order's code or link.
    expect(said).not.toMatch(/SECRET-TOKEN|0404614013|order\/pay/)
  })
})
