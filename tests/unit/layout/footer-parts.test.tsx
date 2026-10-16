import { render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ContactBlock } from '@/components/layout/contact-block'
import { FooterMenu, footerColumns } from '@/components/layout/footer-menu'
import type { SiteSettings } from '@/lib/api/types/settings'
import { createTranslator } from '@/lib/i18n/translator'
import { menuNode } from './support'

// The footer's building blocks on their own: menu columns and the contact block.

const t = createTranslator({})

afterEach(() => {
  vi.restoreAllMocks()
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
      ],
      'لینک‌های مفید',
    )
    expect(columns.map((column) => [column.title, column.links.map((link) => link.id)])).toEqual([
      ['لینک‌های مفید', [1, 4]],
      ['خدمات', [3]],
    ])
  })

  it('drops a heading without a link or children: it would be an empty column', () => {
    const columns = footerColumns(
      [
        menuNode({ id: 1, title: 'گروه خالی', url: null }),
        menuNode({ id: 2, title: 'قوانین', url: '/page/terms/' }),
      ],
      'لینک‌های مفید',
    )
    expect(columns.map((column) => column.title)).toEqual(['لینک‌های مفید'])
  })
})

describe('FooterMenu', () => {
  const items = [
    menuNode({
      id: 1,
      title: 'خدمات مشتریان',
      url: null,
      children: [menuNode({ id: 2, title: 'پرسش‌های متداول', url: '/faq/' })],
    }),
    menuNode({ id: 3, title: 'گروه خالی', url: null }),
  ]

  it('shows no empty heading-only column on wide screens nor in the phone accordion', () => {
    render(<FooterMenu items={items} t={t} />)
    const nav = screen.getByRole('navigation', { name: 'پیوندهای پایین صفحه' })
    expect(within(nav).getByRole('region', { name: 'خدمات مشتریان' })).toBeInTheDocument()
    expect(within(nav).getByRole('button', { name: 'خدمات مشتریان' })).toBeInTheDocument()
    expect(within(nav).queryByText('گروه خالی')).toBeNull()
  })

  it('renders nothing when every item is a bare heading', () => {
    const { container } = render(<FooterMenu items={[items[1]]} t={t} />)
    expect(container).toBeEmptyDOMElement()
  })
})

type Contact = Pick<SiteSettings, 'phone' | 'phone2'> & Partial<SiteSettings>

function renderContact(settings: Contact) {
  return render(<ContactBlock settings={settings as SiteSettings} t={t} />)
}

describe('ContactBlock: phones', () => {
  it('shows both numbers when they differ', () => {
    renderContact({ phone: '+982191000000', phone2: '+982188776655' })
    const links = screen.getAllByRole('link').filter((link) => link.matches('[href^="tel:"]'))
    expect(links.map((link) => link.getAttribute('href'))).toEqual([
      'tel:+982191000000',
      'tel:+982188776655',
    ])
  })

  it('shows a number once when phone2 repeats phone, in any spelling', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    for (const phone2 of ['+982191000000', ' 021-9100-0000 ']) {
      const { unmount } = renderContact({ phone: '+982191000000', phone2 })
      const links = screen.getAllByRole('link', { name: '۰۲۱ ۹۱۰۰ ۰۰۰۰' })
      expect(links, phone2).toHaveLength(1)
      expect(links[0]).toHaveAttribute('href', 'tel:+982191000000')
      unmount()
    }
    // No duplicate React keys either.
    expect(error).not.toHaveBeenCalled()
  })
})
