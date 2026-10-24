import { act, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Carousel } from '@/components/ui/carousel'
import { stubBrowserApis } from '../support/dom-stubs'

// Embla needs real layout to find scroll snaps, which jsdom lacks; a fake API stands in for it.
const embla = vi.hoisted(() => {
  const handlers = new Map<string, Set<() => void>>()
  const state = { snaps: 3, selected: 0, loop: false }
  const emit = (event: string) => handlers.get(event)?.forEach((handler) => handler())
  const go = (index: number) => {
    state.selected = index
    emit('select')
  }
  const api = {
    scrollSnapList: () => Array.from({ length: state.snaps }, (_, i) => i),
    selectedScrollSnap: () => state.selected,
    canScrollPrev: () => state.loop || state.selected > 0,
    canScrollNext: () => state.loop || state.selected < state.snaps - 1,
    scrollPrev: vi.fn(() => go(Math.max(0, state.selected - 1))),
    scrollNext: vi.fn(() => go(Math.min(state.snaps - 1, state.selected + 1))),
    scrollTo: vi.fn((index: number) => go(index)),
    on(event: string, handler: () => void) {
      if (!handlers.has(event)) handlers.set(event, new Set())
      handlers.get(event)!.add(handler)
      return api
    },
    off(event: string, handler: () => void) {
      handlers.get(event)?.delete(handler)
      return api
    },
  }
  const reset = (snaps: number) => {
    Object.assign(state, { snaps, selected: 0, loop: false })
    for (const fn of [api.scrollPrev, api.scrollNext, api.scrollTo]) fn.mockClear()
  }
  return { api, state, emit, reset }
})

vi.mock('embla-carousel-react', () => ({ default: () => [() => {}, embla.api] }))

const media = stubBrowserApis()

beforeEach(() => {
  embla.reset(3)
  media.set(() => false)
})

afterEach(() => {
  vi.useRealTimers()
})

function Banners(props: Partial<Parameters<typeof Carousel>[0]>) {
  return (
    <Carousel ariaLabel="بنرهای تبلیغاتی" showDots {...props}>
      <div>بنر اول</div>
      <div>بنر دوم</div>
      <div>بنر سوم</div>
    </Carousel>
  )
}

describe('Carousel controls', () => {
  it('puts «next» on the end (left in RTL) side, pointing left, and pages with it', () => {
    render(<Banners />)
    const next = screen.getByRole('button', { name: 'اسلاید بعدی' })
    const prev = screen.getByRole('button', { name: 'اسلاید قبلی' })
    expect(next.className).toMatch(/(^| )end-/)
    expect(next.querySelector('svg')).toHaveClass('lucide-chevron-left')
    expect(prev.className).toMatch(/(^| )start-/)
    expect(prev).toHaveAttribute('aria-disabled', 'true')

    fireEvent.click(next)
    expect(embla.api.scrollNext).toHaveBeenCalledOnce()
    expect(prev).not.toHaveAttribute('aria-disabled')
  })

  it('keeps keyboard focus on «next» at the end: aria-disabled, still focused, and inert', async () => {
    const user = userEvent.setup()
    render(<Banners />)
    const next = screen.getByRole('button', { name: 'اسلاید بعدی' })
    act(() => next.focus())
    await user.keyboard('{Enter}')
    await user.keyboard('{Enter}')
    expect(embla.api.scrollNext).toHaveBeenCalledTimes(2)

    expect(next).toHaveAttribute('aria-disabled', 'true')
    expect(next).toBeEnabled()
    expect(next).toHaveFocus()
    await user.keyboard('{Enter}')
    expect(embla.api.scrollNext).toHaveBeenCalledTimes(2)
  })

  it('renders one dot per snap with Persian labels and aria-current on the selected one', () => {
    render(<Banners />)
    const dots = screen.getAllByRole('button', { name: /^اسلاید [۰-۹]+$/u })
    expect(dots.map((dot) => dot.getAttribute('aria-label'))).toEqual([
      'اسلاید ۱',
      'اسلاید ۲',
      'اسلاید ۳',
    ])
    expect(dots[0]).toHaveAttribute('aria-current', 'true')
    // 44 by 44 px touch targets (the spec's floor), the small visible dot inside.
    for (const dot of dots) expect(dot).toHaveClass('h-11', 'w-11')

    fireEvent.click(dots[2])
    expect(embla.api.scrollTo).toHaveBeenCalledWith(2, false)
    expect(dots[2]).toHaveAttribute('aria-current', 'true')
    expect(dots[0]).not.toHaveAttribute('aria-current')
  })

  it('hides arrows and dots when everything fits', () => {
    embla.reset(1)
    render(<Banners />)
    expect(screen.queryByRole('button', { name: 'اسلاید بعدی' })).toBeNull()
    expect(screen.queryByRole('button', { name: /^اسلاید [۰-۹]+$/u })).toBeNull()
  })

  it('can hide arrows on request', () => {
    render(<Banners showArrows={false} />)
    expect(screen.queryByRole('button', { name: 'اسلاید بعدی' })).toBeNull()
  })
})

