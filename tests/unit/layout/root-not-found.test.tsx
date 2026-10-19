import { render, screen, within } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import NotFound, { generateMetadata } from '@/app/not-found'
import { importGraph } from '../support/import-graph'

// The root 404 (ruling P5-R2): Next 16.4.1 builds the root not-found's element on every request
// and puts it in every page's payload, shown or not, so whatever it renders is code every page
// under the root layout downloads. It is light: the store's name, «صفحه پیدا نشد», a sentence and
// three ways on, server HTML only. Unknown URLs get the shop's full 404 through the (shop)
// catch-all (shop-catch-all.test.tsx); this one shows for notFound() outside the shop layout
// (a malformed thanks code, an unsaved linker, the dev pages in production).

const settings = vi.hoisted(() => ({ value: { name: 'فایرفلای' } as { name: string } | null }))

vi.mock('server-only', () => ({}))
vi.mock('@/features/settings/api', () => ({
  getTranslations: async () => ({}),
  getSiteSettings: async () => settings.value,
}))
vi.mock('@/config/store-config', async () => {
  const pure = await import('@/config/resolve-store-config')
  const { parseServerEnv } = await import('@/config/env-schema')
  const config = pure.resolveStoreConfig(
    parseServerEnv({ FIREFLY_API_URL: 'https://api.shop.ir/', SITE_URL: 'https://shop.ir/' }),
  )
  return { ...pure, getStoreConfig: () => config }
})

beforeEach(() => {
  settings.value = { name: 'فایرفلای' }
})

async function show() {
  return render((await NotFound()) as ReactNode)
}

describe('the root 404', () => {
  it('is a region named by its heading, never a second <main> (it shows inside frames)', async () => {
    // A thanks page's or the linker's notFound() shows it inside the checkout's or the
    // linker's layout, which already holds the skip link's <main id="main">.
    const { container } = await show()
    expect(container.querySelector('main')).toBeNull()
    expect(container.querySelector('#main')).toBeNull()
    const region = screen.getByRole('region', { name: 'صفحه پیدا نشد' })
    expect(within(region).getByRole('heading', { level: 1 })).toHaveTextContent('صفحه پیدا نشد')
  })

  it('names the store (home), says what happened, and offers home, search and support', async () => {
    await show()
    expect(screen.getByRole('link', { name: 'فایرفلای' })).toHaveAttribute('href', '/')
    expect(screen.getByText('خطای ۴۰۴')).toBeInTheDocument()
    expect(screen.getByText(/نشانی این صفحه درست نیست/)).toBeInTheDocument()
    const ways = within(screen.getByRole('navigation', { name: 'راه\u{200C}های ادامه' }))
    expect(
      ways.getAllByRole('link').map((link) => [link.textContent, link.getAttribute('href')]),
    ).toEqual([
      ['صفحه\u{0654} اصلی', '/'],
      ['جستجو در فروشگاه', '/search/'],
      ['تماس با پشتیبانی', '/contact-us/'],
    ])
  })

  it('names the store from the preset when the settings cannot be read', async () => {
    settings.value = null
    await show()
    const home = screen.getAllByRole('link')[0]!
    expect(home).toHaveAttribute('href', '/')
    expect(home.textContent?.trim()).not.toBe('')
  })

  it('has no shop chrome: no header, footer, search box or bottom navigation', async () => {
    await show()
    expect(screen.queryByRole('banner')).toBeNull()
    expect(screen.queryByRole('contentinfo')).toBeNull()
    expect(screen.queryByRole('search')).toBeNull()
    expect(screen.getAllByRole('navigation')).toHaveLength(1)
  })

  it('is titled like every 404 (Next adds noindex to the 404 itself)', async () => {
    expect((await generateMetadata()).title).toEqual({ absolute: 'صفحه پیدا نشد | فایرفلای' })
  })
})

describe('what the root 404 brings into every page', () => {
  const graph = importGraph('src/app/not-found.tsx')

  it('no client module at all: its markup ships no code', () => {
    expect(graph.clientFiles).toEqual([])
    expect(graph.packages).not.toContain('next/link')
    expect(graph.packages.filter((name) => name.startsWith('lucide-react'))).toEqual([])
  })

  it('never reaches the shop shell, its header, menus, search or bottom navigation', () => {
    const shell = graph.files.filter((file) =>
      /components\/layout\/(?:shop-shell|shell-frame|site-header|site-footer|mobile-bottom-nav|mega-menu|header-|categories-drawer|not-found-view|menu-link)|features\/search\//.test(
        file,
      ),
    )
    expect(shell).toEqual([])
  })
})
