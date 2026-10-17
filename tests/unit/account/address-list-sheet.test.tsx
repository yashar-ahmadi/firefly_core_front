import { screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { AddressList } from '@/features/account/addresses/address-list'
import type { Address } from '@/lib/api/types/address'
import { HOME, WORK } from './address-fixtures'
import {
  callsTo,
  field,
  fillNew,
  renderSignedIn,
  setUpAddressApi,
  written,
} from './address-support'

// The address book page with its sheet: a new address and an edit saved for real (the sheet
// closes, the save is said, the focus goes back to the button that opened it), and an edit
// that turns the default off says which address the API made the default.

const mocks = vi.hoisted(() => ({ bffFetch: vi.fn(), success: vi.fn(), announce: vi.fn() }))
vi.mock('@/lib/api/client', () => ({ bffFetch: mocks.bffFetch }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: vi.fn(), push: vi.fn() }) }))
vi.mock('@/components/ui/live-announcer', () => ({ announce: mocks.announce }))
vi.mock('@/components/ui/toaster', () => ({
  toastRegionReady: () => false,
  notify: { success: mocks.success, error: vi.fn(), info: vi.fn(), dismiss: vi.fn() },
}))

const api = setUpAddressApi(mocks.bffFetch)

const cards = () => screen.getAllByRole('article')

function renderBook() {
  return renderSignedIn(<AddressList title="آدرس‌های من" />)
}

describe('AddressList: the sheet', () => {
  it('a new address: saved, the sheet closes, it is said, the focus is back on «افزودن»', async () => {
    const created: Address = { ...WORK, id: 10060, title: 'منزل پدری' }
    api.write.mockImplementation(async () => {
      api.book = [HOME, WORK, created]
      return written(created, 201)
    })
    const { user } = renderBook()
    await waitFor(() => expect(cards()).toHaveLength(2))
    const add = screen.getByRole('button', { name: 'افزودن آدرس جدید' })
    await user.click(add)
    await screen.findByRole('dialog', { name: 'افزودن آدرس جدید' })
    await fillNew(user)
    await user.click(field.save())
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(callsTo(mocks.bffFetch, 'account/address/create/')).toHaveLength(1)
    expect(cards()).toHaveLength(3)
    expect(mocks.success).toHaveBeenCalledWith('آدرس «منزل پدری» افزوده شد.')
    expect(mocks.announce).toHaveBeenCalledWith('آدرس «منزل پدری» افزوده شد.')
    await waitFor(() => expect(add).toHaveFocus())
  })

  it('the default turned off in an edit: saved, and the address made default is named', async () => {
    api.write.mockImplementation(async (path, options) => {
      expect(path).toBe(`account/address/${HOME.id}/update/`)
      expect(options.body).toEqual({ is_default: false })
      api.book = [
        { ...WORK, is_default: true },
        { ...HOME, is_default: false },
      ]
      return written({ ...HOME, is_default: false })
    })
    const { user } = renderBook()
    await waitFor(() => expect(cards()).toHaveLength(2))
    const edit = screen.getByRole('button', { name: 'ویرایش آدرس خانه' })
    await user.click(edit)
    const sheet = await screen.findByRole('dialog', { name: 'ویرایش آدرس' })
    await waitFor(() => expect(field.isDefault()).toBeEnabled())
    await user.click(field.isDefault())
    await user.click(within(sheet).getByRole('button', { name: 'ذخیرهٔ آدرس' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    const said = 'آدرس «خانه» ذخیره شد. آدرس «محل کار» اکنون پیش‌فرض است.'
    expect(mocks.success).toHaveBeenCalledWith(said)
    expect(cards()[0]).toHaveAttribute('data-address-id', String(WORK.id))
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'ویرایش آدرس خانه' })).toHaveFocus(),
    )
  })

  it('«انصراف» closes the sheet without a request', async () => {
    const { user } = renderBook()
    await waitFor(() => expect(cards()).toHaveLength(2))
    await user.click(screen.getByRole('button', { name: 'افزودن آدرس جدید' }))
    const sheet = await screen.findByRole('dialog', { name: 'افزودن آدرس جدید' })
    await user.click(within(sheet).getByRole('button', { name: 'انصراف' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(api.write).not.toHaveBeenCalled()
  })
})
