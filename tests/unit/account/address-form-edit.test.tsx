import { screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { HOME, WORK } from './address-fixtures'
import { callsTo, failure, field, renderForm, setUpAddressApi, written } from './address-support'

// The address form, an edit (cart digest §7.2, §7.3): a PATCH of what changed to …/update/, the
// province and city together, both coordinates null when the pin goes, the default's rule, and an
// address that went meanwhile.

const mocks = vi.hoisted(() => ({ bffFetch: vi.fn() }))
vi.mock('@/lib/api/client', () => ({ bffFetch: mocks.bffFetch }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: vi.fn(), push: vi.fn() }) }))

const api = setUpAddressApi(mocks.bffFetch)

describe('AddressForm: an edit', () => {
  it('sends a PATCH of what changed only, to …/update/', async () => {
    api.write.mockResolvedValue(written({ ...HOME, title: 'منزل' }))
    const { user, onSaved } = renderForm(HOME)
    expect(field.title()).toHaveValue('خانه')
    expect(field.mobile()).toHaveValue('09121234501')
    await user.clear(field.title())
    await user.type(field.title(), 'منزل')
    await user.click(field.save())
    await waitFor(() => expect(onSaved).toHaveBeenCalled())
    expect(callsTo(mocks.bffFetch, `account/address/${HOME.id}/update/`)).toEqual([
      expect.objectContaining({ method: 'PATCH', body: { title: 'منزل' } }),
    ])
  })

  it('sends the province and the city together when the city changed', async () => {
    api.write.mockResolvedValue(written({ ...HOME, city: 313, city_name: 'شهریار' }))
    const { user, onSaved } = renderForm(HOME)
    await waitFor(() => expect(field.city()).toHaveValue('301'))
    await user.selectOptions(field.city(), 'شهریار')
    await user.click(field.save())
    await waitFor(() => expect(onSaved).toHaveBeenCalled())
    expect(callsTo(mocks.bffFetch, `account/address/${HOME.id}/update/`)[0]!.body).toEqual({
      province: 8,
      city: 313,
    })
  })

  it('removing the pin sends both coordinates as null (never one alone)', async () => {
    api.write.mockResolvedValue(written({ ...HOME, latitude: null, longitude: null }))
    const { user, onSaved } = renderForm(HOME)
    await user.click(screen.getByRole('button', { name: 'حذف موقعیت' }))
    await user.click(field.save())
    await waitFor(() => expect(onSaved).toHaveBeenCalled())
    expect(callsTo(mocks.bffFetch, `account/address/${HOME.id}/update/`)[0]!.body).toEqual({
      latitude: null,
      longitude: null,
    })
  })

  it('nothing changed: nothing sent', async () => {
    const { user, onSaved } = renderForm(WORK)
    await user.click(field.save())
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(WORK))
    expect(api.write).not.toHaveBeenCalled()
  })

  it('the only address stays the default: its switch is on and cannot be turned off', async () => {
    api.book = [HOME]
    renderForm(HOME)
    await waitFor(() => expect(field.isDefault()).toBeDisabled())
    expect(field.isDefault()).toBeChecked()
  })

  it('the default of a larger book may be turned off (the API promotes another)', async () => {
    renderForm(HOME)
    await waitFor(() => expect(field.isDefault()).toBeEnabled())
    expect(field.isDefault()).toBeChecked()
  })

  it('an address deleted meanwhile (404): «این آدرس دیگر وجود ندارد»', async () => {
    api.write.mockRejectedValue(
      failure([{ code: 'not_found', detail: 'یافت نشد.', attr: null }], 404),
    )
    const { user } = renderForm(WORK)
    await user.clear(field.title())
    await user.type(field.title(), 'دفتر')
    const reads = callsTo(mocks.bffFetch, 'account/address/list/').length
    await user.click(field.save())
    expect(await screen.findByRole('alert')).toHaveTextContent('این آدرس دیگر وجود ندارد.')
    // The book is read again (the address went elsewhere).
    await waitFor(() =>
      expect(callsTo(mocks.bffFetch, 'account/address/list/').length).toBeGreaterThan(reads),
    )
  })
})
