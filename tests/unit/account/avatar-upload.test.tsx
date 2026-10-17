import { act, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AvatarUpload } from '@/features/account/profile/avatar-upload'
import { avatarFileError } from '@/features/account/profile/avatar-file'
import { ME_KEY } from '@/lib/session/viewer-queries'
import { stubBrowserApis } from '../support/dom-stubs'
import { apiError, renderWithMe, saraWith, validationError } from './profile-support'

// The avatar (auth digest §4.16): JPEG, PNG or WEBP of at most 5 MB, checked before the upload
// (multipart, field `avatar_picture`), with a preview; removed with a null, after a question.

const mocks = vi.hoisted(() => ({ updateMe: vi.fn(), bffFetch: vi.fn(), announce: vi.fn() }))
vi.mock('@/features/auth/api', () => ({ authApi: { updateMe: mocks.updateMe } }))
vi.mock('@/lib/api/client', () => ({ bffFetch: mocks.bffFetch }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: vi.fn(), push: vi.fn() }) }))
vi.mock('@/components/ui/live-announcer', () => ({ announce: mocks.announce }))

const MB = 1024 * 1024
const OBJECT_URLS = { create: URL.createObjectURL, revoke: URL.revokeObjectURL }
const PICTURE = 'http://localhost:8000/media/user/avatar/3f2a.webp'

function image(name: string, type: string, bytes = 2048): File {
  const file = new File(['x'], name, { type })
  Object.defineProperty(file, 'size', { value: bytes })
  return file
}

beforeEach(() => {
  vi.clearAllMocks()
  stubBrowserApis()
  vi.useFakeTimers({ shouldAdvanceTime: true })
  // jsdom has no object URLs.
  URL.createObjectURL = vi.fn(() => 'blob:http://localhost:3000/preview-1')
  URL.revokeObjectURL = vi.fn()
})

afterEach(() => {
  vi.useRealTimers()
  URL.createObjectURL = OBJECT_URLS.create
  URL.revokeObjectURL = OBJECT_URLS.revoke
})

const fileInput = (container: HTMLElement) =>
  container.querySelector<HTMLInputElement>('input[type="file"]')!

function pick(container: HTMLElement, file: File) {
  fireEvent.change(fileInput(container), { target: { files: [file] } })
}

describe('avatarFileError', () => {
  it('takes JPEG, PNG and WEBP of up to 5 MB', () => {
    expect(avatarFileError(image('a.jpg', 'image/jpeg', 5 * MB))).toBeNull()
    expect(avatarFileError(image('a.png', 'image/png'))).toBeNull()
    expect(avatarFileError(image('a.webp', 'image/webp'))).toBeNull()
  })

  it('refuses another type (SVG, GIF, a PDF) and anything over 5 MB', () => {
    for (const type of ['image/svg+xml', 'image/gif', 'application/pdf', '']) {
      expect(avatarFileError(image('a', type)), type).toBe(
        'فقط تصویر JPG، PNG یا WEBP را می‌توان گذاشت.',
      )
    }
    expect(avatarFileError(image('a.jpg', 'image/jpeg', 5 * MB + 1))).toBe(
      'حجم تصویر باید حداکثر ۵ مگابایت باشد.',
    )
  })
})

