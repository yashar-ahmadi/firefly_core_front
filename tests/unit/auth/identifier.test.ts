import { describe, expect, it } from 'vitest'
import { identifierType, normalizeIdentifier } from '@/features/auth/identifier'

describe('identifierType', () => {
  it.each([
    '09121234567',
    '\u{06F0}\u{06F9}\u{06F1}\u{06F2}\u{06F1}\u{06F2}\u{06F3}\u{06F4}\u{06F5}\u{06F6}\u{06F7}',
    // Arabic-Indic digits, as some keyboards type them.
    '\u{0660}\u{0669}\u{0661}\u{0662}\u{0661}\u{0662}\u{0663}\u{0664}\u{0665}\u{0666}\u{0667}',
    '+989121234567',
    '00989121234567',
    '9121234567',
    ' 0912 123 4567 ',
    '0912-123-4567',
    // A right-to-left mark pasted along with the number.
    '\u{200F}09121234567',
  ])('reads %j as a mobile number', (value) => {
    expect(identifierType(value)).toBe('phone')
  })

  it.each(['a@b.co', 'Sara.Ahmadi@Example.com', '  sara.ahmadi@example.com\t', 'a+tag@shop.ir'])(
    'reads %j as an email address',
    (value) => {
      expect(identifierType(value)).toBe('email')
    },
  )

  it.each([
    '',
    '   ',
    'sara',
    'a@b',
    '@b.co',
    'a@@b.co',
    'a b@c.co',
    '02191000000',
    '0912123456',
    '091212345678',
    'abc09121234567',
  ])('reads %j as neither', (value) => {
    expect(identifierType(value)).toBeNull()
  })
})

describe('normalizeIdentifier', () => {
  it('gives a mobile number as 09… with Latin digits', () => {
    expect(
      normalizeIdentifier(
        '\u{06F0}\u{06F9}\u{06F1}\u{06F2} \u{06F1}\u{06F2}\u{06F3} \u{06F4}\u{06F5}\u{06F6}\u{06F7}',
      ),
    ).toBe('09121234567')
    expect(normalizeIdentifier('+989121234567')).toBe('09121234567')
  })

  it('gives an email address trimmed, without invisible marks', () => {
    expect(normalizeIdentifier('  \u{200E}sara.ahmadi@example.com ')).toBe(
      'sara.ahmadi@example.com',
    )
  })

  it('gives anything else trimmed, with Latin digits, for the API to judge', () => {
    expect(normalizeIdentifier(' sara\u{06F1} ')).toBe('sara1')
  })
})
