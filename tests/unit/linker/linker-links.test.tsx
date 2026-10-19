import { screen, within } from '@testing-library/react'
import { createElement, type ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import LinksPage, { generateMetadata } from '@/app/links/page'
import type { LinkerData } from '@/lib/api/types/linker'
import { renderTree, thrown } from '../blog/page-support'
import { stubBrowserApis } from '../support/dom-stubs'
import { link, linkerFixture, linkTo } from './linker-fixtures'

// `/links/` (content digest §8): each link type as the table says (a store path through the
// router, a post never prefetched, a short link and any other site a plain link; `mailto:` and
// `tel:`; text never HTML; Aparat and YouTube embedded, any other video a button; an unknown type
// nothing); the route's read (300 s, for everyone), its 404 for a page never saved, its head.

const mocks = vi.hoisted(() => ({ apiFetch: vi.fn() }))

vi.mock('server-only', () => ({}))
vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND')
  },
}))
// A store link shows what it would prefetch (P5-R1: never a post).
vi.mock('next/link', () => ({
  default: ({
    href,
    prefetch,
    children,
    ...props
  }: {
    href: string
    prefetch?: boolean
    children: ReactNode
  }) =>
    createElement(
      'a',
      { href, 'data-next-link': '', 'data-prefetch': String(prefetch), ...props },
      children,
    ),
}))
vi.mock('@/lib/api/server', () => ({ apiFetch: mocks.apiFetch }))
vi.mock('@/features/settings/api', () => ({
  getTranslations: async () => ({}),
  getSiteSettings: async () => ({ name: 'فایرفلای' }),
}))

stubBrowserApis()

async function show(linker: LinkerData = linkerFixture()) {
  mocks.apiFetch.mockResolvedValue({ data: linker, msg: '', status: 200, headers: new Headers() })
  return renderTree(await LinksPage())
}

const links = () => screen.getByRole('list', { name: 'پیوندها' })
const item = (name: string) => within(links()).getByRole('link', { name: new RegExp(name) })

beforeEach(() => {
  mocks.apiFetch.mockReset()
})

