import { describe, expect, it } from 'vitest'
import { organizationJsonLd, siteJsonLd, webSiteJsonLd } from '@/features/seo/site-json-ld'

// The shop's own structured data (Plan 5 Task 7, spec §8.13, seo digest §7.2: the backend sends
// none): an Organization (name, url, logo, the social profiles as `sameAs`, a contact point from
// the settings) and a WebSite whose SearchAction is the shop's search page. Every URL on the
// storefront's origin. No prices anywhere (the API's JSON-LD prices are Rial). Pure.

const SITE = {
  name: 'فایرفلای',
  slogan: 'خرید مطمئن، ارسال سریع',
  siteUrl: 'https://shop.ir/',
  logo: 'http://localhost:8000/media/categories/26/09/13/site-logo.png',
  phone: '+982191000000',
  email: 'support@shop.ir',
  socials: [
    { link: 'https://instagram.com/fireflyshop' },
    { link: 'https://t.me/fireflyshop' },
    { link: 'https://instagram.com/fireflyshop' },
    { link: 'javascript:alert(1)' },
    { link: 'tel:+98912' },
  ],
}

describe('organizationJsonLd', () => {
  it('names the shop at its home, with its logo, profiles and contact point', () => {
    expect(organizationJsonLd(SITE)).toEqual({
      '@context': 'https://schema.org',
      '@type': 'Organization',
      '@id': 'https://shop.ir/#organization',
      name: 'فایرفلای',
      url: 'https://shop.ir/',
      slogan: 'خرید مطمئن، ارسال سریع',
      logo: 'https://shop.ir/media/categories/26/09/13/site-logo.png',
      sameAs: ['https://instagram.com/fireflyshop', 'https://t.me/fireflyshop'],
      contactPoint: [
        {
          '@type': 'ContactPoint',
          contactType: 'customer service',
          telephone: '+982191000000',
          email: 'support@shop.ir',
          availableLanguage: 'fa',
        },
      ],
    })
  })

  it('a logo on another host stays where it is; a /static/ one moves onto the shop', () => {
    expect(organizationJsonLd({ ...SITE, logo: 'https://cdn.example/logo.png' }).logo).toBe(
      'https://cdn.example/logo.png',
    )
    expect(
      organizationJsonLd({ ...SITE, logo: 'http://api:8000/static/defaults/logo.png?v=2' }).logo,
    ).toBe('https://shop.ir/static/defaults/logo.png?v=2')
  })

  it('leaves out what the settings do not have (never an empty or undefined key)', () => {
    const bare = organizationJsonLd({
      name: 'فرش مهر',
      slogan: '  ',
      siteUrl: 'https://shop.ir',
      logo: null,
      phone: null,
      email: '',
      socials: [],
    })
    expect(bare).toEqual({
      '@context': 'https://schema.org',
      '@type': 'Organization',
      '@id': 'https://shop.ir/#organization',
      name: 'فرش مهر',
      url: 'https://shop.ir/',
    })
    expect(Object.values(bare)).not.toContain(undefined)
    expect(organizationJsonLd({ ...SITE, phone: null }).contactPoint).toEqual([
      expect.not.objectContaining({ telephone: expect.anything() }),
    ])
    expect(organizationJsonLd({ ...SITE, logo: 'javascript:alert(1)' })).not.toHaveProperty('logo')
  })
})

describe('webSiteJsonLd', () => {
  it('the shop’s site, Persian, its publisher the Organization, searched at /search/?q=', () => {
    expect(webSiteJsonLd(SITE)).toEqual({
      '@context': 'https://schema.org',
      '@type': 'WebSite',
      '@id': 'https://shop.ir/#website',
      name: 'فایرفلای',
      url: 'https://shop.ir/',
      inLanguage: 'fa-IR',
      publisher: { '@id': 'https://shop.ir/#organization' },
      potentialAction: {
        '@type': 'SearchAction',
        target: {
          '@type': 'EntryPoint',
          urlTemplate: 'https://shop.ir/search/?q={search_term_string}',
        },
        'query-input': 'required name=search_term_string',
      },
    })
  })

  it('on the storefront’s origin, whatever path SITE_URL has', () => {
    const site = webSiteJsonLd({ ...SITE, siteUrl: 'https://shop.ir:8443/' })
    expect(site.url).toBe('https://shop.ir:8443/')
  })
})

describe('siteJsonLd', () => {
  it('the Organization, then the WebSite, and no price anywhere', () => {
    const blocks = siteJsonLd(SITE)
    expect(blocks.map((block) => block['@type'])).toEqual(['Organization', 'WebSite'])
    expect(JSON.stringify(blocks)).not.toMatch(/price|offer|currency/i)
  })
})
