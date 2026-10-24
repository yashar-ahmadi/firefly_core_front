import { describe, expect, it } from 'vitest'
import { contactJsonLd } from '@/features/contact/contact-seo'
import { contentPageJsonLd } from '@/features/content/pages/page-seo'
import { jsonLdString } from '@/features/seo/json-ld'
import { pageFixture } from './page-fixtures'

// A content page's and the contact page's JSON-LD (seo digest §7.1; Plan 5 final fix wave): the
// API gives pages no structured data, so the page names itself, a WebPage (an AboutPage for
// `about-us`, a ContactPage for /contact-us/) with its name, URL, description and language,
// beside the visible trail. Written escaped by `JsonLd`.

const SITE = 'https://shop.ir'

describe('contentPageJsonLd', () => {
  it('a page: its WebPage (name, URL, description, fa-IR), then the trail', () => {
    const [node, trail] = contentPageJsonLd(
      pageFixture({ title: 'قوانین', slug: 'terms', page_description: 'شرایط خرید' }),
      SITE,
    )
    expect(node).toEqual({
      '@context': 'https://schema.org',
      '@type': 'WebPage',
      name: 'قوانین',
      url: 'https://shop.ir/page/terms/',
      description: 'شرایط خرید',
      inLanguage: 'fa-IR',
    })
    expect(trail).toMatchObject({ '@type': 'BreadcrumbList' })
  })

  it('about-us is an AboutPage; without a description, none is written; escaped', () => {
    const [node] = contentPageJsonLd(pageFixture({ title: 'درباره </script> ما' }), SITE)
    expect(node).toEqual({
      '@context': 'https://schema.org',
      '@type': 'AboutPage',
      name: 'درباره </script> ما',
      url: 'https://shop.ir/page/about-us/',
      inLanguage: 'fa-IR',
    })
    expect(jsonLdString(node!)).not.toContain('</script>')
  })

  it('the description falls back as the head’s does: page_description, else description', () => {
    const [node] = contentPageJsonLd(pageFixture({ description: 'دربارهٔ فروشگاه' }), SITE)
    expect(node).toMatchObject({ description: 'دربارهٔ فروشگاه' })
  })
})

describe('contactJsonLd', () => {
  it('with the operator’s contact-us page: a ContactPage at /contact-us/, then the trail', () => {
    const page = pageFixture({
      title: 'ارتباط با ما',
      slug: 'contact-us',
      page_description: 'پل‌های ارتباطی',
    })
    const [node, trail] = contactJsonLd(page, SITE, 'فایرفلای')
    expect(node).toEqual({
      '@context': 'https://schema.org',
      '@type': 'ContactPage',
      name: 'ارتباط با ما',
      url: 'https://shop.ir/contact-us/',
      description: 'پل‌های ارتباطی',
      inLanguage: 'fa-IR',
    })
    expect(trail).toMatchObject({
      '@type': 'BreadcrumbList',
      itemListElement: [
        { name: 'خانه' },
        { name: 'ارتباط با ما', item: 'https://shop.ir/contact-us/' },
      ],
    })
  })

  it('without it: «تماس با ما» and the head’s own description', () => {
    const [node] = contactJsonLd(null, SITE, 'فایرفلای')
    expect(node).toMatchObject({
      '@type': 'ContactPage',
      name: 'تماس با ما',
      description: 'راه\u{200C}های تماس با فایرفلای: تلفن، ایمیل، آدرس و فرم ارسال پیام.',
    })
  })
})
