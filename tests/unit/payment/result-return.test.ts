import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  readReturn,
  rememberReturn,
  RETURN_KEY,
  scrubbedPath,
} from '@/features/payment/result-return'
import { PAYMENT_UUID } from './fixtures'

// The bank's return to `/payment/callback/` (order digest §4.2): `result`, `payment` (a bearer
// credential) and `code` from the query. The uuid is kept for this tab (sessionStorage) and taken
// out of the address bar; a reload of the address left reads it back from there.

beforeEach(() => sessionStorage.clear())

const search = (query: string) => ({ search: query })

describe('readReturn', () => {
  it('reads the three values the backend adds', () => {
    expect(
      readReturn(search(`?result=failed&payment=${PAYMENT_UUID}&code=gateway_rejected`)),
    ).toEqual({ payment: PAYMENT_UUID, result: 'failed', code: 'gateway_rejected' })
  })

  it('takes no uuid, result or code of the wrong shape', () => {
    expect(readReturn(search('?result=maybe&payment=../x&code=<b>'))).toEqual({
      payment: null,
      result: null,
      code: null,
    })
  })

  it('a return without a payment (an unknown callback) has none', () => {
    expect(readReturn(search('?result=failed&code=gateway_callback_invalid')).payment).toBeNull()
  })
})

describe('the uuid kept, the address scrubbed', () => {
  it('the address keeps the result and the code only', () => {
    const ret = readReturn(search(`?result=success&payment=${PAYMENT_UUID}`))
    expect(scrubbedPath(ret)).toBe('/payment/callback/?result=success')
    const failed = readReturn(
      search(`?payment=${PAYMENT_UUID}&result=failed&code=gateway_rejected`),
    )
    expect(scrubbedPath(failed)).toBe('/payment/callback/?result=failed&code=gateway_rejected')
    expect(scrubbedPath({ payment: PAYMENT_UUID, result: null, code: null })).toBe(
      '/payment/callback/',
    )
  })

  it('a reload of the scrubbed address reads the uuid back from this tab', () => {
    const ret = readReturn(
      search(`?result=pending&payment=${PAYMENT_UUID}&code=gateway_verification_pending`),
    )
    rememberReturn(ret)
    expect(sessionStorage.getItem(RETURN_KEY)).toContain(PAYMENT_UUID)
    const reloaded = readReturn(search('?result=pending&code=gateway_verification_pending'))
    expect(reloaded).toEqual(ret)
  })

  it('another return in this tab never takes the kept uuid', () => {
    rememberReturn(readReturn(search(`?result=success&payment=${PAYMENT_UUID}`)))
    expect(readReturn(search('?result=failed&code=gateway_callback_invalid')).payment).toBeNull()
  })

  it('a new payment in the address replaces the kept one', () => {
    rememberReturn(readReturn(search(`?result=success&payment=${PAYMENT_UUID}`)))
    const other = '7d3c1a52-9a0e-4c4b-b5e0-0d2f3b1c9a77'
    expect(readReturn(search(`?result=success&payment=${other}`)).payment).toBe(other)
  })

  it('a storage that refuses: the page still works, a reload just finds nothing', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota')
    })
    expect(() =>
      rememberReturn(readReturn(search(`?result=success&payment=${PAYMENT_UUID}`))),
    ).not.toThrow()
    expect(readReturn(search('?result=success')).payment).toBeNull()
    vi.restoreAllMocks()
  })
})
