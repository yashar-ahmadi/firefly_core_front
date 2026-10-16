import { describe, expect, it } from 'vitest'
import { normalizeSlug } from '@/lib/url/slug'

// «گوشی» percent-encoded as UTF-8.
const GOOSHI_ENCODED = '%DA%AF%D9%88%D8%B4%DB%8C'

describe('normalizeSlug', () => {
  it('gives the same result for a decoded and a still-encoded Persian slug', () => {
    expect(normalizeSlug(GOOSHI_ENCODED)).toBe(normalizeSlug('گوشی'))
    expect(normalizeSlug('گوشی')).toBe(GOOSHI_ENCODED)
  })

  it('encodes exactly once: lowercase escapes and ASCII slugs come out canonical', () => {
    expect(normalizeSlug(GOOSHI_ENCODED.toLowerCase())).toBe(GOOSHI_ENCODED)
    expect(normalizeSlug('samsung-galaxy-s25-ultra')).toBe('samsung-galaxy-s25-ultra')
    expect(normalizeSlug('a b')).toBe('a%20b')
    expect(normalizeSlug('a%20b')).toBe('a%20b')
  })

  it('keeps a multi-segment path, encoding each segment', () => {
    expect(normalizeSlug('digital/گوشی')).toBe(`digital/${GOOSHI_ENCODED}`)
    expect(normalizeSlug(`digital/${GOOSHI_ENCODED}`)).toBe(`digital/${GOOSHI_ENCODED}`)
  })

  it('returns null for malformed percent-encoding', () => {
    expect(normalizeSlug('abc%ZZ')).toBeNull()
    expect(normalizeSlug('%')).toBeNull()
    expect(normalizeSlug('%DA')).toBeNull()
    expect(normalizeSlug('100%')).toBeNull()
  })

  it('returns null for empty, dot and dot-dot segments, plain or encoded', () => {
    for (const raw of [
      '',
      '/',
      'a//b',
      'a/',
      '/a',
      '.',
      '..',
      'a/../b',
      '%2E',
      '%2e%2E',
      'a/%2E%2E',
    ]) {
      expect(normalizeSlug(raw), raw).toBeNull()
    }
  })

  it('treats an encoded slash as a separator after the single decode', () => {
    expect(normalizeSlug('a%2Fb')).toBe('a/b')
    expect(normalizeSlug('a%2F..')).toBeNull()
  })

  it('returns null for a lone surrogate instead of throwing', () => {
    expect(normalizeSlug(String.fromCharCode(0xd800))).toBeNull()
  })

  it('decodes only once', () => {
    // `%2541` is the encoding of the literal text `%41`; it must not become `A`.
    expect(normalizeSlug('%2541')).toBe('%2541')
  })
})
