import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { breadcrumbTrail, siteBreadcrumb } from '@/features/seo/breadcrumb-json-ld'
import { JsonLd, jsonLdString } from '@/features/seo/json-ld'
import type { BreadcrumbListJsonLd } from '@/lib/api/types/catalog'

const LINE_SEPARATOR = String.fromCodePoint(0x2028)
const PARAGRAPH_SEPARATOR = String.fromCodePoint(0x2029)
const BACKSLASH_U = '\\u'

function scripts(container: HTMLElement) {
  return [...container.querySelectorAll('script')]
}

describe('JsonLd', () => {
  it('escapes </script> inside a string, so the content cannot leave the script', () => {
    const data = { '@type': 'Thing', name: 'a</script><script>alert(1)</script>' }
    const { container } = render(<JsonLd data={data} />)
    const [script] = scripts(container)
    expect(script).toHaveAttribute('type', 'application/ld+json')
    expect(script?.innerHTML).not.toContain('<')
    expect(script?.innerHTML).toContain(`${BACKSLASH_U}003c/script>`)
    expect(JSON.parse(script?.textContent ?? '')).toEqual(data)
  })

  it('renders one script per object of an array', () => {
    const { container } = render(<JsonLd data={[{ a: 1 }, { b: 2 }]} />)
    expect(scripts(container).map((script) => JSON.parse(script.textContent ?? ''))).toEqual([
      { a: 1 },
      { b: 2 },
    ])
  })

  it('renders nothing for an empty array', () => {
    const { container } = render(<JsonLd data={[]} />)
    expect(scripts(container)).toEqual([])
  })
})

describe('jsonLdString', () => {
  it('escapes the line and paragraph separators too', () => {
    const text = jsonLdString({ name: `a${LINE_SEPARATOR}b${PARAGRAPH_SEPARATOR}c` })
    expect(text).not.toContain(LINE_SEPARATOR)
    expect(text).not.toContain(PARAGRAPH_SEPARATOR)
    expect(text).toContain(`${BACKSLASH_U}2028`)
    expect(text).toContain(`${BACKSLASH_U}2029`)
    expect(JSON.parse(text)).toEqual({ name: `a${LINE_SEPARATOR}b${PARAGRAPH_SEPARATOR}c` })
  })
})

const LIST_PAGE: BreadcrumbListJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'BreadcrumbList',
  itemListElement: [
    { '@type': 'ListItem', position: 1, name: 'خانه', item: 'https://localhost/' },
    {
      '@type': 'ListItem',
      position: 2,
      name: 'گوشی موبایل',
      item: 'https://localhost/product-category/digital/mobile-phone/',
    },
    {
      '@type': 'ListItem',
      position: 3,
      name: 'گوشی های پرچمدار',
      item: 'https://localhost/product/list/flagship-phones/',
    },
  ],
}

describe('siteBreadcrumb', () => {
  it("moves the items onto the shop's own origin (the backend writes its SITE_DOMAIN)", () => {
    const rebased = siteBreadcrumb(LIST_PAGE, 'http://localhost:3000')
    expect(rebased.itemListElement.map((item) => item.item)).toEqual([
      'http://localhost:3000/',
      'http://localhost:3000/product-category/digital/mobile-phone/',
      'http://localhost:3000/product/list/flagship-phones/',
    ])
    expect(rebased.itemListElement[1]).toMatchObject({ position: 2, name: 'گوشی موبایل' })
    // The input is left as it was (it may be a cached API payload).
    expect(LIST_PAGE.itemListElement[0]?.item).toBe('https://localhost/')
  })

  it('keeps an item that is not an http(s) URL', () => {
    const odd: BreadcrumbListJsonLd = {
      ...LIST_PAGE,
      itemListElement: [{ '@type': 'ListItem', position: 1, name: 'x', item: 'not a url' }],
    }
    expect(siteBreadcrumb(odd, 'https://shop.ir').itemListElement[0]?.item).toBe('not a url')
  })
})

describe('breadcrumbTrail', () => {
  it('gives the visible crumbs after home, linked by path', () => {
    expect(breadcrumbTrail(LIST_PAGE)).toEqual([
      { name: 'گوشی موبایل', href: '/product-category/digital/mobile-phone/' },
      { name: 'گوشی های پرچمدار', href: '/product/list/flagship-phones/' },
    ])
  })
})
