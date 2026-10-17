import { act, screen, waitFor, within } from '@testing-library/react'
import { useState } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AddressSheet } from '@/features/account/addresses/address-sheet'
import type { Address } from '@/lib/api/types/address'
import { minWidth, stubBrowserApis } from '../support/dom-stubs'
import { HOME, WORK } from './address-fixtures'
import { field, renderSignedIn, stubApi, written, type ApiStub } from './address-support'

// The address sheet (reused by Plan 4's checkout): the form in a Sheet, which keeps what was typed
// when the sheet swaps its phone and desktop variants, starts afresh on each opening, and does
// not close while a save is on its way.

const mocks = vi.hoisted(() => ({ bffFetch: vi.fn() }))
vi.mock('@/lib/api/client', () => ({ bffFetch: mocks.bffFetch }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: vi.fn(), push: vi.fn() }) }))

let viewport: ReturnType<typeof stubBrowserApis>
let write: ReturnType<typeof vi.fn<ApiStub['write']>>

beforeEach(() => {
  vi.clearAllMocks()
  viewport = stubBrowserApis()
  write = vi.fn<ApiStub['write']>()
  stubApi(mocks.bffFetch, { book: [HOME, WORK], write })
})

function Harness({ initial, onSaved = vi.fn() }: { initial?: Address; onSaved?: () => void }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        open
      </button>
      <span data-testid="state">{open ? 'open' : 'closed'}</span>
      <AddressSheet open={open} onOpenChange={setOpen} initial={initial} onSaved={onSaved} />
    </>
  )
}

describe('AddressSheet', () => {
  it('keeps what was typed when the phone turns (bottom sheet ↔ side panel)', async () => {
    const { user } = renderSignedIn(<Harness />)
    await user.click(screen.getByRole('button', { name: 'open' }))
    await screen.findByRole('dialog', { name: 'افزودن آدرس جدید' })
    await user.type(field.title(), 'منزل پدری')
    act(() => viewport.set(minWidth(48)))
    expect(await screen.findByRole('dialog', { name: 'افزودن آدرس جدید' })).toBeInTheDocument()
    expect(field.title()).toHaveValue('منزل پدری')
  })

  it('opens on the address to edit, and afresh after a close', async () => {
    const { user } = renderSignedIn(<Harness initial={WORK} />)
    await user.click(screen.getByRole('button', { name: 'open' }))
    const sheet = await screen.findByRole('dialog', { name: 'ویرایش آدرس' })
    expect(field.title()).toHaveValue('محل کار')
    await user.clear(field.title())
    await user.type(field.title(), 'دفتر')
    await user.click(within(sheet).getByRole('button', { name: 'انصراف' }))
    await waitFor(() => expect(screen.getByTestId('state')).toHaveTextContent('closed'))
    await user.click(screen.getByRole('button', { name: 'open' }))
    await screen.findByRole('dialog', { name: 'ویرایش آدرس' })
    expect(field.title()).toHaveValue('محل کار')
  })

  it('stays open while the save is on its way, then the caller closes it', async () => {
    let answer: () => void = () => {}
    write.mockReturnValue(new Promise((resolve) => (answer = () => resolve(written(WORK)))))
    const onSaved = vi.fn()
    const { user } = renderSignedIn(<Harness initial={WORK} onSaved={onSaved} />)
    await user.click(screen.getByRole('button', { name: 'open' }))
    const sheet = await screen.findByRole('dialog', { name: 'ویرایش آدرس' })
    await user.type(field.title(), ' ۲')
    await user.click(field.save())
    await waitFor(() => expect(field.save()).toHaveAttribute('aria-busy', 'true'))
    await user.click(within(sheet).getByRole('button', { name: 'بستن' }))
    await user.click(within(sheet).getByRole('button', { name: 'انصراف' }))
    expect(screen.getByTestId('state')).toHaveTextContent('open')
    await act(async () => answer())
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(WORK))
  })
})
