import { render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { Breadcrumbs } from '@/components/layout/breadcrumbs'

vi.mock('server-only', () => ({}))
vi.mock('@/features/settings/api', () => ({ getTranslations: async () => ({}) }))

const LONG = 'گوشی موبایل سامسونگ مدل Galaxy S25 Ultra ظرفیت ۵۱۲ گیگابایت رم ۱۲ گیگابایت'

async function renderCrumbs(items: { name: string; href?: string }[]) {
  return render(await Breadcrumbs({ items }))
}

describe('Breadcrumbs', () => {
  it('is a named navigation with an ordered list starting at home', async () => {
    await renderCrumbs([
      { name: 'کالای دیجیتال', href: '/product-category/digital/' },
      { name: 'گوشی' },
    ])
    const nav = screen.getByRole('navigation', { name: 'مسیر صفحه' })
    const items = within(nav).getAllByRole('listitem')
    expect(items).toHaveLength(3)
    const home = within(items[0]).getByRole('link', { name: 'خانه' })
    expect(home).toHaveAttribute('href', '/')
    expect(home.querySelector('svg')).toHaveAttribute('aria-hidden', 'true')
  })

  it('links every item with an href and marks the last one as the current page', async () => {
    await renderCrumbs([
      { name: 'کالای دیجیتال', href: '/product-category/digital/' },
      { name: 'گوشی موبایل', href: '/product-category/digital/mobile-phone/' },
      { name: LONG, href: '/product/galaxy-s25-ultra/' },
    ])
    expect(screen.getByRole('link', { name: 'کالای دیجیتال' })).toHaveAttribute(
      'href',
      '/product-category/digital/',
    )
    expect(screen.getByRole('link', { name: 'گوشی موبایل' })).not.toHaveAttribute('aria-current')
    // The current page is never a link, even when an href is given.
    expect(screen.queryByRole('link', { name: LONG })).toBeNull()
    const current = screen.getByText(LONG)
    expect(current).toHaveAttribute('aria-current', 'page')
    expect(current).toHaveAttribute('dir', 'auto')
  })

  it('truncates long names and keeps the full name as a tooltip', async () => {
    await renderCrumbs([{ name: LONG, href: '/x/' }, { name: 'آخر' }])
    const link = screen.getByRole('link', { name: LONG })
    expect(link).toHaveClass('truncate')
    expect(link).toHaveAttribute('title', LONG)
  })

  it('separates items with hidden chevrons pointing left', async () => {
    const { container } = await renderCrumbs([
      { name: 'الف', href: '/a/' },
      { name: 'ب', href: '/b/' },
      { name: 'ج' },
    ])
    const chevrons = container.querySelectorAll('svg.lucide-chevron-left')
    expect(chevrons).toHaveLength(3)
    for (const chevron of chevrons) expect(chevron).toHaveAttribute('aria-hidden', 'true')
  })

  it('scrolls sideways instead of wrapping', async () => {
    await renderCrumbs([{ name: 'الف' }])
    const list = screen.getByRole('list')
    expect(list).toHaveClass('overflow-x-auto', 'whitespace-nowrap')
  })

  it('shows only the home link without items', async () => {
    await renderCrumbs([])
    expect(screen.getByRole('link', { name: 'خانه' })).toHaveAttribute('aria-current', 'page')
  })
})
