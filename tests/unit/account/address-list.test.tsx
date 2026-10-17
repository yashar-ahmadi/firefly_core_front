import { act, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AddressList } from '@/features/account/addresses/address-list'
import type { Address } from '@/lib/api/types/address'
import { stubBrowserApis } from '../support/dom-stubs'
import { HOME, WORK } from './address-fixtures'
import { callsTo, failure, renderSignedIn, stubApi, written, type ApiStub } from './address-support'

// The address book page (cart digest §7): the cards (the default first, as the API orders
// them), an empty state, a skeleton and a retry; the delete question; «انتخاب به‌عنوان
// پیش‌فرض»; and after every write the book and the cart read again, with the default's move said.

const mocks = vi.hoisted(() => ({
  bffFetch: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
  announce: vi.fn(),
}))
vi.mock('@/lib/api/client', () => ({ bffFetch: mocks.bffFetch }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: vi.fn(), push: vi.fn() }) }))
vi.mock('@/components/ui/live-announcer', () => ({ announce: mocks.announce }))
vi.mock('@/components/ui/toaster', () => ({
  toastRegionReady: () => false,
  notify: { success: mocks.success, error: mocks.error, info: vi.fn(), dismiss: vi.fn() },
}))

let book: Address[]
let write: ReturnType<typeof vi.fn<ApiStub['write']>>

beforeEach(() => {
  vi.clearAllMocks()
  stubBrowserApis()
  book = [HOME, WORK]
  write = vi.fn<ApiStub['write']>()
  stubApi(mocks.bffFetch, {
    get book() {
      return book
    },
    write,
  })
})

const cards = () => screen.getAllByRole('article')
const card = (title: string) => screen.getByRole('article', { name: title })

