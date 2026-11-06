import type { Metadata } from 'next'
import { describe, expect, it } from 'vitest'
import { buildRootMetadata } from '@/app/_shell/metadata'
import {
  blogCategoryMetadata,
  blogHomeMetadata,
  blogUnavailableMetadata,
} from '@/features/blog/blog-seo'
import { postMetadata } from '@/features/blog/post-seo'
import { contactMetadata } from '@/features/contact/contact-seo'
import { contentPageMetadata } from '@/features/content/pages/page-seo'
import { faqMetadata } from '@/features/faq/faq-seo'
import { buildHomeMetadata } from '@/features/home/home-metadata'
import { linkerMetadata } from '@/features/linker/linker-seo'
import { seoMetadata } from '@/features/seo/metadata'
import { pageMetadata } from '@/features/seo/page-metadata'
import { categoryDetailFixture } from '../blog/fixtures'
import { postDetailFixture } from '../blog/post-fixtures'
import { pageFixture } from '../content/page-fixtures'
import { linkerFixture } from '../linker/linker-fixtures'

// No metadata builder ever writes a key set to `undefined` (Plan 5 Task 7's audit, seo digest
// §7.1): Next merges a child's metadata over the layout's key by key, and an `undefined` wipes
// the layout's value (its description, its Open Graph). Fed the sparsest data the API sends
// (empty strings, nulls), each builder leaves such a key out instead.

/** Every path in `value` whose value is `undefined`. */
function undefinedKeys(value: unknown, at = 'metadata'): string[] {
  if (Array.isArray(value))
    return value.flatMap((item, index) => undefinedKeys(item, `${at}[${index}]`))
  if (typeof value !== 'object' || value === null || value instanceof URL) return []
  return Object.entries(value).flatMap(([key, item]) =>
    item === undefined ? [`${at}.${key}`] : undefinedKeys(item, `${at}.${key}`),
  )
}

const EMPTY_SEO = { page_title: '', page_description: '', page_keywords: '', canonical_link: null }

const cases: [string, () => Metadata][] = [
  [
    'the root layout without settings',
    () => buildRootMetadata({ presetLabel: 'فرش', siteUrl: 'https://shop.ir/' }, null),
  ],
  [
    'seoMetadata, all empty',
    () =>
      seoMetadata({
        path: '/x/',
        pageTitle: '',
        description: '',
        keywords: '',
        image: null,
        siteName: null,
        canonical: null,
      }),
  ],
  [
    'seoMetadata, noindex without a canonical',
    () => seoMetadata({ path: '/x/', noindex: true, noCanonical: true }),
  ],
  ['pageMetadata, nothing', () => pageMetadata({ title: null, canonical: null, card: 'summary' })],
  [
    'the home page, empty fields',
    () =>
      buildHomeMetadata(
        { ...EMPTY_SEO, meta_tags: [], sections: [] },
        { name: 'فرش', slogan: null },
      ),
  ],
  ['the blog home', () => blogHomeMetadata({}, {}, 'فرش')],
  ['the blog home, a search', () => blogHomeMetadata({ search: 'x' }, { search: 'x' }, 'فرش')],
  [
    'a blog category, empty fields',
    () =>
      blogCategoryMetadata(
        {
          ...categoryDetailFixture(),
          ...EMPTY_SEO,
          short_description: '',
          description: '',
          content: '',
        } as never,
        {},
        'فرش',
      ),
  ],
  ['the blog switched off', () => blogUnavailableMetadata('فرش')],
  [
    'a post, empty fields',
    () =>
      postMetadata({ ...postDetailFixture(), ...EMPTY_SEO } as never, 'فرش', 'https://shop.ir/'),
  ],
  [
    'a content page, empty fields',
    () =>
      contentPageMetadata(
        { ...pageFixture(), ...EMPTY_SEO, description: '', meta_tags: [] } as never,
        'فرش',
        'https://shop.ir/',
      ),
  ],
  ['the contact page without its page', () => contactMetadata(null, 'فرش')],
  ['the FAQ without sections', () => faqMetadata([], 'فرش')],
  ['the linker without bio or logo', () => linkerMetadata(linkerFixture({ bio: '', logo: null }))],
]

describe('metadata builders', () => {
  it.each(cases)('%s: no key set to undefined', (_, build) => {
    expect(undefinedKeys(build())).toEqual([])
  })

  it('the scan finds one (it can fail)', () => {
    expect(undefinedKeys({ description: undefined, openGraph: { title: undefined } })).toEqual([
      'metadata.description',
      'metadata.openGraph.title',
    ])
  })
})
