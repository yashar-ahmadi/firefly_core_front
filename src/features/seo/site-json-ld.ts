// The shop's own structured data for the home page (Plan 5 Task 7; spec §8.13, seo digest §7.2:
// the backend sends no Organization or WebSite, its homepage payload has no `structured_data`):
// an Organization and a WebSite with a SearchAction on the shop's search page. Every URL on the
// storefront's origin (SITE_URL). No prices: the API's JSON-LD prices are Rial, and none belongs
// here. Keys without a value are left out, never written empty. Pure.

export interface SiteIdentity {
  /** The shop's name (the settings', else the preset's label). */
  name: string
  slogan?: string | null
  /** SITE_URL: the storefront's own address. */
  siteUrl: string
  /** The settings' logo (an API URL: its `/media/` or `/static/` path is served by the shop too). */
  logo?: string | null
  /** E.164. */
  phone?: string | null
  email?: string | null
  /** The shop's social profiles (`global/socials/`). */
  socials?: readonly { link: string }[]
}

/** The paths the storefront forwards to the API (src/proxy.ts). */
const FORWARDED_PATH = /^\/(?:media|static)\//

const present = (value: string | null | undefined) => value?.trim() || null

/** An http(s) URL, or null. */
function httpUrl(value: string | null | undefined, base?: string): URL | null {
  const given = present(value)
  if (!given) return null
  try {
    const url = new URL(given, base)
    return url.protocol === 'http:' || url.protocol === 'https:' ? url : null
  } catch {
    return null
  }
}

/** A file the API serves, on the shop's origin (which forwards `/media/` and `/static/`). */
function onShop(value: string | null | undefined, origin: string): string | null {
  const url = httpUrl(value, origin)
  if (!url) return null
  return FORWARDED_PATH.test(url.pathname) ? `${origin}${url.pathname}${url.search}` : url.href
}

const originOf = (siteUrl: string) => new URL(siteUrl).origin
const organizationId = (origin: string) => `${origin}/#organization`

/** One contact point for customers from the settings' phone and email, or none. */
function contactPoints(site: SiteIdentity): object[] {
  const telephone = present(site.phone)
  const email = present(site.email)
  if (!telephone && !email) return []
  return [
    {
      '@type': 'ContactPoint',
      contactType: 'customer service',
      ...(telephone ? { telephone } : {}),
      ...(email ? { email } : {}),
      availableLanguage: 'fa',
    },
  ]
}

/**
 * The shop as an Organization node: its name and home, its slogan and logo, its profiles
 * (`sameAs`, http(s) only, each once), its contact point. Also a page's main entity (the linker).
 */
export function organization(site: SiteIdentity): Record<string, unknown> {
  const origin = originOf(site.siteUrl)
  const slogan = present(site.slogan)
  const logo = onShop(site.logo, origin)
  const sameAs = [
    ...new Set((site.socials ?? []).flatMap((social) => httpUrl(social.link)?.href ?? [])),
  ]
  const contact = contactPoints(site)
  return {
    '@type': 'Organization',
    name: site.name,
    url: `${origin}/`,
    ...(slogan ? { slogan } : {}),
    ...(logo ? { logo } : {}),
    ...(sameAs.length > 0 ? { sameAs } : {}),
    ...(contact.length > 0 ? { contactPoint: contact } : {}),
  }
}

/** The home page's Organization block, with its `@id` (the WebSite's publisher names it). */
export function organizationJsonLd(site: SiteIdentity): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@id': organizationId(originOf(site.siteUrl)),
    ...organization(site),
  }
}

/** The site: Persian, published by the shop, searched at `/search/?q=` (the search page's `q`). */
export function webSiteJsonLd(site: SiteIdentity): Record<string, unknown> {
  const origin = originOf(site.siteUrl)
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    '@id': `${origin}/#website`,
    name: site.name,
    url: `${origin}/`,
    inLanguage: 'fa-IR',
    publisher: { '@id': organizationId(origin) },
    potentialAction: {
      '@type': 'SearchAction',
      target: { '@type': 'EntryPoint', urlTemplate: `${origin}/search/?q={search_term_string}` },
      'query-input': 'required name=search_term_string',
    },
  }
}

/** The home page's blocks: the Organization, then the WebSite. */
export function siteJsonLd(site: SiteIdentity): Record<string, unknown>[] {
  return [organizationJsonLd(site), webSiteJsonLd(site)]
}
