import type { Metadata } from 'next'
import { pageMetadata } from '@/features/seo/page-metadata'
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
