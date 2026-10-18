import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CART_KEY } from '@/features/cart/cart-cache'
import { ReceiverSection } from '@/features/checkout/receiver-section'
import { useCheckout } from '@/features/checkout/use-checkout'
import { FeatureProvider, type FeatureMap } from '@/features/settings/feature-context'
import type { Address, Cart } from '@/lib/api/types/cart'
import { stubBrowserApis } from '../support/dom-stubs'
import { clientProviders } from '../support/providers'
import { address, addressCart, destinationCart, noDestinationCart } from './fixtures'

// «گیرنده و آدرس» (cart digest §6.6): a signed-in shopper picks a saved address (the cart's own,
// else the default, chosen for them) or adds one in the address book's sheet; a guest fills the
// receiver form (postal code required), whose province and city set the destination at once;
// without guest checkout, a guest is asked to log in.

const mocks = vi.hoisted(() => ({ bffFetch: vi.fn() }))
vi.mock('@/lib/api/client', () => ({ bffFetch: mocks.bffFetch }))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}))
// The address book's own sheet is tested on its own (tests/unit/account/address-sheet.test.tsx):
// here a stand-in that saves at once.
const NEW_ADDRESS = address({ id: 20001, title: 'محل کار', is_default: false })
vi.mock('@/features/account/addresses/lazy-overlays', () => ({
  preloadAddressSheet: () => {},
  LazyAddressSheet: ({
    open,
    initial,
    onSaved,
  }: {
    open: boolean
    initial?: Address
    onSaved: (saved: Address) => void
  }) =>
    open ? (
      <div role="dialog" aria-label={initial ? 'ویرایش آدرس' : 'افزودن آدرس جدید'}>
        <button type="button" onClick={() => onSaved(initial ?? NEW_ADDRESS)}>
          ذخیرهٔ آدرس
        </button>
      </div>
    ) : null,
}))

stubBrowserApis()

