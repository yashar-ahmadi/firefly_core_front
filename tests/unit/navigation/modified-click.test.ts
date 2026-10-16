import { describe, expect, it } from 'vitest'
import { errorDetail } from '@/features/cart/cart-cache'
import { ApiError, GENERIC_ERROR_DETAIL } from '@/lib/api/errors'
import { isModifiedClick } from '@/lib/navigation/modified-click'

const plain = { button: 0, metaKey: false, ctrlKey: false, shiftKey: false, altKey: false }

describe('isModifiedClick (the one copy every link takeover uses)', () => {
  it('leaves an unmodified main-button click to the code', () => {
    expect(isModifiedClick(plain)).toBe(false)
  })

  it.each([
    ['the middle button', { button: 1 }],
    ['Cmd', { metaKey: true }],
    ['Ctrl', { ctrlKey: true }],
    ['Shift', { shiftKey: true }],
    ['Alt', { altKey: true }],
  ])('leaves a click with %s to the browser', (_label, change) => {
    expect(isModifiedClick({ ...plain, ...change })).toBe(true)
  })
})

describe('the generic error sentence', () => {
  it('is the ApiError default and what a failure without one shows', () => {
    expect(new ApiError({ status: 500 }).detail).toBe(GENERIC_ERROR_DETAIL)
    expect(errorDetail(new TypeError('offline'))).toBe(GENERIC_ERROR_DETAIL)
  })
})
