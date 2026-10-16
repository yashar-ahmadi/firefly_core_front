import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ProductGrid } from '@/features/catalog/components/product-grid'
import { ProductRail } from '@/features/catalog/components/product-rail'
import { useQuickViewStore } from '@/features/quick-view/use-quick-view'
import type { ProductCard } from '@/lib/api/types/catalog'
import { stubBrowserApis } from '../support/dom-stubs'
import { clientProviders } from '../support/providers'
import { cardFixture } from './card-fixtures'

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock('@/lib/api/client', () => ({ bffFetch: vi.fn() }))

stubBrowserApis()

const CHOOSE = 'انتخاب ویژگی\u{200C}ها'

/** A variable product, a simple one, and a simple one without a variant. */
const PRODUCTS: ProductCard[] = [
  cardFixture({ id: 1, slug: 'variable', name: 'کالای چندگونه', type: 'variable' }),
  cardFixture({ id: 2, slug: 'simple', name: 'کالای ساده', type: 'simple', default_variant_id: 7 }),
  cardFixture({
    id: 3,
    slug: 'no-variant',
    name: 'کالای بی\u{200C}گونه',
    type: 'simple',
    default_variant_id: null,
  }),
]

beforeEach(() => {
  useQuickViewStore.setState({ request: null, open: false, hosts: 1 })
})

describe.each([
  ['ProductGrid', () => <ProductGrid products={PRODUCTS} showOutOfStockLabel withAction />],
  ['ProductRail', () => <ProductRail products={PRODUCTS} ariaLabel="ریل" showOutOfStockLabel />],
])('the add slot in %s (one shared decision)', (_name, ui) => {
  function renderCards() {
    const { wrapper } = clientProviders()
    render(ui(), { wrapper })
    return screen.getAllByRole('article')
  }

  it('adds a simple product in one tap, its button described by the name', () => {
    const [, simple] = renderCards()
    const add = within(simple!).getByRole('button', { name: /افزودن به سبد/ })
    expect(add).toHaveAccessibleDescription('کالای ساده')
  })

  it('gives a variable product a real «انتخاب ویژگی‌ها» button that opens quick view', async () => {
    const [variable] = renderCards()
    expect(within(variable!).queryByRole('button', { name: /افزودن به سبد/ })).toBeNull()
    const choose = within(variable!).getByRole('button', { name: CHOOSE })
    expect(choose).toHaveAccessibleDescription('کالای چندگونه')
    expect(choose).not.toHaveAttribute('aria-hidden')
    expect(choose).not.toHaveAttribute('tabindex')
    await userEvent.click(choose)
    expect(useQuickViewStore.getState().request).toMatchObject({ slug: 'variable' })
  })

  it('gives a product without variants no action', () => {
    const [, , none] = renderCards()
    expect(within(none!).queryByRole('button', { name: /افزودن به سبد/ })).toBeNull()
    expect(within(none!).queryByRole('button', { name: CHOOSE })).toBeNull()
  })
})
