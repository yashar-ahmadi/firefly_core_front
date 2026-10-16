import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ProductCard } from '@/features/catalog/components/product-card'
import { useCompare } from '@/features/compare/store'
import { useQuickViewStore } from '@/features/quick-view/use-quick-view'
import type { ProductCard as ProductCardData } from '@/lib/api/types/catalog'
import { clientProviders } from '../support/providers'
import { cardFixture, discountedCard } from './card-fixtures'

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }))

const NAME = 'گوشی موبایل سامسونگ گلکسی S25 اولترا'
const OUT_OF_STOCK = 'ناموجود'

function renderCard(product: ProductCardData, props: { showOutOfStockLabel?: boolean } = {}) {
  const { wrapper } = clientProviders()
  return render(
    <ProductCard product={product} showOutOfStockLabel={props.showOutOfStockLabel ?? true} />,
    { wrapper },
  )
}

function card(): HTMLElement {
  return screen.getByRole('article')
}

beforeEach(() => {
  localStorage.clear()
  useCompare.setState({ items: [] })
})

describe('ProductCard', () => {
  it('shows the discount percent, the struck original and the final price', () => {
    renderCard(discountedCard())
    expect(within(card()).getByText('۲۵\u{066A}')).toBeInTheDocument()
    expect(card().querySelector('del')).toHaveTextContent('۷۸٬۵۰۰٬۰۰۰')
    expect(card()).toHaveTextContent('۵۸٬۸۷۵٬۰۰۰ تومان')
  })

  it('shows only the final price without a discount', () => {
    renderCard(cardFixture())
    expect(card().querySelector('del')).toBeNull()
    expect(card()).not.toHaveTextContent('\u{066A}')
    expect(card()).toHaveTextContent('۷۸٬۵۰۰٬۰۰۰ تومان')
  })

  it('shows «ناموجود» only when the product is out of stock and the label is on', () => {
    const { unmount } = renderCard(cardFixture({ in_stock: false }), { showOutOfStockLabel: true })
    expect(within(card()).getByText(OUT_OF_STOCK)).toBeInTheDocument()
    unmount()

    const hidden = renderCard(cardFixture({ in_stock: false }), { showOutOfStockLabel: false })
    expect(within(card()).queryByText(OUT_OF_STOCK)).toBeNull()
    hidden.unmount()

    renderCard(cardFixture({ in_stock: true }), { showOutOfStockLabel: true })
    expect(within(card()).queryByText(OUT_OF_STOCK)).toBeNull()
  })

  it('links the product name to its page, and the buttons are not inside the link', () => {
    renderCard(cardFixture())
    const link = within(card()).getByRole('link', { name: NAME })
    expect(link).toHaveAttribute('href', '/product/samsung-galaxy-s25-ultra/')
    expect(link.closest('h3')).toHaveAttribute('dir', 'auto')
    expect(within(card()).getAllByRole('link')).toHaveLength(1)
    expect(link.querySelector('button')).toBeNull()
    // The name comes first in focus and reading order, then the buttons that act on it.
    expect(card().querySelector('a, button')).toBe(link)
    expect(within(card()).getByRole('button', { name: /علاقه/ })).toBeInTheDocument()
    expect(within(card()).getByRole('button', { name: /مقایسه/ })).toBeInTheDocument()
  })

  it('shows at most two attribute chips of the representative variant', () => {
    renderCard(cardFixture())
    expect(within(card()).getByText('مشکی')).toBeInTheDocument()
    expect(within(card()).getByText('۲۵۶ گیگابایت')).toBeInTheDocument()
    expect(within(card()).queryByText('۱۲ گیگابایت')).toBeNull()
  })

  it("shows the badge on the operator's colour, with readable text", () => {
    renderCard(cardFixture())
    // The dev pair (white on #FF6D00) is below AA, so the text turns near-black.
    expect(within(card()).getByText('پرفروش')).toHaveStyle({
      backgroundColor: '#FF6D00',
      color: '#111827',
    })
  })

  it('shows the rating, or «بدون امتیاز» when there is none', () => {
    const { unmount } = renderCard(cardFixture())
    expect(within(card()).getByRole('img', { name: 'امتیاز ۴ از ۵' })).toBeInTheDocument()
    unmount()

    renderCard(cardFixture({ rating: 0, rating_count: 0 }))
    expect(within(card()).getByText('بدون امتیاز')).toBeInTheDocument()
  })

  it('shows the countdown only for a timed discount', () => {
    const { unmount } = renderCard(discountedCard())
    expect(within(card()).queryByRole('timer')).toBeNull()
    unmount()

    renderCard(discountedCard({ discount_time_remaining: Date.now() + 3_600_000 }))
    expect(within(card()).getByRole('timer')).toBeInTheDocument()
  })

  it('puts the countdown on the image beside the badge, so a timed card adds no row', () => {
    const textColumn = () =>
      within(card()).getByRole('link', { name: NAME }).closest('h3')!.parentElement!
    const plain = renderCard(discountedCard())
    const plainRows = textColumn().children.length
    plain.unmount()

    renderCard(discountedCard({ discount_time_remaining: Date.now() + 3_600_000 }))
    expect(textColumn().children).toHaveLength(plainRows)
    // The pill shares the image-info box with the badge.
    expect(within(card()).getByText('پرفروش').parentElement).toContainElement(
      within(card()).getByRole('timer'),
    )
  })

  it('shows one day or more as days, and the clock under a day', () => {
    const { unmount } = renderCard(
      discountedCard({ discount_time_remaining: Date.now() + (2 * 24 + 5) * 3_600_000 }),
    )
    expect(within(card()).getByRole('timer').textContent).toBe('۲ روز')
    unmount()

    renderCard(discountedCard({ discount_time_remaining: Date.now() + 3_723_000 }))
    expect(within(card()).getByRole('timer').textContent).toMatch(/^۰۱:۰۲:۰[۲۳]$/u)
  })

  it('hides a countdown whose deal is already over (a cached page)', () => {
    renderCard(discountedCard({ discount_time_remaining: Date.now() - 60_000 }))
    expect(within(card()).queryByRole('timer')).toBeNull()
  })

  it('opens quick view on the product from its icon', async () => {
    useQuickViewStore.setState({ request: null, open: false, hosts: 1 })
    renderCard(cardFixture())
    await userEvent.click(within(card()).getByRole('button', { name: 'مشاهده سریع' }))
    expect(useQuickViewStore.getState()).toMatchObject({
      open: true,
      request: { slug: 'samsung-galaxy-s25-ultra' },
    })
  })

  it('hands its name id to an add slot given as a function', () => {
    const { wrapper } = clientProviders()
    render(
      <ProductCard
        product={cardFixture()}
        showOutOfStockLabel
        addSlot={(nameId) => (
          <button type="button" aria-describedby={nameId}>
            افزودن به سبد خرید
          </button>
        )}
      />,
      { wrapper },
    )
    expect(
      within(card()).getByRole('button', { name: 'افزودن به سبد خرید' }),
    ).toHaveAccessibleDescription(NAME)
  })

  it('renders the add slot inside the card', () => {
    const { wrapper } = clientProviders()
    render(
      <ProductCard
        product={cardFixture()}
        showOutOfStockLabel
        addSlot={<button type="button">افزودن به سبد خرید</button>}
      />,
      { wrapper },
    )
    expect(within(card()).getByRole('button', { name: 'افزودن به سبد خرید' })).toBeInTheDocument()
  })

  it('adds the product to the compare list with its deepest category', async () => {
    renderCard(cardFixture())
    await userEvent.click(within(card()).getByRole('button', { name: 'افزودن به مقایسه' }))
    expect(useCompare.getState().items).toEqual([
      {
        slug: 'samsung-galaxy-s25-ultra',
        name: NAME,
        image: cardFixture().image,
        categoryId: 10002,
      },
    ])
    expect(within(card()).getByRole('button', { name: 'حذف از مقایسه' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
  })

  it('reads the name first: the stock label and the badge come after it', () => {
    renderCard(cardFixture({ in_stock: false }))
    const link = within(card()).getByRole('link', { name: NAME })
    for (const text of [OUT_OF_STOCK, 'پرفروش']) {
      const label = within(card()).getByText(text)
      expect(link.compareDocumentPosition(label) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    }
  })

  it('leaves the image without alt text, since the name link beside it says it all', () => {
    renderCard(cardFixture())
    expect(card().querySelector('img')).toHaveAttribute('alt', '')
  })

  it('describes each action button with the product name', () => {
    const { wrapper } = clientProviders()
    render(<ProductCard product={cardFixture()} showOutOfStockLabel />, { wrapper })
    const buttons = within(card()).getAllByRole('button')
    expect(buttons).toHaveLength(3)
    for (const button of buttons) expect(button).toHaveAccessibleDescription(NAME)
  })

  it('reveals the action buttons on hover only where hover exists', () => {
    const { wrapper } = clientProviders()
    render(<ProductCard product={cardFixture()} showOutOfStockLabel />, { wrapper })
    for (const button of within(card()).getAllByRole('button')) {
      expect(button).toHaveClass(
        '[@media(hover:hover)]:opacity-0',
        'group-hover/card:opacity-100',
        'group-focus-within/card:opacity-100',
      )
    }
  })
})
