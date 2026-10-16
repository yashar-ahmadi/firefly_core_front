import { act, fireEvent, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useProduct } from '@/features/product/components/product-provider'
import { VariantPicker } from '@/features/product/components/variant-picker'
import { announceRouterNavigation } from '@/lib/navigation/router-navigation'
import { chipsProduct, s25Product } from './fixtures'
import { resetRouter, router } from './router'
import { renderWithProduct } from './support'

vi.mock('@/lib/api/client', () => ({ bffFetch: vi.fn() }))
vi.mock('next/navigation', async () => (await import('./router')).routerMock)

const PAGE = '/product/samsung-galaxy-s25-ultra/'

/** What the rest of the page reads from the provider. */
function Probe() {
  const { variant, quantity } = useProduct()
  return (
    <output data-testid="probe">
      {variant ? `${variant.id}:${variant.final_price}:${variant.in_stock}` : 'none'}:{quantity}
    </output>
  )
}

const probe = () => screen.getByTestId('probe').textContent
const colours = () => screen.getByRole('radiogroup', { name: 'رنگ' })
const storage = () => screen.getByRole('radiogroup', { name: 'حافظه داخلی' })
const colour = (name: RegExp) => within(colours()).getByRole('radio', { name })

let replaceState: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  resetRouter()
  window.history.replaceState(null, '', PAGE)
  replaceState = vi.spyOn(window.history, 'replaceState')
})

afterEach(() => {
  replaceState.mockRestore()
})

function renderPicker(initialVariantId?: number) {
  return renderWithProduct(
    <>
      <VariantPicker />
      <Probe />
    </>,
    { product: s25Product(), initialVariantId },
  )
}

describe('VariantPicker', () => {
  it('renders one radio group per axis with more than one value, the rest as text', () => {
    renderPicker()
    expect(screen.getAllByRole('radiogroup')).toHaveLength(2)
    expect(within(colours()).getAllByRole('radio')).toHaveLength(3)
    expect(within(storage()).getAllByRole('radio')).toHaveLength(3)
    // RAM has a single value: static text, nothing to choose.
    expect(screen.queryByRole('radiogroup', { name: 'حافظه رم' })).toBeNull()
    expect(screen.getByText('۱۲ گیگابایت')).toBeInTheDocument()
    expect(screen.getByText('حافظه رم:')).toBeInTheDocument()
  })

  it('starts on the default variant and names each colour, never by colour alone', () => {
    renderPicker()
    expect(colour(/^مشکی/)).toHaveAttribute('aria-checked', 'true')
    expect(colour(/^مشکی/)).toHaveTextContent('مشکی')
    expect(colour(/^طلایی/)).toHaveAttribute('aria-checked', 'false')
    // The axis heading repeats the choice.
    expect(screen.getByText('رنگ:').parentElement).toHaveTextContent('رنگ: مشکی')
    expect(probe()).toBe('10001:78500000:true:1')
  })

  it('dims values with no variant beside the current choice, and keeps them clickable', () => {
    renderPicker()
    const silver = colour(/^نقره ای/)
    expect(silver).toHaveAttribute('data-state', 'no_such_combo')
    expect(silver).toHaveAccessibleName('نقره ای، در این ترکیب موجود نیست')
    expect(silver).toBeEnabled()
    expect(within(storage()).getByRole('radio', { name: /^۱ ترابایت/ })).toHaveAttribute(
      'data-state',
      'no_such_combo',
    )
  })

  it('updates the variant without a request when a value is chosen', async () => {
    const user = userEvent.setup()
    renderPicker()
    await user.click(within(storage()).getByRole('radio', { name: /^۵۱۲ گیگابایت/ }))
    expect(probe()).toBe('10002:86900000:true:1')
  })

  it('moves to an existing variant when the combination does not exist, struck if out of stock', async () => {
    const user = userEvent.setup()
    renderPicker()
    await user.click(colour(/^نقره ای/))
    expect(probe()).toBe('10004:99500000:false:1')
    expect(colour(/^نقره ای/)).toHaveAttribute('aria-checked', 'true')
    expect(within(storage()).getByRole('radio', { name: /^۱ ترابایت/ })).toHaveAttribute(
      'aria-checked',
      'true',
    )
    // Out of stock: struck through, still selectable, and said.
    expect(colour(/^نقره ای/)).toHaveAttribute('data-state', 'out_of_stock')
    expect(colour(/^نقره ای/)).toHaveAccessibleName('نقره ای، ناموجود')
    expect(colour(/^نقره ای/).querySelector('.line-through')).not.toBeNull()
  })

  it('moves and selects with the arrow keys, in reading order (left is next in RTL)', () => {
    renderPicker()
    const black = colour(/^مشکی/)
    expect(black).toHaveAttribute('tabindex', '0')
    expect(colour(/^طلایی/)).toHaveAttribute('tabindex', '-1')
    act(() => black.focus())
    fireEvent.keyDown(black, { key: 'ArrowLeft' })
    expect(colour(/^نقره ای/)).toHaveFocus()
    expect(colour(/^نقره ای/)).toHaveAttribute('aria-checked', 'true')
    fireEvent.keyDown(colour(/^نقره ای/), { key: 'ArrowRight' })
    expect(colour(/^مشکی/)).toHaveFocus()
    fireEvent.keyDown(colour(/^مشکی/), { key: 'ArrowRight' })
    expect(colour(/^طلایی/)).toHaveFocus()
    expect(probe()).toMatch(/^10003:/)
    fireEvent.keyDown(colour(/^طلایی/), { key: 'Home' })
    expect(colour(/^مشکی/)).toHaveFocus()
  })

  it('renders nothing for a product without options', () => {
    const { container } = renderWithProduct(<VariantPicker />, { product: chipsProduct() })
    expect(container).toBeEmptyDOMElement()
  })
})