describe('AddressList', () => {
  it('shows the book: the default first with its badge, the receiver, the place, the pin note', async () => {
    renderSignedIn(<AddressList title="آدرس‌های من" />)
    expect(screen.getByRole('heading', { level: 1, name: 'آدرس‌های من' })).toBeVisible()
    expect(screen.getByRole('button', { name: 'افزودن آدرس جدید' })).toBeVisible()
    await waitFor(() => expect(cards()).toHaveLength(2))
    expect(cards().map((article) => article.getAttribute('data-address-id'))).toEqual([
      '10001',
      '10002',
    ])
    const home = card('خانه')
    expect(within(home).getByText('پیش‌فرض')).toBeInTheDocument()
    expect(screen.getAllByText('پیش‌فرض')).toHaveLength(1)
    expect(within(home).getByText('۰۹۱۲ ۱۲۳ ۴۵۰۱')).toHaveAttribute('dir', 'ltr')
    expect(home).toHaveTextContent('تهران — تهران')
    expect(home).toHaveTextContent('پلاک ۱۲، واحد ۴')
    expect(home).toHaveTextContent('کد پستی: ۱۹۶۹۷۳۴۵۶۳')
    expect(within(home).getByText('موقعیت روی نقشه ثبت شده')).toBeInTheDocument()
    expect(within(card('محل کار')).queryByText('موقعیت روی نقشه ثبت شده')).toBeNull()
    // Each action is named with its address.
    expect(within(home).getByRole('button', { name: 'ویرایش آدرس خانه' })).toBeInTheDocument()
    expect(within(home).getByRole('button', { name: 'حذف آدرس خانه' })).toBeInTheDocument()
    expect(within(home).queryByRole('button', { name: /پیش‌فرض/ })).toBeNull()
    expect(
      within(card('محل کار')).getByRole('button', {
        name: 'انتخاب به‌عنوان پیش‌فرض (آدرس محل کار)',
      }),
    ).toBeInTheDocument()
    expect(callsTo(mocks.bffFetch, 'account/address/list/')[0]!.query).toMatchObject({ limit: 100 })
  })

  it('an empty book: the empty state offers the first address', async () => {
    book = []
    renderSignedIn(<AddressList title="آدرس‌های من" />)
    expect(
      await screen.findByRole('heading', { level: 2, name: 'هنوز آدرسی ثبت نکرده‌اید' }),
    ).toBeVisible()
    expect(screen.getAllByRole('button', { name: 'افزودن آدرس جدید' })).toHaveLength(2)
  })

  it('a book that cannot be read: «تلاش دوباره» reads it again', async () => {
    let fail = true
    stubApi(mocks.bffFetch, {
      get book() {
        if (fail) throw new Error('down')
        return book
      },
      write,
    })
    const { user } = renderSignedIn(<AddressList title="آدرس‌های من" />, { noRetry: true })
    expect(document.querySelector('[aria-busy="true"]')).not.toBeNull()
    await user.click(await screen.findByRole('button', { name: 'تلاش دوباره' }))
    fail = false
    await user.click(screen.getByRole('button', { name: 'تلاش دوباره' }))
    await waitFor(() => expect(cards()).toHaveLength(2))
  })

  it('deletes after the question; the book and the cart read again; the new default is said', async () => {
    write.mockImplementation(async (path) => {
      if (path !== `account/address/${HOME.id}/delete/`) throw new Error(path)
      book = [{ ...WORK, is_default: true }]
      return { data: null, msg: '', status: 204 }
    })
    const { user, client } = renderSignedIn(<AddressList title="آدرس‌های من" />)
    client.setQueryData(['cart'], { destination: null })
    await waitFor(() => expect(cards()).toHaveLength(2))
    await user.click(screen.getByRole('button', { name: 'حذف آدرس خانه' }))
    const dialog = await screen.findByRole('dialog', { name: 'آدرس «خانه» حذف شود؟' })
    expect(dialog).toHaveTextContent('جدیدترین آدرس دیگرتان پیش‌فرض می‌شود')
    // The harmless answer has the focus.
    expect(within(dialog).getByRole('button', { name: 'انصراف' })).toHaveFocus()
    await user.click(within(dialog).getByRole('button', { name: 'حذف آدرس' }))
    await waitFor(() => expect(cards()).toHaveLength(1))
    expect(callsTo(mocks.bffFetch, `account/address/${HOME.id}/delete/`)).toEqual([
      expect.objectContaining({ method: 'DELETE' }),
    ])
    expect(client.getQueryState(['cart'])?.isInvalidated).toBe(true)
    const said = 'آدرس «خانه» حذف شد. آدرس «محل کار» اکنون پیش‌فرض است.'
    await waitFor(() => expect(mocks.success).toHaveBeenCalledWith(said))
    expect(mocks.announce).toHaveBeenCalledWith(said)
    expect(within(card('محل کار')).getByText('پیش‌فرض')).toBeInTheDocument()
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'افزودن آدرس جدید' })).toHaveFocus(),
    )
  })

  it('«انصراف» deletes nothing', async () => {
    const { user } = renderSignedIn(<AddressList title="آدرس‌های من" />)
    await waitFor(() => expect(cards()).toHaveLength(2))
    await user.click(screen.getByRole('button', { name: 'حذف آدرس محل کار' }))
    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: 'انصراف' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(write).not.toHaveBeenCalled()
  })

  it('an address deleted elsewhere (404): the dialog closes, the list reads again, it says so', async () => {
    write.mockImplementation(async () => {
      book = [HOME]
      throw failure([{ code: 'not_found', detail: 'یافت نشد.', attr: null }], 404)
    })
    const { user } = renderSignedIn(<AddressList title="آدرس‌های من" />)
    await waitFor(() => expect(cards()).toHaveLength(2))
    await user.click(screen.getByRole('button', { name: 'حذف آدرس محل کار' }))
    await user.click(
      within(await screen.findByRole('dialog')).getByRole('button', { name: 'حذف آدرس' }),
    )
    await waitFor(() => expect(mocks.success).toHaveBeenCalledWith('این آدرس دیگر وجود ندارد.'))
    await waitFor(() => expect(cards()).toHaveLength(1))
  })

  it('«انتخاب به‌عنوان پیش‌فرض»: the card waits, then the book is read again with it first', async () => {
    let answer: () => void = () => {}
    write.mockImplementation(
      (path) =>
        new Promise((resolve) => {
          expect(path).toBe(`account/address/${WORK.id}/set-default/`)
          answer = () => {
            book = [
              { ...WORK, is_default: true },
              { ...HOME, is_default: false },
            ]
            resolve(written({ ...WORK, is_default: true }))
          }
        }),
    )
    const { user, client } = renderSignedIn(<AddressList title="آدرس‌های من" />)
    client.setQueryData(['cart'], { destination: null })
    await waitFor(() => expect(cards()).toHaveLength(2))
    const choose = screen.getByRole('button', { name: 'انتخاب به‌عنوان پیش‌فرض (آدرس محل کار)' })
    await user.click(choose)
    await waitFor(() => expect(card('محل کار')).toHaveAttribute('aria-busy', 'true'))
    expect(
      within(card('محل کار')).getByRole('button', { name: 'حذف آدرس محل کار' }),
    ).toHaveAttribute('aria-disabled', 'true')
    // A second press while it is on its way sends nothing more.
    await user.click(choose)
    await act(async () => answer())
    await waitFor(() => expect(cards()[0]).toHaveAttribute('data-address-id', String(WORK.id)))
    expect(callsTo(mocks.bffFetch, `account/address/${WORK.id}/set-default/`)).toEqual([
      expect.objectContaining({ method: 'POST' }),
    ])
    expect(client.getQueryState(['cart'])?.isInvalidated).toBe(true)
    await waitFor(() => expect(mocks.success).toHaveBeenCalledWith('آدرس «محل کار» پیش‌فرض شد.'))
    await waitFor(() => expect(card('محل کار')).toHaveFocus())
  })

  it('«افزودن آدرس جدید» opens the form in a sheet; a save closes it and is said', async () => {
    const created: Address = { ...WORK, id: 10060, title: 'منزل پدری' }
    write.mockImplementation(async () => {
      book = [HOME, WORK, created]
      return written(created, 201)
    })
    const { user } = renderSignedIn(<AddressList title="آدرس‌های من" />)
    await waitFor(() => expect(cards()).toHaveLength(2))
    await user.click(screen.getByRole('button', { name: 'افزودن آدرس جدید' }))
    const sheet = await screen.findByRole('dialog', { name: 'افزودن آدرس جدید' })
    expect(within(sheet).getByRole('button', { name: 'ذخیرهٔ آدرس' })).toBeInTheDocument()
    await user.click(within(sheet).getByRole('button', { name: 'انصراف' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })
})
