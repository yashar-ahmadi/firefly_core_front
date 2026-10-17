import { describe, expect, it } from 'vitest'
import { passwordStrength } from '@/features/auth/components/password-strength'

// Guidance only (the API's validators decide): the same rules as the backend's, roughly — at
// least 8 characters, not only digits, not close to the name or the identifier.

describe('passwordStrength', () => {
  it('says nothing for an empty password', () => {
    expect(passwordStrength('')).toEqual({ level: 0, label: '', note: null })
  })

  it.each([
    ['abc', 'کوتاه‌تر از ۸ نویسه'],
    ['12345678', 'فقط عدد'],
    ['۱۲۳۴۵۶۷۸۹', 'فقط عدد'],
  ])('%s is weak (%s)', (password, note) => {
    expect(passwordStrength(password)).toEqual({ level: 1, label: 'ضعیف', note })
  })

  it('a password made of the name or the identifier is weak', () => {
    expect(passwordStrength('sara1234', ['سارا', 'sara.ahmadi@example.com'])).toEqual({
      level: 1,
      label: 'ضعیف',
      note: 'شبیه نام، ایمیل یا شمارهٔ شما',
    })
    expect(passwordStrength('Ahmadi!2024', ['sara.ahmadi@example.com']).level).toBe(1)
    expect(passwordStrength('x09121234501', ['09121234501']).level).toBe(1)
  })

  it.each([
    ['abcdefgh', 2, 'متوسط'],
    ['Firefly1', 3, 'خوب'],
    ['abcdefghijkl', 3, 'خوب'],
    ['Firefly@1234', 4, 'قوی'],
    ['رمز-عبور-تازه۱۲', 4, 'قوی'],
  ])('%s is level %i (%s)', (password, level, label) => {
    expect(passwordStrength(password)).toEqual({ level, label, note: null })
  })
})
