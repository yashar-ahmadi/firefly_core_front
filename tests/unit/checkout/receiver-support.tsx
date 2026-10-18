import { render, screen, within } from '@testing-library/react'
import type userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import type { Mock } from 'vitest'
import { CART_KEY } from '@/features/cart/cart-cache'
import { ReceiverSection } from '@/features/checkout/receiver-section'
import { useCheckout } from '@/features/checkout/use-checkout'
import { FeatureProvider, type FeatureMap } from '@/features/settings/feature-context'
import type { Address, Cart } from '@/lib/api/types/cart'
import { clientProviders } from '../support/providers'
import { addressCart, destinationCart, NEW_ADDRESS } from './fixtures'

// What the receiver step's tests share: the API answered through the test file's mocked
// `bffFetch` (the cart, the address book, the geography lists, the destination), and the step
// rendered with the checkout's own state.

export const ok = (data: unknown) => ({ data, msg: '', status: 200 })
export const book = (results: unknown[]) => ({
  count: results.length,
  total_pages: 1,
  current_page: 1,
  page_size: 100,
  next: null,
  previous: null,
  results,
})
const PROVINCES = [
  { id: 4, name: 'اصفهان' },
  { id: 8, name: 'تهران' },
]
const CITIES = [
  { id: 301, name: 'تهران', province: 8, province_name: 'تهران' },
  { id: 313, name: 'شهریار', province: 8, province_name: 'تهران' },
]

type DestinationBody = { address?: number; province?: number; city?: number }

export function serve(
  bffFetch: Mock,
  cart: Cart,
  addresses: Address[] = [],
  destination?: (body: DestinationBody) => Promise<unknown>,
) {
  bffFetch.mockImplementation((path: string, init?: { body?: DestinationBody }) => {
    if (path === 'cart/') return Promise.resolve(ok(cart))
    if (path === 'account/address/list/') return Promise.resolve(ok(book(addresses)))
    if (path === 'transportation/province/list/') return Promise.resolve(ok(book(PROVINCES)))
    if (path === 'transportation/city/list/') return Promise.resolve(ok(book(CITIES)))
    if (path === 'cart/destination/') {
      if (destination) return destination(init!.body!)
      const id = init?.body?.address
      const saved = addresses.find((item) => item.id === id) ?? NEW_ADDRESS
      return Promise.resolve(ok(id ? addressCart(saved) : destinationCart()))
    }
    return new Promise(() => {})
  })
}

function Harness() {
  return <ReceiverSection checkout={useCheckout()} />
}

export function renderSection(
  cart: Cart,
  {
    hasSession = true,
    features = {},
  }: { hasSession?: boolean; features?: Partial<FeatureMap> } = {},
) {
  const { client, wrapper: Wrapper } = clientProviders({ hasSession })
  client.setQueryData(CART_KEY, cart)
  const wrapper = ({ children }: { children: ReactNode }) => (
    <FeatureProvider initial={features}>
      <Wrapper>{children}</Wrapper>
    </FeatureProvider>
  )
  return { client, ...render(<Harness />, { wrapper }) }
}

/** «استان» then «شهر»: Tehran, once each list has come. */
export async function chooseTehran(user: ReturnType<typeof userEvent.setup>) {
  const province = await screen.findByLabelText(/استان/)
  await within(province).findByRole('option', { name: 'تهران' })
  await user.selectOptions(province, 'تهران')
  const city = screen.getByLabelText(/^شهر/)
  await within(city).findByRole('option', { name: 'تهران' })
  await user.selectOptions(city, 'تهران')
}

export const destinations = (bffFetch: Mock) =>
  bffFetch.mock.calls.filter(([path]) => path === 'cart/destination/').map(([, i]) => i.body)
