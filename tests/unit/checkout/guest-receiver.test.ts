import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  checkGuestReceiver,
  EMPTY_RECEIVER,
  receiverFrom,
} from '@/features/checkout/guest-receiver'
import {
  clearReceiverDraft,
  readReceiverDraft,
  RECEIVER_DRAFT_KEY,
  saveReceiverDraft,
} from '@/features/checkout/receiver-draft'

// A guest's receiver (cart digest §7.4, order digest `OrderReceiverInput`): the address book's
// checks with the postal code required, the buyer's own mobile optional; and its tab-scoped
// draft, which never throws.

const VALID = {
  ...EMPTY_RECEIVER,
  province: 8,
  city: 301,
  address: 'خیابان ولیعصر',
  postalCode: '۱۲۳۴۵-۶۷۸۹۰',
  firstName: 'سارا',
  lastName: 'احمدی',
  mobile: '+989121234501',
}

afterEach(() => {
  vi.restoreAllMocks()
  sessionStorage.clear()
})

describe('checkGuestReceiver', () => {
  it('asks for everything placement needs, the postal code included', () => {
    const errors = checkGuestReceiver(EMPTY_RECEIVER)
    expect(Object.keys(errors).sort()).toEqual(
      ['address', 'city', 'firstName', 'lastName', 'mobile', 'postalCode', 'province'].sort(),
    )
    expect(errors.postalCode).toEqual(['کد پستی را وارد کنید.'])
  })

  it('takes a printed postal code and Persian digits; the buyer’s mobile only when given', () => {
    expect(checkGuestReceiver(VALID)).toEqual({})
    expect(checkGuestReceiver({ ...VALID, postalCode: '12345' }).postalCode).toEqual([
      'کد پستی باید ۱۰ رقم باشد.',
    ])
    expect(checkGuestReceiver({ ...VALID, customerMobile: '02188776655' }).customerMobile).toEqual([
      'شمارهٔ موبایل ایران را وارد کنید؛ مانند ۰۹۱۲۱۲۳۴۵۶۷.',
    ])
    expect(checkGuestReceiver({ ...VALID, customerMobile: '۰۹۰۲۱۲۳۴۵۱۴' })).toEqual({})
  })
})

describe('the receiver draft', () => {
  it('round-trips in this tab, field by field', () => {
    saveReceiverDraft({ values: VALID, confirmed: true })
    const draft = readReceiverDraft()!
    expect(draft.confirmed).toBe(true)
    expect(receiverFrom(draft.values)).toEqual(VALID)
    clearReceiverDraft()
    expect(readReceiverDraft()).toBeNull()
  })

  it('a stored value of the wrong type is the empty one; garbage is no draft', () => {
    sessionStorage.setItem(RECEIVER_DRAFT_KEY, '{"values":{"city":"301","firstName":7}}')
    expect(receiverFrom(readReceiverDraft()!.values)).toEqual(EMPTY_RECEIVER)
    sessionStorage.setItem(RECEIVER_DRAFT_KEY, 'not json')
    expect(readReceiverDraft()).toBeNull()
  })

  it('never throws when the storage refuses (a private window, a full quota): kept in memory', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('full', 'QuotaExceededError')
    })
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('denied', 'SecurityError')
    })
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new DOMException('denied', 'SecurityError')
    })
    expect(() => saveReceiverDraft({ values: VALID, confirmed: false })).not.toThrow()
    expect(receiverFrom(readReceiverDraft()?.values)).toEqual(VALID)
    expect(() => clearReceiverDraft()).not.toThrow()
    expect(readReceiverDraft()).toBeNull()
  })
})
