import { beforeEach, describe, expect, it, vi } from 'vitest'
import LinksPage from '@/app/links/page'
import { linkerJsonLd } from '@/features/linker/linker-seo'
import type { LinkerData } from '@/lib/api/types/linker'
import { renderTree } from '../blog/page-support'
import { stubBrowserApis } from '../support/dom-stubs'
import { linkerFixture } from './linker-fixtures'

// `/links/`'s structured data (Plan 5 Task 7): the linker is the shop's profile page, so a
// ProfilePage whose main entity is the shop as the page shows it (its name, bio, logo and social
// profiles), every URL on the storefront's origin; written escaped.

const mocks = vi.hoisted(() => ({ apiFetch: vi.fn() }))

vi.mock('server-only', () => ({}))
vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND')
  },
}))
vi.mock('@/lib/api/server', () => ({ apiFetch: mocks.apiFetch }))
vi.mock('@/features/settings/api', () => ({
  getTranslations: async () => ({}),
  getSiteSettings: async () => ({ name: 'فایرفلای' }),
}))
vi.mock('@/config/store-config', () => ({
  getStoreConfig: () => ({ siteUrl: 'https://shop.ir/' }),
}))

stubBrowserApis()

beforeEach(() => {
  mocks.apiFetch.mockReset()
})

describe('linkerJsonLd', () => {
  it('a ProfilePage of the shop: its name, bio and social profiles', () => {
    expect(linkerJsonLd(linkerFixture(), 'https://shop.ir/')).toEqual({
      '@context': 'https://schema.org',
      '@type': 'ProfilePage',
      url: 'https://shop.ir/links/',
      name: 'فروشگاه فایرفلای',
      description: 'کالای اصل با ضمانت اصالت و ارسال سریع به سراسر کشور.',
      mainEntity: {
        '@type': 'Organization',
        name: 'فروشگاه فایرفلای',
        url: 'https://shop.ir/',
        sameAs: [
          'https://www.instagram.com/firefly.shop',
          'https://www.instagram.com/firefly.support',
          'https://t.me/firefly_shop',
        ],
      },
    })
  })

  it('the logo on the shop’s origin; no bio, no description; no profiles, no sameAs', () => {
    const page = linkerJsonLd(
      linkerFixture({
        bio: '  ',
        logo: 'http://localhost:8000/media/linker/logo.png',
        social_links: [],
      }),
      'https://shop.ir/',
    )
    expect(page).not.toHaveProperty('description')
    expect(page.mainEntity).toEqual({
      '@type': 'Organization',
      name: 'فروشگاه فایرفلای',
      url: 'https://shop.ir/',
      logo: 'https://shop.ir/media/linker/logo.png',
    })
  })
})

describe('the route', () => {
  async function scripts(linker: LinkerData) {
    mocks.apiFetch.mockResolvedValue({ data: linker, msg: '', status: 200, headers: new Headers() })
    const { container } = await renderTree(await LinksPage())
    return [...container.querySelectorAll('script[type="application/ld+json"]')]
  }

  it('renders the ProfilePage, escaped', async () => {
    const [script, ...rest] = await scripts(
      linkerFixture({ bio: 'a</script><script>x()</script>' }),
    )
    expect(rest).toEqual([])
    expect(script!.innerHTML).not.toContain('<')
    expect(JSON.parse(script!.textContent!)).toMatchObject({
      '@type': 'ProfilePage',
      description: 'a</script><script>x()</script>',
    })
  })
})
