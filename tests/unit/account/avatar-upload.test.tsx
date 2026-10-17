import { fireEvent, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AvatarUpload } from '@/features/account/profile/avatar-upload'
import { avatarFileError } from '@/features/account/profile/avatar-file'
import { ME_KEY } from '@/lib/session/viewer-queries'
import { stubBrowserApis } from '../support/dom-stubs'
import { renderWithMe, saraWith, validationError } from './profile-support'

// The avatar (auth digest §4.16): JPEG, PNG or WEBP of at most 5 MB, checked before the upload
// (multipart, field `avatar_picture`), with a preview; removed with a null.

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

  it('shows the API’s word on a file it refuses (avatar_picture)', async () => {
    mocks.updateMe.mockRejectedValue(
      validationError([['avatar_picture', 'فایل ارسال‌شده تصویر نیست.']]),
    )
    const { container, user } = renderWithMe((me) => <AvatarUpload me={me} />)
    pick(container, image('fake.png', 'image/png'))
    await user.click(await screen.findByRole('button', { name: 'ذخیرهٔ تصویر' }))
    expect(await screen.findByText('فایل ارسال‌شده تصویر نیست.')).toBeInTheDocument()
  })

  it('removes the picture with a null', async () => {
    mocks.updateMe.mockResolvedValue(saraWith({ avatar_picture: null }))
    const { user, client } = renderWithMe((me) => <AvatarUpload me={me} />, {
      me: saraWith({ avatar_picture: PICTURE }),
    })
    await user.click(screen.getByRole('button', { name: 'حذف تصویر' }))
    await waitFor(() => expect(mocks.updateMe).toHaveBeenCalledWith({ avatar_picture: null }))
    await waitFor(() => expect(client.getQueryData(ME_KEY)).toMatchObject({ avatar_picture: null }))
    expect(await screen.findByText('تصویر پروفایل حذف شد.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'حذف تصویر' })).toBeNull()
  })
})