describe('Carousel autoplay', () => {
  it('advances every autoplayMs and wraps to the first slide at the end', () => {
    vi.useFakeTimers()
    render(<Banners autoplayMs={4000} />)
    act(() => vi.advanceTimersByTime(4000))
    expect(embla.api.scrollNext).toHaveBeenCalledTimes(1)
    act(() => vi.advanceTimersByTime(4000))
    expect(embla.api.scrollNext).toHaveBeenCalledTimes(2)
    act(() => vi.advanceTimersByTime(4000))
    expect(embla.api.scrollTo).toHaveBeenCalledWith(0)
  })

  it('pauses while hovered, focused or touched', () => {
    vi.useFakeTimers()
    render(<Banners autoplayMs={4000} />)
    const carousel = screen.getByRole('region', { name: 'بنرهای تبلیغاتی' })

    fireEvent.pointerEnter(carousel, { pointerType: 'mouse' })
    act(() => vi.advanceTimersByTime(8000))
    expect(embla.api.scrollNext).not.toHaveBeenCalled()
    fireEvent.pointerLeave(carousel, { pointerType: 'mouse' })

    fireEvent.pointerDown(carousel, { pointerType: 'touch' })
    act(() => vi.advanceTimersByTime(8000))
    expect(embla.api.scrollNext).not.toHaveBeenCalled()
    fireEvent.pointerUp(carousel, { pointerType: 'touch' })

    act(() => screen.getByRole('button', { name: 'اسلاید بعدی' }).focus())
    embla.api.scrollNext.mockClear()
    act(() => vi.advanceTimersByTime(8000))
    expect(embla.api.scrollNext).not.toHaveBeenCalled()
  })

  it('has a pause button that stops it until pressed again', () => {
    vi.useFakeTimers()
    render(<Banners autoplayMs={4000} />)
    fireEvent.click(screen.getByRole('button', { name: 'توقف نمایش خودکار' }))
    act(() => vi.advanceTimersByTime(12000))
    expect(embla.api.scrollNext).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'ادامه نمایش خودکار' }))
    act(() => vi.advanceTimersByTime(4000))
    expect(embla.api.scrollNext).toHaveBeenCalledOnce()
  })

  it('never runs under prefers-reduced-motion', () => {
    vi.useFakeTimers()
    media.set((query) => query === '(prefers-reduced-motion: reduce)')
    render(<Banners autoplayMs={4000} />)
    act(() => vi.advanceTimersByTime(20000))
    expect(embla.api.scrollNext).not.toHaveBeenCalled()
    expect(screen.queryByRole('button', { name: 'توقف نمایش خودکار' })).toBeNull()
  })
})