describe('AvatarUpload', () => {
  it('accepts only the three types in the picker, opened by «انتخاب تصویر»', () => {
    const { container } = renderWithMe((me) => <AvatarUpload me={me} />)
    expect(screen.getByRole('heading', { level: 2, name: 'تصویر پروفایل' })).toBeVisible()
    expect(fileInput(container)).toHaveAttribute('accept', 'image/jpeg,image/png,image/webp')
    const click = vi.spyOn(fileInput(container), 'click')
    fireEvent.click(screen.getByRole('button', { name: 'انتخاب تصویر' }))
    expect(click).toHaveBeenCalled()
    // Nothing to remove: sara has no picture.
    expect(screen.queryByRole('button', { name: 'حذف تصویر' })).toBeNull()
  })

  it('refuses a wrong file before any upload, said on the button', async () => {
    const { container } = renderWithMe((me) => <AvatarUpload me={me} />)
    pick(container, image('logo.svg', 'image/svg+xml'))
    const choose = screen.getByRole('button', { name: 'انتخاب تصویر' })
    await waitFor(() =>
      expect(choose).toHaveAccessibleDescription(
        expect.stringContaining('فقط تصویر JPG، PNG یا WEBP را می‌توان گذاشت.'),
      ),
    )
    pick(container, image('big.jpg', 'image/jpeg', 6 * MB))
    await waitFor(() =>
      expect(choose).toHaveAccessibleDescription(
        expect.stringContaining('حجم تصویر باید حداکثر ۵ مگابایت باشد.'),
      ),
    )
    expect(screen.queryByRole('img', { name: 'پیش‌نمایش تصویر انتخاب‌شده' })).toBeNull()
    expect(mocks.updateMe).not.toHaveBeenCalled()
  })

  it('previews a good file, uploads it on «ذخیرهٔ تصویر» and shows the answer', async () => {
    const saved = saraWith({ avatar_picture: PICTURE })
    mocks.updateMe.mockResolvedValue(saved)
    const { container, client, user } = renderWithMe((me) => <AvatarUpload me={me} />)
    const file = image('me.png', 'image/png')
    pick(container, file)
    expect(await screen.findByRole('img', { name: 'پیش‌نمایش تصویر انتخاب‌شده' })).toHaveAttribute(
      'src',
      'blob:http://localhost:3000/preview-1',
    )

    await user.click(screen.getByRole('button', { name: 'ذخیرهٔ تصویر' }))
    await waitFor(() => expect(mocks.updateMe).toHaveBeenCalledWith({ avatar_picture: file }))
    await waitFor(() => expect(client.getQueryData(ME_KEY)).toEqual(saved))
    expect(await screen.findByText('تصویر پروفایل ذخیره شد.')).toBeInTheDocument()
    expect(mocks.announce).toHaveBeenCalledWith('تصویر پروفایل ذخیره شد.')
    expect(screen.queryByRole('img', { name: 'پیش‌نمایش تصویر انتخاب‌شده' })).toBeNull()
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:http://localhost:3000/preview-1')
    expect(screen.getByRole('button', { name: 'حذف تصویر' })).toBeInTheDocument()
  })

  it('«انصراف» drops the preview without a request', async () => {
    const { container, user } = renderWithMe((me) => <AvatarUpload me={me} />)
    pick(container, image('me.jpg', 'image/jpeg'))
    await user.click(await screen.findByRole('button', { name: 'انصراف' }))
    expect(screen.queryByRole('img', { name: 'پیش‌نمایش تصویر انتخاب‌شده' })).toBeNull()
    expect(URL.revokeObjectURL).toHaveBeenCalled()
    expect(mocks.updateMe).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'انتخاب تصویر' })).toHaveFocus()
  })

  it('shows the API’s word on a file it refuses; «انصراف» takes it away with the file', async () => {
    mocks.updateMe.mockRejectedValue(
      validationError([['avatar_picture', 'فایل ارسال‌شده تصویر نیست.']]),
    )
    const { container, user } = renderWithMe((me) => <AvatarUpload me={me} />)
    pick(container, image('fake.png', 'image/png'))
    await user.click(await screen.findByRole('button', { name: 'ذخیرهٔ تصویر' }))
    expect(await screen.findByText('فایل ارسال‌شده تصویر نیست.')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'انصراف' }))
    expect(screen.queryByText('فایل ارسال‌شده تصویر نیست.')).toBeNull()
    const choose = screen.getByRole('button', { name: 'انتخاب تصویر' })
    expect(choose).toHaveFocus()
    expect(choose).toHaveAccessibleDescription('تصویر JPG، PNG یا WEBP، حداکثر ۵ مگابایت.')
  })

  it('a 429 holds «ذخیرهٔ تصویر» for retry_after', async () => {
    mocks.updateMe
      .mockRejectedValueOnce(
        apiError(429, 'throttled', 'لطفاً 30 ثانیه صبر کنید.', { retryAfter: 30 }),
      )
      .mockResolvedValueOnce(saraWith({ avatar_picture: PICTURE }))
    const { container, user } = renderWithMe((me) => <AvatarUpload me={me} />)
    pick(container, image('me.png', 'image/png'))
    const save = await screen.findByRole('button', { name: 'ذخیرهٔ تصویر' })
    await user.click(save)
    expect(await screen.findByRole('alert')).toHaveTextContent('لطفاً ۳۰ ثانیه صبر کنید.')
    await waitFor(() => expect(save).toHaveAttribute('aria-disabled', 'true'))
    expect(save).toHaveAccessibleDescription('زمان باقی‌مانده تا تلاش دوباره: ۰۰:۳۰')
    await user.click(save)
    expect(mocks.updateMe).toHaveBeenCalledOnce()
    await act(() => vi.advanceTimersByTimeAsync(31_000))
    await user.click(save)
    expect(await screen.findByText('تصویر پروفایل ذخیره شد.')).toBeInTheDocument()
  })

  it('«انصراف» waits for an upload in flight: the preview stays until the answer', async () => {
    let answer: (profile: ReturnType<typeof saraWith>) => void = () => {}
    mocks.updateMe.mockReturnValue(new Promise((resolve) => (answer = resolve)))
    const { container, user } = renderWithMe((me) => <AvatarUpload me={me} />)
    pick(container, image('me.png', 'image/png'))
    await user.click(await screen.findByRole('button', { name: 'ذخیرهٔ تصویر' }))
    const cancel = screen.getByRole('button', { name: 'انصراف' })
    await waitFor(() => expect(cancel).toHaveAttribute('aria-disabled', 'true'))
    await user.click(cancel)
    expect(screen.getByRole('img', { name: 'پیش‌نمایش تصویر انتخاب‌شده' })).toBeVisible()
    await act(async () => answer(saraWith({ avatar_picture: PICTURE })))
    expect(await screen.findByText('تصویر پروفایل ذخیره شد.')).toBeInTheDocument()
  })

  it('«انصراف» of the remove question waits for the removal in flight', async () => {
    let answer: (profile: ReturnType<typeof saraWith>) => void = () => {}
    mocks.updateMe.mockReturnValue(new Promise((resolve) => (answer = resolve)))
    const { user } = renderWithMe((me) => <AvatarUpload me={me} />, {
      me: saraWith({ avatar_picture: PICTURE }),
    })
    await user.click(screen.getByRole('button', { name: 'حذف تصویر' }))
    const question = screen.getByRole('group', { name: 'تصویر حذف شود؟' })
    await user.click(within(question).getByRole('button', { name: 'بله، حذف شود' }))
    const cancel = within(question).getByRole('button', { name: 'انصراف' })
    await waitFor(() => expect(cancel).toHaveAttribute('aria-disabled', 'true'))
    await user.click(cancel)
    expect(screen.getByRole('group', { name: 'تصویر حذف شود؟' })).toBeVisible()
    await act(async () => answer(saraWith({ avatar_picture: null })))
    expect(await screen.findByText('تصویر پروفایل حذف شد.')).toBeInTheDocument()
  })

  it('«حذف تصویر» asks first, in place: «انصراف» keeps it, «بله، حذف شود» sends a null', async () => {
    mocks.updateMe.mockResolvedValue(saraWith({ avatar_picture: null }))
    const { user, client } = renderWithMe((me) => <AvatarUpload me={me} />, {
      me: saraWith({ avatar_picture: PICTURE }),
    })
    const remove = screen.getByRole('button', { name: 'حذف تصویر' })
    await user.click(remove)
    const question = screen.getByRole('group', { name: 'تصویر حذف شود؟' })
    // The harmless answer has the focus.
    expect(within(question).getByRole('button', { name: 'انصراف' })).toHaveFocus()
    await user.click(within(question).getByRole('button', { name: 'انصراف' }))
    expect(screen.queryByRole('group', { name: 'تصویر حذف شود؟' })).toBeNull()
    expect(screen.getByRole('button', { name: 'حذف تصویر' })).toHaveFocus()
    expect(mocks.updateMe).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: 'حذف تصویر' }))
    await user.click(screen.getByRole('button', { name: 'بله، حذف شود' }))
    await waitFor(() => expect(mocks.updateMe).toHaveBeenCalledWith({ avatar_picture: null }))
    await waitFor(() => expect(client.getQueryData(ME_KEY)).toMatchObject({ avatar_picture: null }))
    expect(await screen.findByText('تصویر پروفایل حذف شد.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'حذف تصویر' })).toBeNull()
    expect(screen.getByRole('button', { name: 'انتخاب تصویر' })).toHaveFocus()
  })
})
