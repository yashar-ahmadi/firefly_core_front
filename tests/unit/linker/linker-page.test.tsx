import { screen, within } from '@testing-library/react'
import { createElement, type ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import LinksPage from '@/app/links/page'
import type { LinkerData } from '@/lib/api/types/linker'
import { renderTree } from '../blog/page-support'
import { stubBrowserApis } from '../support/dom-stubs'
import { link, linkerFixture } from './linker-fixtures'

// `/links/` (content digest §8): one template for every theme, its palette as CSS variables on
// the root (never a branch on the theme's key); the header; the layout flags (social row on top
// or at the bottom, the thumbnail on its PHYSICAL side, one radius, the footer line). The link
// types and the route: linker-links.test.tsx.

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

const root = () => document.querySelector<HTMLElement>('[data-linker]')!
const socials = () => screen.getByRole('list', { name: 'شبکه\u{200C}های اجتماعی' })
const links = () => screen.getByRole('list', { name: 'پیوندها' })
const item = (name: string) => within(links()).getByRole('link', { name: new RegExp(name) })

beforeEach(() => {
  mocks.apiFetch.mockReset()
})

describe('the theme', () => {
  it('applies theme.background (and the rest of the palette) to the root', async () => {
    await show()
    expect(root().style.getPropertyValue('--linker-background')).toBe(
      'linear-gradient(#0891b2, #22d3ee)',
    )
    expect(root().style.getPropertyValue('--linker-text')).toBe('#ffffff')
    expect(root().style.getPropertyValue('--linker-button-border')).toBe('#ffffff')
    // The root paints it: gradient-safe, the whole screen high.
    expect(root().className).toContain('[background:var(--linker-background)_no-repeat]')
    expect(root().className).toContain('min-h-screen')
  })

  it('never branches on the theme’s key: the same palette under another key, the same page', async () => {
    const { container: first } = await show()
    const html = first.innerHTML
    document.body.innerHTML = ''
    const { container: second } = await show(
      linkerFixture({ theme: { ...linkerFixture().theme, key: 'legacy' } }),
    )
    expect(second.innerHTML).toBe(html)
  })

  it('one radius for buttons and pictures: rounded, or square without rounded_edges', async () => {
    await show()
    expect(root().style.getPropertyValue('--linker-radius')).toBe('0.875rem')
    document.body.innerHTML = ''
    await show(linkerFixture({ rounded_edges: false }))
    expect(root().style.getPropertyValue('--linker-radius')).toBe('0')
  })
})

describe('the header', () => {
  it('the avatar letter in a circle without a logo, the name as the one h1, the bio', async () => {
    await show()
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('فروشگاه فایرفلای')
    expect(document.querySelector('[data-avatar-letter]')).toHaveTextContent('ف')
    expect(
      screen.getByText('کالای اصل با ضمانت اصالت و ارسال سریع به سراسر کشور.'),
    ).toBeInTheDocument()
  })

  it('the logo instead of the letter, and no empty bio', async () => {
    await show(linkerFixture({ logo: 'https://api.shop.ir/media/logo.png', bio: '' }))
    expect(document.querySelector('[data-avatar-letter]')).toBeNull()
    expect(document.querySelector('img[src*="logo.png"]')).not.toBeNull()
    expect(screen.getByRole('heading', { level: 1 }).nextElementSibling?.tagName).not.toBe('P')
  })
})

describe('the layout flags', () => {
  it('socials on top: under the header, above the links; repeats kept, each named', async () => {
    await show()
    expect(
      socials().compareDocumentPosition(links()) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
    const accounts = within(socials()).getAllByRole('link')
    expect(
      accounts.map((account) => [account.getAttribute('aria-label'), account.getAttribute('href')]),
    ).toEqual([
      ['instagram', 'https://www.instagram.com/firefly.shop'],
      ['instagram', 'https://www.instagram.com/firefly.support'],
      ['telegram', 'https://t.me/firefly_shop'],
    ])
  })

  it('socials at the bottom: after the links', async () => {
    await show(linkerFixture({ social_links_position: 'bottom' }))
    expect(
      links().compareDocumentPosition(socials()) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
  })

  it('the thumbnail on its physical side: right is the natural order (RTL), left reversed', async () => {
    const withThumb = (side: 'right' | 'left') =>
      linkerFixture({
        thumbnail_position: side,
        links: [
          link({
            id: 1,
            link_type: 'button',
            title: 'فروش ویژه',
            value: '/product/list/sale/',
            href: 'http://localhost:3000/product/list/sale/',
            thumbnail: 'https://api.shop.ir/media/sale.png',
          }),
        ],
      })
    await show(withThumb('right'))
    expect(item('فروش ویژه').className).not.toContain('flex-row-reverse')
    // The thumbnail first: on the right in RTL.
    const button = item('فروش ویژه')
    expect(button.querySelector('img')).not.toBeNull()
    expect(button.firstElementChild).toBe(button.querySelector('img'))
    document.body.innerHTML = ''
    await show(withThumb('left'))
    expect(item('فروش ویژه').className).toContain('flex-row-reverse')
  })

  it('the footer line (the name) only with show_footer', async () => {
    await show()
    expect(screen.getByRole('contentinfo')).toHaveTextContent('فروشگاه فایرفلای')
    document.body.innerHTML = ''
    await show(linkerFixture({ show_footer: false }))
    expect(screen.queryByRole('contentinfo')).toBeNull()
  })
})
