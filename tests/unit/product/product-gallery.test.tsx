import { act, fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { gallerySlides, ProductGallery } from '@/features/product/components/product-gallery'
import { useProduct } from '@/features/product/components/product-provider'
import { stubBrowserApis } from '../support/dom-stubs'
import { AXIS, s25Product, VALUE, variantOf } from './fixtures'
import { resetRouter } from './router'
import { renderWithProduct } from './support'

// Embla needs real layout, which jsdom lacks: one fake API stands in for every carousel.
const embla = vi.hoisted(() => {
  const handlers = new Map<string, Set<() => void>>()
  const state = { snaps: 4, selected: 0 }
  const emit = (event: string) => handlers.get(event)?.forEach((handler) => handler())
  const go = (index: number) => {
    state.selected = Math.max(0, Math.min(state.snaps - 1, index))
    emit('select')
  }
  const api = {
    scrollSnapList: () => Array.from({ length: state.snaps }, (_, i) => i),
    selectedScrollSnap: () => state.selected,
    canScrollPrev: () => state.selected > 0,
    canScrollNext: () => state.selected < state.snaps - 1,
    scrollPrev: vi.fn(() => go(state.selected - 1)),
    scrollNext: vi.fn(() => go(state.selected + 1)),
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
  const options: unknown[] = []
  const reset = () => {
    Object.assign(state, { snaps: 4, selected: 0 })
    options.length = 0
    for (const fn of [api.scrollPrev, api.scrollNext, api.scrollTo]) fn.mockClear()
  }
  return { api, state, options, reset }
})

vi.mock('embla-carousel-react', () => ({
  default: (options: unknown) => {
    embla.options.push(options)
    return [() => {}, embla.api]
  },
}))
vi.mock('@/lib/api/client', () => ({ bffFetch: vi.fn() }))
vi.mock('next/navigation', async () => (await import('./router')).routerMock)

stubBrowserApis()

const product = s25Product()
const NAME = product.name

beforeEach(() => {
  embla.reset()
  resetRouter()
})

/** Picks 512 GB, as the variant picker would. */
function Pick512() {
  const { select } = useProduct()
  return (
    <button type="button" onClick={() => select(AXIS.storage, VALUE.gb512)}>
      ۵۱۲
    </button>
  )
}

const slidesRegion = () => screen.getByRole('region', { name: 'تصاویر محصول' })
const slideImage = (n: number) =>
  within(within(slidesRegion()).getAllByRole('group')[n - 1]).getByRole('img')

describe('gallerySlides', () => {
  it('starts with the variant image (else the product image), then the gallery', () => {
    const slides = gallerySlides(product, variantOf(product, 10001))
    expect(slides).toHaveLength(1 + product.gallery.length)
    expect(slides[0]).toEqual({ src: variantOf(product, 10001).image, alt: NAME })
    expect(slides[1]).toEqual({ src: product.gallery[0]?.image, alt: product.gallery[0]?.alt })
    expect(gallerySlides(product, { ...variantOf(product, 10001), image: null })[0]?.src).toBe(
      product.image,
    )
    expect(gallerySlides(product, null)[0]?.src).toBe(product.image)
  })
})

describe('ProductGallery', () => {
  it('shows the main image first, loaded eagerly with high priority (the LCP image)', () => {
    renderWithProduct(<ProductGallery />, { product })
    expect(within(slidesRegion()).getAllByRole('group')).toHaveLength(4)
    const main = slideImage(1)
    expect(main).toHaveAttribute('src', variantOf(product, 10001).image)
    expect(main).toHaveAttribute('alt', NAME)
    expect(main).toHaveAttribute('fetchpriority', 'high')
    expect(main).toHaveAttribute('loading', 'eager')
    expect(slideImage(2)).toHaveAttribute('loading', 'lazy')
    expect(embla.options[0]).toMatchObject({ direction: 'rtl' })
  })

  it('has a thumbnail per image that shows it, marking the current one', () => {
    renderWithProduct(<ProductGallery />, { product })
    const thumbs = within(screen.getByRole('group', { name: 'تصاویر کوچک' })).getAllByRole('button')
    expect(thumbs).toHaveLength(4)
    expect(thumbs[0]).toHaveAttribute('aria-current', 'true')
    fireEvent.click(thumbs[2]!)
    expect(embla.api.scrollTo).toHaveBeenLastCalledWith(2, false)
    expect(thumbs[2]).toHaveAttribute('aria-current', 'true')
    expect(thumbs[0]).not.toHaveAttribute('aria-current')
  })

  it('has dots for phones', () => {
    renderWithProduct(<ProductGallery />, { product })
    const dots = within(screen.getByRole('group', { name: 'انتخاب تصویر' })).getAllByRole('button')
    expect(dots).toHaveLength(4)
    // 44×44 targets; the visible dot is small inside.
    for (const dot of dots) expect(dot).toHaveClass('size-11')
    fireEvent.click(dots[1]!)
    expect(embla.api.scrollTo).toHaveBeenLastCalledWith(1, false)
  })

  it("shows the newly chosen variant's image, back on the first slide", async () => {
    const user = userEvent.setup()
    renderWithProduct(
      <>
        <ProductGallery />
        <Pick512 />
      </>,
      { product },
    )
    act(() => embla.api.scrollTo(3))
    embla.api.scrollTo.mockClear()
    await user.click(screen.getByRole('button', { name: '۵۱۲' }))
    expect(slideImage(1)).toHaveAttribute('src', variantOf(product, 10002).image)
    expect(embla.api.scrollTo).toHaveBeenCalledWith(0, true)
  })
})

describe('the lightbox', () => {
  it('opens on the pressed image, pages with the arrow keys, and returns focus on close', async () => {
    const user = userEvent.setup()
    renderWithProduct(<ProductGallery />, { product })
    const opener = within(slidesRegion()).getAllByRole('button')[0]!
    await user.click(opener)
    const dialog = await screen.findByRole('dialog', { name: NAME })
    expect(within(dialog).getByText('۱ از ۴')).toBeInTheDocument()
    // Natural size: never wider than the 500px original.
    const big = within(dialog).getAllByRole('img')[0]!
    expect(big.closest('[data-lightbox-frame]')).toHaveClass('max-w-[500px]')

    fireEvent.keyDown(dialog, { key: 'ArrowLeft' })
    await waitFor(() => expect(within(dialog).getByText('۲ از ۴')).toBeInTheDocument())
    fireEvent.keyDown(dialog, { key: 'ArrowRight' })
    await waitFor(() => expect(within(dialog).getByText('۱ از ۴')).toBeInTheDocument())

    await user.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(opener).toHaveFocus()
  })

  it('has «next» and «previous» buttons', async () => {
    const user = userEvent.setup()
    renderWithProduct(<ProductGallery />, { product })
    await user.click(within(slidesRegion()).getAllByRole('button')[0]!)
    const dialog = await screen.findByRole('dialog', { name: NAME })
    await user.click(within(dialog).getByRole('button', { name: 'تصویر بعدی' }))
    expect(within(dialog).getByText('۲ از ۴')).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: 'تصویر قبلی' }))
    expect(within(dialog).getByText('۱ از ۴')).toBeInTheDocument()
  })
})
