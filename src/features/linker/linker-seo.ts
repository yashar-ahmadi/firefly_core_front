import type { Metadata } from 'next'
import { pageMetadata } from '@/features/seo/page-metadata'
import { organization } from '@/features/seo/site-json-ld'
import type { LinkerData } from '@/lib/api/types/linker'

export const LINKS_PATH = '/links/'

/**
 * The linker's head (content digest §8): the name as an absolute title, the bio as the
 * description, the logo as the social image, the self canonical; indexable. A key without a
 * value is left out (`pageMetadata`), never set empty.
 */
export function linkerMetadata(linker: LinkerData): Metadata {
  return pageMetadata({
    title: linker.name,
    description: linker.bio,
    canonical: LINKS_PATH,
    image: linker.logo,
    siteName: linker.name,
    card: 'summary',
  })
}

/**
 * The linker's structured data (Plan 5 Task 7): the shop's profile page, a ProfilePage whose main
 * entity is the shop as the page shows it (its name, bio, logo and social profiles), on the
 * storefront's origin (`siteUrl`). Written escaped by `JsonLd`. Pure.
 */
export function linkerJsonLd(linker: LinkerData, siteUrl: string): Record<string, unknown> {
  const bio = linker.bio.trim()
  return {
    '@context': 'https://schema.org',
    '@type': 'ProfilePage',
    url: new URL(LINKS_PATH, new URL(siteUrl).origin).href,
    name: linker.name,
    ...(bio ? { description: bio } : {}),
    mainEntity: organization({
      name: linker.name,
      siteUrl,
      logo: linker.logo,
      socials: linker.social_links.map((social) => ({ link: social.url })),
    }),
  }
}
