import { describe, expect, it } from 'vitest'
import { isShortLinkPath } from '@/lib/links/short-link'

describe('isShortLinkPath', () => {
  it.each([
    '/s/phone-fest/',
    '/s/phone-fest',
    '/s/Phone-Fest/?utm_source=sms',
    '/s/x#top',
    '/s/',
    '/s',
  ])('treats %s as a short link', (href) => {
    expect(isShortLinkPath(href)).toBe(true)
  })

  it.each([
    '/',
    '/search/?q=s',
    '/sale/',
    '/s-and-m/',
    '/shop/s/x/',
    '/product/s/',
    'https://shop.ir/s/x/',
    '//s/x/',
    's/x/',
  ])('does not treat %s as a short link', (href) => {
    expect(isShortLinkPath(href)).toBe(false)
  })
})