describe('the links, by type', () => {
  it('a button to a store path routes in the shop (prefetched); a post is never prefetched', async () => {
    await show(
      linkerFixture({
        links: [
          linkTo(1, 'button', 'پرچمدارها', '/product/list/flagship-phones/'),
          linkTo(2, 'button', 'راهنمای خرید', '/blog/best-phones-under-30m/'),
          linkTo(3, 'button', 'جشنواره', '/s/phone-fest'),
          linkTo(4, 'button', 'اینستاگرام ما', 'https://instagram.com/x'),
        ],
      }),
    )
    expect(item('پرچمدارها')).toHaveAttribute('href', '/product/list/flagship-phones/')
    expect(item('پرچمدارها')).toHaveAttribute('data-next-link')
    expect(item('پرچمدارها')).toHaveAttribute('data-prefetch', 'undefined')
    expect(item('راهنمای خرید')).toHaveAttribute('data-prefetch', 'false')
    // A short link counts a visit per request: a plain link, never the router's.
    expect(item('جشنواره')).toHaveAttribute('href', '/s/phone-fest')
    expect(item('جشنواره')).not.toHaveAttribute('data-next-link')
    expect(item('اینستاگرام ما')).toHaveAttribute('href', 'https://instagram.com/x')
    expect(item('اینستاگرام ما')).not.toHaveAttribute('data-next-link')
  })

  it('email and phone: the API’s mailto: and tel:; text: a heading and its lines, never HTML', async () => {
    await show(
      linkerFixture({
        links: [
          ...linkerFixture().links.slice(1),
          link({
            id: 9,
            link_type: 'text',
            title: 'نکته',
            value: '<b>مهم</b>\nخط دوم',
            href: null,
          }),
        ],
      }),
    )
    expect(item('ایمیل به پشتیبانی')).toHaveAttribute('href', 'mailto:support@firefly-core.ir')
    expect(item('تماس با پشتیبانی')).toHaveAttribute('href', 'tel:+982191001234')
    expect(item('تماس با پشتیبانی')).toHaveTextContent('۰۲۱ ۹۱۰۰ ۱۲۳۴')
    expect(screen.getByRole('heading', { level: 2, name: 'ساعت پاسخگویی' })).toBeInTheDocument()
    const note = screen.getByText(/خط دوم/)
    expect(note.textContent).toBe('<b>مهم</b>\nخط دوم')
    expect(note.querySelector('b')).toBeNull()
    expect(note.className).toContain('whitespace-pre-line')
  })

  it('a video: an Aparat or YouTube embed, lazy, titled; any other video is a button', async () => {
    await show(
      linkerFixture({
        links: [
          linkTo(1, 'video', 'معرفی فروشگاه', 'https://www.aparat.com/v/rajj65c'),
          linkTo(2, 'video', 'جعبه‌گشایی', 'https://youtu.be/dQw4w9WgXcQ'),
          linkTo(3, 'video', 'ویدیوی دیگر', 'https://vimeo.com/1'),
        ],
      }),
    )
    const frames = [...document.querySelectorAll('iframe')]
    expect(frames.map((frame) => frame.getAttribute('src'))).toEqual([
      'https://www.aparat.com/video/video/embed/videohash/rajj65c/vt/frame',
      'https://www.youtube.com/embed/dQw4w9WgXcQ',
    ])
    for (const frame of frames) {
      expect(frame).toHaveAttribute('loading', 'lazy')
      expect(frame).toHaveAttribute('referrerpolicy', 'strict-origin-when-cross-origin')
      expect(frame.getAttribute('allow')).toContain('encrypted-media')
      expect(frame).toHaveAttribute('allowfullscreen')
    }
    expect(frames[0]).toHaveAttribute('title', 'معرفی فروشگاه')
    expect(item('ویدیوی دیگر')).toHaveAttribute('href', 'https://vimeo.com/1')
  })

  it('a link whose address is not its type’s renders nothing', async () => {
    await show(
      linkerFixture({
        links: [
          link({
            id: 1,
            link_type: 'email',
            title: 'نامه',
            value: 'x',
            href: 'javascript:alert(1)',
          }),
          link({ id: 2, link_type: 'phone', title: 'تلفن', value: 'x', href: 'https://x.example' }),
          linkTo(3, 'button', 'دکمه', 'javascript:alert(1)'),
          ...linkerFixture().links.slice(0, 1),
        ],
      }),
    )
    expect(within(links()).getAllByRole('listitem')).toHaveLength(1)
    expect(document.querySelector('a[href^="javascript:"]')).toBeNull()
  })

  it('an unknown type renders nothing', async () => {
    const unknown = {
      id: 7,
      link_type: 'map',
      title: 'نقشه',
      value: 'x',
      href: 'https://x.example',
      thumbnail: null,
    }
    await show(linkerFixture({ links: [unknown as never, ...linkerFixture().links.slice(0, 1)] }))
    expect(within(links()).getAllByRole('listitem')).toHaveLength(1)
    expect(screen.queryByText('نقشه')).toBeNull()
  })
})

describe('the route', () => {
  it('reads the linker anonymously, cached 300 s', async () => {
    await show()
    expect(mocks.apiFetch).toHaveBeenCalledExactlyOnceWith('linker', {
      revalidate: 300,
      tags: ['linker'],
    })
  })

  it('a page never saved (name "") is a 404, titled as one', async () => {
    mocks.apiFetch.mockResolvedValue({
      data: linkerFixture({ name: '' }),
      msg: '',
      status: 200,
      headers: new Headers(),
    })
    expect(await thrown(LinksPage())).toHaveProperty('message', 'NEXT_NOT_FOUND')
    expect((await generateMetadata()).title).toEqual({ absolute: 'صفحه پیدا نشد | فایرفلای' })
  })

  it('its head: the name (absolute), the bio, the logo, canonical /links/; no empty key', async () => {
    mocks.apiFetch.mockResolvedValue({
      data: linkerFixture({ logo: 'https://api.shop.ir/media/logo.png' }),
      msg: '',
      status: 200,
      headers: new Headers(),
    })
    const metadata = await generateMetadata()
    expect(metadata.title).toEqual({ absolute: 'فروشگاه فایرفلای' })
    expect(metadata.description).toBe('کالای اصل با ضمانت اصالت و ارسال سریع به سراسر کشور.')
    expect(metadata.alternates).toEqual({ canonical: '/links/' })
    expect(metadata.openGraph).toMatchObject({ images: ['https://api.shop.ir/media/logo.png'] })
    expect(metadata.robots).toBeUndefined()

    mocks.apiFetch.mockResolvedValue({
      data: linkerFixture({ bio: '' }),
      msg: '',
      status: 200,
      headers: new Headers(),
    })
    const bare = await generateMetadata()
    expect(bare).not.toHaveProperty('description')
    expect(bare.openGraph).not.toHaveProperty('images')
    expect(bare.openGraph).not.toHaveProperty('description')
  })
})