describe('the chosen variant in the URL (?variant=)', () => {
  const lastUrl = () => String(replaceState.mock.lastCall?.[2])

  it('opens on the variant a shared link names', () => {
    renderPicker(10003)
    expect(colour(/^طلایی/)).toHaveAttribute('aria-checked', 'true')
    expect(probe()).toMatch(/^10003:/)
    // Nothing is written on load.
    expect(replaceState).not.toHaveBeenCalled()
  })

  it('reads ?variant= from the URL itself, so a page restored by Back/Forward matches it', () => {
    router.search = 'utm_source=sms&variant=10003'
    renderPicker()
    expect(colour(/^طلایی/)).toHaveAttribute('aria-checked', 'true')
    expect(probe()).toMatch(/^10003:/)
  })

  it('ignores a ?variant= that is not a variant of this product', () => {
    router.search = 'variant=99999'
    renderPicker()
    expect(colour(/^مشکی/)).toHaveAttribute('aria-checked', 'true')
  })

  it('writes the chosen variant with replaceState, keeping the rest of the query', async () => {
    const user = userEvent.setup()
    window.history.replaceState(null, '', `${PAGE}?utm_source=sms`)
    replaceState.mockClear()
    renderPicker()
    await user.click(within(storage()).getByRole('radio', { name: /^۵۱۲ گیگابایت/ }))
    expect(replaceState).toHaveBeenCalledTimes(1)
    expect(lastUrl()).toBe(`${PAGE}?utm_source=sms&variant=10002`)
    await user.click(colour(/^نقره ای/))
    expect(lastUrl()).toBe(`${PAGE}?utm_source=sms&variant=10004`)
  })

  it('leaves the URL alone while a navigation to another page is on its way', async () => {
    const user = userEvent.setup()
    renderPicker()
    act(() => announceRouterNavigation('/brand/samsung/'))
    await user.click(within(storage()).getByRole('radio', { name: /^۵۱۲ گیگابایت/ }))
    expect(probe()).toMatch(/^10002:/)
    expect(replaceState).not.toHaveBeenCalled()
  })
})
