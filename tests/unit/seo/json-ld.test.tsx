import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { trailBreadcrumb } from '@/features/seo/breadcrumb-json-ld'
import { JsonLd, jsonLdString } from '@/features/seo/json-ld'

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

describe('trailBreadcrumb', () => {
  it('lists «خانه» then each step on the shop’s origin, a Persian path percent-encoded', () => {
    const list = trailBreadcrumb(
      [
        { name: 'برندها', path: '/brand/' },
        { name: 'سامسونگ', path: '/brand/سامسونگ/' },
      ],
      'https://shop.ir/',
      'خانه',
    )
    expect(list.itemListElement).toEqual([
      { '@type': 'ListItem', position: 1, name: 'خانه', item: 'https://shop.ir/' },
      { '@type': 'ListItem', position: 2, name: 'برندها', item: 'https://shop.ir/brand/' },
      {
        '@type': 'ListItem',
        position: 3,
        name: 'سامسونگ',
        item: `https://shop.ir/brand/${encodeURIComponent('سامسونگ')}/`,
      },
    ])
  })
})
