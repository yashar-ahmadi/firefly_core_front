import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import OfflinePage, { metadata } from '@/app/offline/page'
import { importGraph } from '../support/import-graph'

// `/offline/` (Plan 5 Task 6): what the service worker shows for a navigation the network cannot
// answer. It is served from the worker's cache, as the anonymous copy kept at install, so nothing
// on it may need the API once shown: the shop's name was written into it when it was kept, the
// retry reloads the page the visitor wanted, and the way home is a full page load (the worker
// has the home page's copy). Light: no shop shell, noindex.

const settings = vi.hoisted(() => ({ value: { name: 'فایرفلای' } as { name: string } | null }))

vi.mock('server-only', () => ({}))
vi.mock('@/features/settings/api', () => ({ getSiteSettings: async () => settings.value }))
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
  return render((await OfflinePage()) as ReactNode)
}

describe('the offline page', () => {
  it('says the connection is down, in its <main> (the skip link’s target)', async () => {
    await show()
    expect(screen.getByRole('main')).toHaveAttribute('id', 'main')
    expect(
      screen.getByRole('heading', { level: 1, name: 'اتصال اینترنت برقرار نیست' }),
    ).toBeInTheDocument()
    expect(screen.getByText(/اتصال اینترنت دستگاه را بررسی کنید/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'فایرفلای' })).toHaveAttribute('href', '/')
  })

  it('«تلاش دوباره» reloads the page the visitor asked for', async () => {
    const reload = vi.fn()
    vi.stubGlobal('location', { ...window.location, reload })
    await show()
    await userEvent.setup().click(screen.getByRole('button', { name: 'تلاش دوباره' }))
    expect(reload).toHaveBeenCalledTimes(1)
    vi.unstubAllGlobals()
  })

  it('the way home is a plain link: a full page load, which the worker answers offline', async () => {
    await show()
    const home = screen.getByRole('link', { name: 'صفحهٔ اصلی' })
    expect(home).toHaveAttribute('href', '/')
    expect(home.tagName).toBe('A')
  })

  it('without settings: the preset’s label', async () => {
    settings.value = null
    await show()
    expect(screen.getByRole('link', { name: 'فروشگاه' })).toBeInTheDocument()
  })

  it('is noindex', () => {
    expect(metadata.robots).toEqual({ index: false, follow: false })
    expect(metadata.title).toBe('اتصال اینترنت برقرار نیست')
  })

  it('is light: no shop shell, nothing that calls the API from the browser, one client island', () => {
    // The settings are read on the server, when the worker keeps the copy; never once it shows.
    const { files, clientFiles } = importGraph('src/app/offline/page.tsx')
    expect(clientFiles).toEqual(['src/features/pwa/offline-retry.tsx'])
    for (const heavy of [
      'src/components/layout/shop-shell.tsx',
      'src/components/layout/site-header.tsx',
      'src/lib/api/client.ts',
    ]) {
      expect(files).not.toContain(heavy)
    }
  })
})
