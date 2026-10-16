import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PriceRange, type PriceRangeProps } from '@/features/catalog/components/listing/price-range'
import { stubBrowserApis } from '../support/dom-stubs'

stubBrowserApis()

/** `filters.price` of `?category=mobile-phone` in dev. */
const BOUNDS = { min: 1_250_000, max: 134_500_000 }

function renderRange(value: PriceRangeProps['value'] = {}) {
  const onCommit = vi.fn()
  const view = render(<PriceRange bounds={BOUNDS} value={value} onCommit={onCommit} />)
  const min = screen.getByRole('textbox', { name: 'حداقل قیمت' })
  const max = screen.getByRole('textbox', { name: 'حداکثر قیمت' })
  return { onCommit, min, max, view, user: userEvent.setup() }
}

describe('PriceRange inputs', () => {
  it('shows the bounds in Persian digits when the URL has no price', () => {
    const { min, max } = renderRange()
    expect(min).toHaveValue('۱٬۲۵۰٬۰۰۰')
    expect(max).toHaveValue('۱۳۴٬۵۰۰٬۰۰۰')
  })

  it('commits a typed price on blur, never while typing, reading Persian digits', async () => {
    const { onCommit, min, user } = renderRange()
    await user.clear(min)
    await user.type(min, '۲۰۰۰۰۰۰')
    expect(onCommit).not.toHaveBeenCalled()
    await user.tab()
    expect(onCommit).toHaveBeenCalledExactlyOnceWith({ min: 2_000_000, max: undefined })
    expect(min).toHaveValue('۲٬۰۰۰٬۰۰۰')
  })

  it('commits on Enter, reading Latin digits and separators', async () => {
    const { onCommit, max, user } = renderRange()
    await user.clear(max)
    await user.type(max, '50,000,000{Enter}')
    expect(onCommit).toHaveBeenCalledExactlyOnceWith({ min: undefined, max: 50_000_000 })
  })

  it('leaves out a bound at the edge of the range and swaps reversed values', async () => {
    const { onCommit, min, max, user } = renderRange({ max: 10_000_000 })
    await user.clear(min)
    await user.type(min, '90000000')
    await user.tab()
    expect(onCommit).toHaveBeenLastCalledWith({ min: 10_000_000, max: 90_000_000 })

    await user.clear(max)
    await user.type(max, '999999999')
    await user.tab()
    expect(onCommit).toHaveBeenLastCalledWith({ min: 10_000_000, max: undefined })
  })

  it('does not commit when a field loses focus unchanged, or is emptied back to its bound', async () => {
    const { onCommit, min, user } = renderRange()
    await user.click(min)
    await user.tab()
    await user.clear(min)
    await user.tab()
    expect(onCommit).not.toHaveBeenCalled()
    expect(min).toHaveValue('۱٬۲۵۰٬۰۰۰')
  })

  it('follows the URL when it changes (back and forward)', () => {
    const { min, max, view, onCommit } = renderRange({ min: 5_000_000 })
    expect(min).toHaveValue('۵٬۰۰۰٬۰۰۰')
    view.rerender(<PriceRange bounds={BOUNDS} value={{ max: 20_000_000 }} onCommit={onCommit} />)
    expect(min).toHaveValue('۱٬۲۵۰٬۰۰۰')
    expect(max).toHaveValue('۲۰٬۰۰۰٬۰۰۰')
  })
})

describe('PriceRange slider', () => {
  const rect = { left: 0, right: 100, width: 100, top: 0, bottom: 10, height: 10, x: 0, y: 0 }

  beforeEach(() => {
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
      ...rect,
      toJSON: () => rect,
    })
    vi.spyOn(Element.prototype, 'hasPointerCapture').mockReturnValue(true)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('names both thumbs and gives their value in toman', () => {
    renderRange({ min: 2_000_000 })
    const [low, high] = screen.getAllByRole('slider')
    expect(low).toHaveAccessibleName('حداقل قیمت')
    expect(low).toHaveAttribute('aria-valuetext', '۲٬۰۰۰٬۰۰۰ تومان')
    expect(high).toHaveAccessibleName('حداکثر قیمت')
  })

  it('commits once on release, not on every drag tick, and shows the value while dragging', () => {
    const { onCommit, min } = renderRange()
    // The slider root: the thumb sits in a positioning span inside it.
    const root = screen.getAllByRole('slider')[0]!.parentElement!.parentElement!
    // RTL: the right edge (x = 0 from the left is the far end) is the minimum.
    fireEvent.pointerDown(root, { pointerId: 1, clientX: 90 })
    fireEvent.pointerMove(root, { pointerId: 1, clientX: 80 })
    fireEvent.pointerMove(root, { pointerId: 1, clientX: 70 })
    expect(onCommit).not.toHaveBeenCalled()
    expect(min).toHaveValue('۴۱٬۰۰۰٬۰۰۰')
    fireEvent.pointerUp(root, { pointerId: 1, clientX: 70 })
    expect(onCommit).toHaveBeenCalledExactlyOnceWith({ min: 41_000_000, max: undefined })
  })

  it('commits each keyboard step (a key press is its own release)', async () => {
    const { onCommit, user } = renderRange()
    const high = screen.getAllByRole('slider')[1]!
    high.focus()
    // RTL: the right arrow moves toward the minimum.
    await user.keyboard('{ArrowRight}')
    expect(onCommit).toHaveBeenCalledExactlyOnceWith({ min: undefined, max: 134_000_000 })
  })
})
