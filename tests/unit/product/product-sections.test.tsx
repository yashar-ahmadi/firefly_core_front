import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  ProductSectionsNav,
  sectionScrollTop,
  type SectionLink,
} from '@/features/product/components/product-sections'
import { stubBrowserApis } from '../support/dom-stubs'
import { FakeIntersectionObserver, intersect, resetIntersections } from '../support/intersection'

const media = stubBrowserApis()
vi.stubGlobal('IntersectionObserver', FakeIntersectionObserver)

const ITEMS: SectionLink[] = [
  { id: 'intro', label: 'معرفی' },
  { id: 'specs', label: 'مشخصات' },
  { id: 'reviews', label: 'دیدگاه\u{200C}ها', count: 3 },
  { id: 'questions', label: 'پرسش\u{200C}ها', count: 1 },
]

function renderBar() {
  return render(
    <div>
      <ProductSectionsNav items={ITEMS} />
      {ITEMS.map((item) => (
        <section key={item.id} id={item.id} tabIndex={-1} aria-label={item.label}>
          {item.label}
        </section>
      ))}
    </div>,
  )
}

const bar = () => screen.getByRole('navigation', { name: 'بخش\u{200C}های صفحه\u{0654} محصول' })
const section = (id: string) => document.getElementById(id)!

beforeEach(() => {
  resetIntersections()
  media.set(() => false)
  vi.stubGlobal('IntersectionObserver', FakeIntersectionObserver)
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
  window.history.replaceState(null, '', '/product/samsung-galaxy-s25-ultra/?variant=10002')
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('sectionScrollTop', () => {
  const sizes = { full: 112, compact: 56, bar: 48 }

  it('going down, clears the compact header (it shrinks while scrolling down) and the bar', () => {
    expect(sectionScrollTop({ targetTop: 2000, currentY: 0, ...sizes })).toBe(2000 - 56 - 48 - 8)
  })

  it('going up, clears the full header (it comes back while scrolling up)', () => {
    expect(sectionScrollTop({ targetTop: 1000, currentY: 3000, ...sizes })).toBe(
      1000 - 112 - 48 - 8,
    )
  })

  it('near the top, where the header stays full, clears the full header', () => {
    expect(sectionScrollTop({ targetTop: 200, currentY: 0, ...sizes })).toBe(32)
    expect(sectionScrollTop({ targetTop: 100, currentY: 0, ...sizes })).toBe(0)
  })
})

describe('ProductSectionsNav', () => {
  it('is a navigation of anchor links to the sections, counts included', () => {
    renderBar()
    const links = within(bar()).getAllByRole('link')
    expect(links.map((link) => link.getAttribute('href'))).toEqual([
      '#intro',
      '#specs',
      '#reviews',
      '#questions',
    ])
    expect(links[2]).toHaveTextContent('دیدگاه\u{200C}ها۳')
    // Sticky under the header, scrolling sideways on phones.
    expect(bar()).toHaveClass('sticky', 'top-(--header-offset)')
    expect(within(bar()).getByRole('list')).toHaveClass('overflow-x-auto')
  })

  it('scrolls smoothly to the section, moves the focus there and puts it in the URL', async () => {
    const user = userEvent.setup()
    renderBar()
    await user.click(within(bar()).getByRole('link', { name: /^دیدگاه/ }))
    expect(window.scrollTo).toHaveBeenCalledWith({ top: expect.any(Number), behavior: 'smooth' })
    expect(section('reviews')).toHaveFocus()
    // Shareable, the rest of the URL kept, no new history entry.
    expect(window.location.pathname + window.location.search + window.location.hash).toBe(
      '/product/samsung-galaxy-s25-ultra/?variant=10002#reviews',
    )
  })

  it('jumps without animation under reduced motion', async () => {
    media.set((query) => query === '(prefers-reduced-motion: reduce)')
    const user = userEvent.setup()
    renderBar()
    await user.click(within(bar()).getByRole('link', { name: 'مشخصات' }))
    expect(window.scrollTo).toHaveBeenCalledWith({ top: expect.any(Number), behavior: 'auto' })
  })

  it('marks the section being read', () => {
    renderBar()
    const link = (name: RegExp) => within(bar()).getByRole('link', { name })
    expect(link(/^معرفی/)).not.toHaveAttribute('aria-current')
    act(() => intersect([section('specs')]))
    expect(link(/^مشخصات/)).toHaveAttribute('aria-current', 'true')
    act(() => intersect([section('reviews')]))
    // Two in the band: the first one wins.
    expect(link(/^مشخصات/)).toHaveAttribute('aria-current', 'true')
    act(() => intersect([section('specs')], false))
    expect(link(/^دیدگاه/)).toHaveAttribute('aria-current', 'true')
    expect(link(/^مشخصات/)).not.toHaveAttribute('aria-current')
    // Between sections (none in the band) the last one stays marked.
    act(() => intersect([section('reviews')], false))
    expect(link(/^دیدگاه/)).toHaveAttribute('aria-current', 'true')
  })

  it('keeps the pressed tab marked while its scroll passes other sections, until a hand scroll', async () => {
    const user = userEvent.setup()
    renderBar()
    const link = (name: RegExp) => within(bar()).getByRole('link', { name })
    await user.click(link(/^پرسش/))
    expect(link(/^پرسش/)).toHaveAttribute('aria-current', 'true')
    // The smooth scroll crosses the reviews, and a short section may never reach the band.
    act(() => intersect([section('reviews')]))
    expect(link(/^پرسش/)).toHaveAttribute('aria-current', 'true')
    // The visitor scrolls by hand: the band decides again.
    act(() => {
      window.dispatchEvent(new WheelEvent('wheel'))
    })
    act(() => intersect([section('reviews')]))
    expect(link(/^دیدگاه/)).toHaveAttribute('aria-current', 'true')
  })

  it('still navigates where IntersectionObserver is missing', async () => {
    vi.stubGlobal('IntersectionObserver', undefined)
    const user = userEvent.setup()
    renderBar()
    await user.click(within(bar()).getByRole('link', { name: /^پرسش/ }))
    expect(section('questions')).toHaveFocus()
  })
})
