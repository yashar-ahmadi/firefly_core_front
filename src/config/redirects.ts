import type { NextConfig } from 'next'

type Redirect = Awaited<ReturnType<NonNullable<NextConfig['redirects']>>>[number]

/**
 * The storefront's own permanent redirects (next.config.ts `redirects`, 308). Pure.
 *
 * The contact page's canonical address is `/contact-us/`, the backend's `support_link` (seo
 * digest §2.2). The guide's `/contact/` (content digest §10.3) and the operator's content page
 * `/page/contact-us/` (whose content `/contact-us/` shows above its form) send there.
 *
 * next.config's redirects run before the proxy (src/proxy.ts; Next's execution order: headers,
 * redirects, then the proxy), so they win over an operator redirect rule for the same path: the
 * proxy never looks one up for these. Next's trailing-slash redirect comes first, so `/contact`
 * takes two hops (`/contact/`, then `/contact-us/`). The query is kept.
 */
export function storefrontRedirects(): Redirect[] {
  return [
    { source: '/contact/', destination: '/contact-us/', permanent: true },
    { source: '/page/contact-us/', destination: '/contact-us/', permanent: true },
  ]
}
