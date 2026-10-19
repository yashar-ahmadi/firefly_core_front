import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { importGraph } from '../support/import-graph'

// Unknown URLs (ruling P5-R2) go through a catch-all in the (shop) group that only calls
// notFound(): the shop's own not-found.tsx then renders the full 404 (search, categories) inside
// the shop layout, with a real 404 status (no loading.tsx above it, R9). Next ranks a catch-all
// below every static and dynamic route, so it only ever gets what nothing else matches
// (tests/e2e/route-table.spec.ts checks every route family's status on the build).

const APP = join(process.cwd(), 'src/app')
const CATCH_ALL = 'src/app/(shop)/[...missing]/page.tsx'

vi.mock('server-only', () => ({}))
const apiFetch = vi.hoisted(() => vi.fn())
vi.mock('@/lib/api/server', () => ({ apiFetch }))
vi.mock('@/features/settings/api', () => ({
  getTranslations: async () => ({}),
  getSiteSettings: async () => ({ name: 'فایرفلای' }),
}))
vi.mock('@/config/store-config', async () => {
  const pure = await import('@/config/resolve-store-config')
  const { parseServerEnv } = await import('@/config/env-schema')
  const config = pure.resolveStoreConfig(
    parseServerEnv({ FIREFLY_API_URL: 'https://api.shop.ir/', SITE_URL: 'https://shop.ir/' }),
  )
  return { ...pure, getStoreConfig: () => config }
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('the shop catch-all', () => {
  it('calls notFound() at once, reading nothing (no API call, no params)', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    const { default: Missing } = await import('@/app/(shop)/[...missing]/page')
    let thrown: unknown
    try {
      Missing()
    } catch (error) {
      thrown = error
    }
    expect((thrown as { digest?: string }).digest).toBe('NEXT_HTTP_ERROR_FALLBACK;404')
    expect(apiFetch).not.toHaveBeenCalled()
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('imports notFound and the 404 title only: no loader of its own, no static params', async () => {
    const graph = importGraph(CATCH_ALL)
    const own = graph.files.filter((file) => file !== CATCH_ALL)
    expect(own).toContain('src/features/seo/not-found-metadata.ts')
    expect(own.filter((file) => /\/(?:catalog|content|blog|search)\//.test(file))).toEqual([])
    expect(graph.packages).toContain('next/navigation')
    const page = await import('@/app/(shop)/[...missing]/page')
    expect(Object.keys(page).sort()).toEqual(['default', 'generateMetadata'])
  })

  it('titles the 404 like every other (a page that throws loses the not-found file’s head)', async () => {
    const { generateMetadata } = await import('@/app/(shop)/[...missing]/page')
    expect((await generateMetadata()).title).toEqual({ absolute: 'صفحه پیدا نشد | فایرفلای' })
  })

  it('is the only route at the root of the app that is not a static segment', () => {
    // A second dynamic segment at the root (in any group) would compete with it for unknown
    // URLs and with every static route family for theirs.
    const roots = readdirSync(APP, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .flatMap((entry) =>
        /^\(.+\)$/.test(entry.name)
          ? readdirSync(join(APP, entry.name), { withFileTypes: true })
              .filter((child) => child.isDirectory())
              .map((child) => `${entry.name}/${child.name}`)
          : [entry.name],
      )
    expect(roots.filter((name) => /\[/.test(name))).toEqual(['(shop)/[...missing]'])
  })

  it('renders inside the shop layout, under its not-found and no loading boundary', () => {
    expect(existsSync(join(APP, '(shop)/not-found.tsx'))).toBe(true)
    expect(existsSync(join(APP, '(shop)/[...missing]/loading.tsx'))).toBe(false)
    expect(existsSync(join(APP, '(shop)/[...missing]/layout.tsx'))).toBe(false)
  })
})
