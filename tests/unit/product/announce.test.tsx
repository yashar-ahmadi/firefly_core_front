import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { choiceSummary } from '@/features/product/announce'
import { BuyBox } from '@/features/product/components/buy-box'
import { VariantPicker } from '@/features/product/components/variant-picker'
import { stubBrowserApis } from '../support/dom-stubs'
import { AXIS, s25Product, VALUE, variantOf } from './fixtures'
import { resetRouter } from './router'
import { renderWithProduct } from './support'

vi.mock('@/lib/api/client', () => ({ bffFetch: vi.fn() }))
vi.mock('next/navigation', async () => (await import('./router')).routerMock)

const PHONE = '+982191000000'

stubBrowserApis()

beforeEach(() => {
  resetRouter()
})

describe('choiceSummary', () => {
  const product = s25Product()
  const sel = (...pairs: [number, number][]) => new Map(pairs)

  it('names the values of the axes with a choice, then the price and the stock', () => {
    const silver = sel(
      [AXIS.colour, VALUE.silver],
      [AXIS.storage, VALUE.tb1],
      [AXIS.ram, VALUE.ram12],
    )
    expect(choiceSummary(product, silver, variantOf(product, 10004))).toBe(
      'نقره ای، ۱ ترابایت: ۹۹٬۵۰۰٬۰۰۰ تومان، ناموجود',
    )
    const gold = sel(
      [AXIS.colour, VALUE.gold],
      [AXIS.storage, VALUE.gb256],
      [AXIS.ram, VALUE.ram12],
    )
    expect(choiceSummary(product, gold, variantOf(product, 10003))).toBe(
      'طلایی، ۲۵۶ گیگابایت: ۷۹٬۲۰۰٬۰۰۰ تومان',
    )
  })

  it('says so when the selection is no variant', () => {
    const black1tb = sel([AXIS.colour, VALUE.black], [AXIS.storage, VALUE.tb1])
    expect(choiceSummary(product, black1tb, null)).toBe('مشکی، ۱ ترابایت: این ترکیب موجود نیست')
  })
})

describe('BuyBox: announcing a new choice (WCAG 4.1.3)', () => {
  const status = () => within(screen.getByRole('region', { name: 'خرید' })).getByRole('status')

  it('says nothing on load, then the choice, its price and its stock after each change', async () => {
    const user = userEvent.setup()
    renderWithProduct(
      <>
        <VariantPicker />
        <BuyBox contactPhone={PHONE} />
      </>,
      { product: s25Product() },
    )
    expect(status()).toBeEmptyDOMElement()
    const storage = screen.getByRole('radiogroup', { name: 'حافظه داخلی' })
    await user.click(within(storage).getByRole('radio', { name: /^۵۱۲/ }))
    expect(status()).toHaveTextContent('مشکی، ۵۱۲ گیگابایت: ۸۶٬۹۰۰٬۰۰۰ تومان')
    const colours = screen.getByRole('radiogroup', { name: 'رنگ' })
    await user.click(within(colours).getByRole('radio', { name: /^نقره ای/ }))
    expect(status()).toHaveTextContent('نقره ای، ۱ ترابایت: ۹۹٬۵۰۰٬۰۰۰ تومان، ناموجود')
  })
})
