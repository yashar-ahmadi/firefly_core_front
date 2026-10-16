import { describe, expect, it } from 'vitest'
import { isPrefetchRequest } from '@/lib/http/prefetch'

describe('isPrefetchRequest', () => {
  it.each([
    ['next-router-prefetch', '1'],
    ['next-router-prefetch', '2'],
    ['purpose', 'prefetch'],
    ['Purpose', 'Prefetch'],
    ['sec-purpose', 'prefetch'],
    ['sec-purpose', 'prefetch;prerender'],
    ['sec-purpose', 'prefetch;anonymous-client-ip'],
  ])('recognises %s: %s', (name, value) => {
    expect(isPrefetchRequest(new Headers({ [name]: value }))).toBe(true)
  })

  it.each([
    [{}],
    [{ rsc: '1' }],
    [{ purpose: 'navigate' }],
    [{ 'sec-purpose': 'prerender' }],
    [{ 'sec-fetch-mode': 'navigate' }],
  ])('treats %o as a real visit', (headers) => {
    expect(isPrefetchRequest(new Headers(headers))).toBe(false)
  })
})
