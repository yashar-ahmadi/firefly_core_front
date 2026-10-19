import { render } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SiteSettings, Social } from '@/lib/api/types/settings'
import { resolveServerTree } from '../support/server-tree'

// <OrganizationJsonLd /> (src/features/seo/organization-jsonld.tsx), on the home page: the shop's
// Organization and WebSite from its settings and socials (both read once per request: the footer
// reads the same, React-cached), written escaped by JsonLd.

const mocks = vi.hoisted(() => ({
  settings: null as Partial<SiteSettings> | null,
  socials: [] as Social[],
}))

vi.mock('server-only', () => ({}))
vi.mock('@/features/settings/api', () => ({
  getSiteSettings: async () => mocks.settings,
  getSocials: async () => mocks.socials,
}))
vi.mock('@/config/store-config', async () => {
  const pure = await import('@/config/resolve-store-config')
  const { parseServerEnv } = await import('@/config/env-schema')
  const config = () =>
    pure.resolveStoreConfig(
      parseServerEnv({
        FIREFLY_API_URL: 'https://api.shop.ir/',
        SITE_URL: 'https://shop.ir/',
        FIREFLY_API_KEY: 'k',
        STORE_PRESET: 'carpet',
      }),
    )
  return { ...pure, getStoreConfig: config }
})

async function blocks() {
  const { OrganizationJsonLd } = await import('@/features/seo/organization-jsonld')
  const { container } = render(await resolveServerTree((await OrganizationJsonLd()) as ReactNode))
  return [...container.querySelectorAll('script[type="application/ld+json"]')]
}

beforeEach(() => {
  mocks.settings = null
  mocks.socials = []
})

describe('OrganizationJsonLd', () => {
  it('the Organization and the WebSite, from the settings and the socials', async () => {
    mocks.settings = {
      name: 'فایرفلای',
      logo: 'https://api.shop.ir/media/site/logo.png',
      phone: '+982191000000',
      email: null,
    }
    mocks.socials = [
      {
        id: 1,
        name: 'اینستاگرام',
        username_or_id: 'x',
        logo: null,
        link: 'https://instagram.com/x',
      },
    ]
    const [organization, site] = (await blocks()).map((script) => JSON.parse(script.textContent!))
    expect(organization).toMatchObject({
      '@type': 'Organization',
      name: 'فایرفلای',
      url: 'https://shop.ir/',
      logo: 'https://shop.ir/media/site/logo.png',
      sameAs: ['https://instagram.com/x'],
      contactPoint: [{ telephone: '+982191000000' }],
    })
    expect(site).toMatchObject({ '@type': 'WebSite', name: 'فایرفلای' })
  })

  it('without settings: the preset’s name, nothing else made up', async () => {
    const [organization] = (await blocks()).map((script) => JSON.parse(script.textContent!))
    expect(organization).toEqual({
      '@context': 'https://schema.org',
      '@type': 'Organization',
      '@id': 'https://shop.ir/#organization',
      name: expect.any(String),
      url: 'https://shop.ir/',
    })
    expect(organization.name.trim()).not.toBe('')
  })

  it('escapes what the operator wrote: a name cannot end the script', async () => {
    mocks.settings = { name: 'فروشگاه</script><script>alert(1)</script>' }
    const scripts = await blocks()
    for (const script of scripts) expect(script.innerHTML).not.toContain('<')
    expect(JSON.parse(scripts[0]!.textContent!).name).toBe(
      'فروشگاه</script><script>alert(1)</script>',
    )
  })
})