const ok = (data: unknown) => ({ data, msg: '', status: 200 })
const book = (results: Address[]) => ({
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

function serve(cart: Cart, addresses: Address[] = []) {
  mocks.bffFetch.mockImplementation((path: string, init?: { body?: { address?: number } }) => {
    if (path === 'cart/') return Promise.resolve(ok(cart))
    if (path === 'account/address/list/') return Promise.resolve(ok(book(addresses)))
    if (path === 'transportation/province/list/')
      return Promise.resolve(ok(book(PROVINCES as never)))
    if (path === 'transportation/city/list/') return Promise.resolve(ok(book(CITIES as never)))
    if (path === 'cart/destination/') {
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

function renderSection(
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
async function chooseTehran(user: ReturnType<typeof userEvent.setup>) {
  const province = await screen.findByLabelText(/استان/)
  await within(province).findByRole('option', { name: 'تهران' })
  await user.selectOptions(province, 'تهران')
  const city = screen.getByLabelText(/^شهر/)
  await within(city).findByRole('option', { name: 'تهران' })
  await user.selectOptions(city, 'تهران')
}

const destinations = () =>
  mocks.bffFetch.mock.calls.filter(([path]) => path === 'cart/destination/').map(([, i]) => i.body)

beforeEach(() => {
  mocks.bffFetch.mockReset()
  sessionStorage.clear()
})

describe('ReceiverSection, signed in', () => {
  const home = address()
  const work = address({ id: 10019, title: 'محل کار', is_default: false })

  it('lists the addresses as radios, the cart’s own chosen; another one is posted', async () => {
    const user = userEvent.setup()
    serve(addressCart(work), [home, work])
    renderSection(addressCart(work))
    const group = await screen.findByRole('radiogroup', { name: 'آدرس ارسال' })
    expect(within(group).getByRole('radio', { name: /محل کار/ })).toBeChecked()
    await user.click(within(group).getByRole('radio', { name: /خانه/ }))
    await waitFor(() => expect(destinations()).toEqual([{ address: home.id }]))
  })

  it('a cart without one gets the default (the first) for the shopper', async () => {
    serve(noDestinationCart(), [home, work])
    renderSection(noDestinationCart())
    await waitFor(() => expect(destinations()).toEqual([{ address: home.id }]))
  })

  it('«افزودن آدرس جدید» opens the address sheet; the saved address becomes the destination', async () => {
    const user = userEvent.setup()
    serve(addressCart(home), [home])
    renderSection(addressCart(home))
    await user.click(await screen.findByRole('button', { name: 'افزودن آدرس جدید' }))
    const sheet = screen.getByRole('dialog', { name: 'افزودن آدرس جدید' })
    await user.click(within(sheet).getByRole('button', { name: 'ذخیرهٔ آدرس' }))
    await waitFor(() => expect(destinations()).toEqual([{ address: NEW_ADDRESS.id }]))
  })

  it('«ویرایش» edits an address in the sheet; the cart and its options are read again', async () => {
    const user = userEvent.setup()
    serve(addressCart(home), [home, work])
    const { client } = renderSection(addressCart(home))
    const invalidate = vi.spyOn(client, 'invalidateQueries')
    await user.click(await screen.findByRole('button', { name: 'ویرایش آدرس خانه' }))
    const sheet = screen.getByRole('dialog', { name: 'ویرایش آدرس' })
    await user.click(within(sheet).getByRole('button', { name: 'ذخیرهٔ آدرس' }))
    await waitFor(() =>
      expect(invalidate).toHaveBeenCalledWith(expect.objectContaining({ queryKey: CART_KEY })),
    )
    expect(destinations()).toEqual([])
  })

  it('an empty book opens the sheet at once, with a word of why', async () => {
    serve(noDestinationCart(), [])
    renderSection(noDestinationCart())
    expect(await screen.findByRole('dialog', { name: 'افزودن آدرس جدید' })).toBeInTheDocument()
    expect(screen.getByText(/هنوز آدرسی ثبت نکرده‌اید/)).toBeInTheDocument()
  })
})

describe('ReceiverSection, guest', () => {
  it('the form: the destination as soon as the province and city are chosen', async () => {
    const user = userEvent.setup()
    serve(noDestinationCart())
    renderSection(noDestinationCart(), { hasSession: false })
    await chooseTehran(user)
    await waitFor(() => expect(destinations()).toEqual([{ province: 8, city: 301 }]))
  })

  it('«ادامه» checks everything the API will: the postal code is required here', async () => {
    const user = userEvent.setup()
    serve(destinationCart())
    renderSection(destinationCart(), { hasSession: false })
    await user.click(await screen.findByRole('button', { name: 'ادامه' }))
    const postal = screen.getByLabelText(/کد پستی/)
    expect(postal).toHaveAttribute('aria-invalid', 'true')
    expect(postal).toHaveAccessibleDescription(/کد پستی را وارد کنید/)
    expect(screen.getByLabelText(/^نام گیرنده/)).toHaveFocus()
    expect(screen.getByLabelText(/شماره موبایل گیرنده/)).toHaveAttribute('aria-invalid', 'true')
    // The buyer's own number is optional: no error for leaving it out.
    expect(screen.getByLabelText(/پیگیری سفارش/)).not.toHaveAttribute('aria-invalid')
  })

  it('a full form moves on (the receiver kept for placement)', async () => {
    const user = userEvent.setup()
    serve(destinationCart())
    renderSection(destinationCart(), { hasSession: false })
    await chooseTehran(user)
    await user.type(screen.getByLabelText(/^نام گیرنده/), 'سارا')
    await user.type(screen.getByLabelText(/نام خانوادگی گیرنده/), 'احمدی')
    await user.type(screen.getByLabelText(/شماره موبایل گیرنده/), '۰۹۱۲۱۲۳۴۵۰۱')
    await user.type(screen.getByLabelText(/آدرس کامل/), 'خیابان ولیعصر')
    await user.type(screen.getByLabelText(/کد پستی/), '۱۲۳۴۵۶۷۸۹۰')
    await user.click(screen.getByRole('button', { name: 'ادامه' }))
    await waitFor(() =>
      expect(JSON.parse(sessionStorage.getItem('ff-checkout-receiver')!)).toMatchObject({
        confirmed: true,
      }),
    )
  })

  it('without guest checkout: log in or register to go on, both coming back here', async () => {
    serve(noDestinationCart())
    renderSection(noDestinationCart(), {
      hasSession: false,
      features: {
        guest_checkout: { key: 'guest_checkout', name: 'خرید مهمان', enabled: false, reason: null },
      },
    })
    expect(
      await screen.findByText('برای ادامه\u{0654} خرید وارد حساب کاربری شوید'),
    ).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'ورود به حساب کاربری' })).toHaveAttribute(
      'href',
      '/login/?next=/checkout/',
    )
    expect(screen.getByRole('link', { name: 'ثبت‌نام' })).toHaveAttribute(
      'href',
      '/register/?next=%2Fcheckout%2F',
    )
    expect(screen.queryByLabelText(/^نام گیرنده/)).not.toBeInTheDocument()
  })
})
