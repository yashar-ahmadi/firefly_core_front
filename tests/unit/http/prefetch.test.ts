import { describe, expect, it } from 'vitest'
import { prefetchKind } from '@/lib/http/prefetch'

describe('prefetchKind', () => {
  it.each([
    ['next-router-prefetch', '1'],
    ['next-router-prefetch', '2'],
  ])("recognises the Next.js router's prefetch (%s: %s)", (name, value) => {
    expect(prefetchKind(new Headers({ [name]: value }))).toBe('router')
  })

  it.each([
    ['purpose', 'prefetch'],
    ['Purpose', 'Prefetch'],
    ['sec-purpose', 'prefetch'],
    ['sec-purpose', 'prefetch;prerender'],
    ['sec-purpose', 'prefetch;anonymous-client-ip'],
  ])("recognises a browser's speculative prefetch (%s: %s)", (name, value) => {
    expect(prefetchKind(new Headers({ [name]: value }))).toBe('speculative')
  })

  it('calls a router prefetch a router prefetch even with a purpose header', () => {
    const headers = new Headers({ 'next-router-prefetch': '1', 'sec-purpose': 'prefetch' })
    expect(prefetchKind(headers)).toBe('router')
  })

  it.each([
    [{}],
    [{ rsc: '1' }],
    [{ purpose: 'navigate' }],
    [{ 'sec-purpose': 'prerender' }],
    [{ 'sec-fetch-mode': 'navigate' }],
  ])('treats %o as a real visit', (headers) => {
    expect(prefetchKind(new Headers(headers))).toBeNull()
  })
})
