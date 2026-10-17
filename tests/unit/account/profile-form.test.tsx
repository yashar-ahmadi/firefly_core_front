import { screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AccountHeader } from '@/features/account/layout/account-header'
import { ProfileForm } from '@/features/account/profile/profile-form'
import { ME_KEY } from '@/lib/session/viewer-queries'
import { stubBrowserApis } from '../support/dom-stubs'
import { apiError, renderWithMe, saraWith, validationError } from './profile-support'

// The names (auth digest §4.16, F11): a PATCH of what changed; its answer is the profile, which
// replaces `['me']`, so every place that shows the name (the account header) follows.

const mocks = vi.hoisted(() => ({ updateMe: vi.fn(), bffFetch: vi.fn(), announce: vi.fn() }))
vi.mock('@/features/auth/api', () => ({ authApi: { updateMe: mocks.updateMe } }))
vi.mock('@/lib/api/client', () => ({ bffFetch: mocks.bffFetch }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: vi.fn(), push: vi.fn() }) }))
vi.mock('@/components/ui/live-announcer', () => ({ announce: mocks.announce }))

beforeEach(() => {
  vi.clearAllMocks()
  stubBrowserApis()
  vi.useFakeTimers({ shouldAdvanceTime: true })
})

afterEach(() => {
  vi.useRealTimers()
})

function renderForm() {
  return renderWithMe((me) => (
    <>
      <AccountHeader />
      <ProfileForm me={me} />
    </>
  ))
}

const firstName = () => screen.getByRole('textbox', { name: 'نام' })
const lastName = () => screen.getByRole('textbox', { name: 'نام خانوادگی' })
const save = () => screen.getByRole('button', { name: 'ذخیرهٔ نام' })

describe('ProfileForm', () => {
  it('starts with the names, for the browser to fill as given and family name', () => {
    renderForm()
    expect(screen.getByRole('heading', { level: 2, name: 'نام و نام خانوادگی' })).toBeVisible()
    expect(firstName()).toHaveValue('سارا')
    expect(firstName()).toHaveAttribute('autocomplete', 'given-name')
    expect(lastName()).toHaveValue('احمدی')
    expect(lastName()).toHaveAttribute('autocomplete', 'family-name')
  })

  it('«ذخیرهٔ نام» does nothing until a name changes, and again once it is back', async () => {
    const { user } = renderForm()
    expect(save()).toHaveAttribute('aria-disabled', 'true')
    await user.click(save())
    await user.type(lastName(), ' نژاد')
    expect(save()).not.toHaveAttribute('aria-disabled')
    await user.clear(lastName())
    await user.type(lastName(), 'احمدی')
    expect(save()).toHaveAttribute('aria-disabled', 'true')
    await user.type(lastName(), '{Enter}')
    expect(mocks.updateMe).not.toHaveBeenCalled()
  })

  it('sends only the changed name; ["me"] becomes the answer and the header shows it', async () => {
    const changed = saraWith({ last_name: 'احمدی‌نژاد', full_name: 'سارا احمدی‌نژاد' })
    mocks.updateMe.mockResolvedValue(changed)
    const { user, client } = renderForm()
    expect(await screen.findByText('سارا احمدی')).toBeInTheDocument()
    await user.clear(lastName())
    await user.type(lastName(), ' احمدی‌نژاد ')
    await user.click(save())

    await waitFor(() => expect(mocks.updateMe).toHaveBeenCalledWith({ last_name: 'احمدی‌نژاد' }))
    await waitFor(() => expect(client.getQueryData(ME_KEY)).toEqual(changed))
    expect(await screen.findByText('سارا احمدی‌نژاد')).toBeInTheDocument()
    expect(screen.getByText('نام شما ذخیره شد.')).toBeInTheDocument()
    expect(mocks.announce).toHaveBeenCalledWith('نام شما ذخیره شد.')
    expect(lastName()).toHaveValue('احمدی‌نژاد')
    expect(save()).toHaveAttribute('aria-disabled', 'true')
  })

  it('checks an empty name before sending', async () => {
    const { user } = renderForm()
    await user.clear(firstName())
    await user.click(save())
    expect(firstName()).toHaveAccessibleDescription('نام را وارد کنید.')
    expect(firstName()).toHaveFocus()
    expect(mocks.updateMe).not.toHaveBeenCalled()
  })

  it('puts each validation error the API gives under its field', async () => {
    mocks.updateMe.mockRejectedValue(
      validationError([
        ['first_name', 'نام بیش از حد طولانی است.'],
        ['last_name', 'نام خانوادگی خالی است.'],
      ]),
    )
    const { user } = renderForm()
    await user.type(firstName(), 'ا')
    await user.type(lastName(), 'ب')
    await user.click(save())
    await waitFor(() =>
      expect(firstName()).toHaveAccessibleDescription('نام بیش از حد طولانی است.'),
    )
    expect(lastName()).toHaveAccessibleDescription('نام خانوادگی خالی است.')
    expect(firstName()).toHaveFocus()
    expect(screen.queryByText('نام شما ذخیره شد.')).toBeNull()
  })

  it('says a failure without a field for the whole form', async () => {
    mocks.updateMe.mockRejectedValue(apiError(503, 'http_503', 'سرویس در دسترس نیست.'))
    const { user } = renderForm()
    await user.type(firstName(), ' جان')
    await user.click(save())
    expect(await screen.findByRole('alert')).toHaveTextContent('سرویس در دسترس نیست.')
    expect(firstName()).toHaveValue('سارا جان')
  })
})
