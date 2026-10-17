import { render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { OrderStatusStrip } from '@/features/account/dashboard/order-status-strip'
import { authProviders } from '../support/auth-providers'
import { ok, summary } from './fixtures'

// The order strip's layout on phones (every API label whole) and a summary without groups.

const mocks = vi.hoisted(() => ({ summary: vi.fn() }))
vi.mock('@/lib/api/client', () => ({
  bffFetch: async (path: string) => {
    if (path === 'dashboard/summary/') return ok(await mocks.summary())
    throw new Error(`unexpected ${path}`)
  },
}))
vi.mock('next/navigation', () => ({
  usePathname: () => '/account/',
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
}))

beforeEach(() => {
  mocks.summary.mockReset()
  mocks.summary.mockResolvedValue(summary())
})

function renderSections() {
  render(<OrderStatusStrip />, { wrapper: authProviders({ hasSession: true }).wrapper })
}

const strip = () => screen.getByRole('region', { name: 'سفارش‌های من' })

describe('the order status strip on phones and edge cases', () => {
  it('fits the labels on phones: a row that scrolls, tiles wide enough for two lines', async () => {
    renderSections()
    const groups = await within(strip()).findAllByRole('link', { name: /سفارش$/ })
    const list = within(strip()).getByRole('list')
    expect(list.className).toMatch(/(^| )overflow-x-auto( |$)/)
    // The containing block of the tiles' sr-only words: they never widen the page.
    expect(list.className).toMatch(/(^| )relative( |$)/)
    expect(list.className).toContain('sm:grid')
    // Room above and below the tiles inside the scroller, which would clip their focus rings;
    // the margins take it back, so the strip stays as tall (sm and up: no scroller, no room).
    for (const name of ['py-1', '-my-1', 'sm:py-0', 'sm:my-0']) {
      expect(list.className, name).toMatch(new RegExp(`(^| )${name}( |$)`))
    }
    for (const group of groups) {
      expect(group.closest('li')!.className).toContain('w-[5.75rem]')
      expect(group.querySelector('[data-group-label]')!.className).toContain('line-clamp-2')
    }
  })

  it('stands without any group: the empty note, no tile', async () => {
    const empty = summary()
    empty.orders = { ...empty.orders, total: 0, groups: [] }
    mocks.summary.mockResolvedValue(empty)
    renderSections()
    expect(await within(strip()).findByText('هنوز سفارشی ثبت نکرده‌اید.')).toBeVisible()
    const list = within(strip()).getByRole('list')
    expect(list.style.gridTemplateColumns).toBe('')
    expect(within(list).queryAllByRole('listitem')).toHaveLength(0)
  })
})
