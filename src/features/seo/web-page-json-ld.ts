// A page's own schema.org node, for the pages the API gives no structured data (content pages,
// /contact-us/: seo digest §7.1). Pure; written escaped by `JsonLd`.

/** The kinds of page the shop names itself as. */
export type WebPageType = 'WebPage' | 'AboutPage' | 'ContactPage'

export interface WebPageInput {
  type: WebPageType
  name: string
  /** The page's path on the shop (with its trailing slash). */
  path: string
  /** Left out when empty. */
  description?: string | null
  siteUrl: string
}

/** The page's node: its type, name, URL on the shop's origin, description and language. */
export function webPageJsonLd({ type, name, path, description, siteUrl }: WebPageInput): object {
  const text = description?.trim()
  return {
    '@context': 'https://schema.org',
    '@type': type,
    name,
    url: new URL(path, new URL(siteUrl).origin).href,
    ...(text ? { description: text } : {}),
    inLanguage: 'fa-IR',
  }
}
