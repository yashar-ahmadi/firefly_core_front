import { describe, expect, it } from 'vitest'
import { mapLink } from '@/components/layout/contact-block'
import { footerColumns } from '@/components/layout/footer-menu'
import { httpUrl, linkUrl } from '@/lib/html/safe-url'
import { menuNode } from '../layout/support'

describe('httpUrl / linkUrl', () => {
  it('accepts absolute http(s) URLs only', () => {
    expect(httpUrl(' https://t.me/shop ')).toBe('https://t.me/shop')
    expect(httpUrl('http://localhost:8000/x')).toBe('http://localhost:8000/x')
    for (const bad of [
      'javascript:alert(1)',
      'data:text/html,x',
      '//evil.example',
      '/page/x/',
      'https://',
      '',
      null,
      undefined,
    ]) {
      expect(httpUrl(bad), String(bad)).toBeNull()
    }
  })

  it('also accepts storefront paths, never protocol-relative ones', () => {
    expect(linkUrl('/contact-us/')).toBe('/contact-us/')
    expect(linkUrl('https://shop.ir/contact/')).toBe('https://shop.ir/contact/')
    expect(linkUrl('//evil.example/')).toBeNull()
    expect(linkUrl('/\\evil.example/')).toBeNull()
    expect(linkUrl('javascript:alert(1)')).toBeNull()
  })
})

describe('mapLink', () => {
  it('uses a plain URL or the src of a Google Maps iframe', () => {
    expect(mapLink('https://maps.google.com/?q=35.7,51.4')).toBe(
      'https://maps.google.com/?q=35.7,51.4',
    )
    expect(
      mapLink(
        '<iframe src="https://www.google.com/maps/embed?pb=1&amp;z=2" width="600" height="450"></iframe>',
      ),
    ).toBe('https://www.google.com/maps/embed?pb=1&z=2')
  })

  it('ignores anything that is not an http(s) URL', () => {
    expect(mapLink('<iframe src="javascript:alert(1)"></iframe>')).toBeNull()
    expect(mapLink('تهران، میدان ونک')).toBeNull()
    expect(mapLink(null)).toBeNull()
  })
})

describe('footerColumns', () => {
  it('keeps operator order, gathering loose links where the first one is', () => {
    const columns = footerColumns(
      [
        menuNode({ id: 1, title: 'قوانین', url: '/page/terms/' }),
        menuNode({
          id: 2,
          title: 'خدمات',
          url: null,
          children: [menuNode({ id: 3, title: 'پرسش‌ها' })],
        }),
        menuNode({ id: 4, title: 'حریم خصوصی', url: '/page/privacy/' }),
        menuNode({ id: 5, title: 'گروه خالی', url: null }),
      ],
      'لینک‌های مفید',
    )
    expect(columns.map((column) => [column.title, column.links.map((link) => link.id)])).toEqual([
      ['لینک‌های مفید', [1, 4]],
      ['خدمات', [3]],
      ['گروه خالی', []],
    ])
  })
})
