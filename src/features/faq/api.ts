import 'server-only'
import { cache } from 'react'
import { read } from '@/features/catalog/loaders/read'
import { everyPage } from '@/lib/api/every-page'
import type { Paginated } from '@/lib/api/types/common'
import type { FaqCategory } from '@/lib/api/types/faq'
import { faqSections, type FaqSection } from './faq-sections'

/** On every read: `revalidateTag('faq')` refreshes the help centre. */
export const FAQ_TAG = 'faq'
/** The digest's ≈ 600 s: every visitor's render shares the storefront's one IP budget. */
const FAQ_REVALIDATE = 600
/** The API's largest page: one read for any ordinary help centre. */
const PAGE_SIZE = 100

/**
 * Every category of the help centre (blog-faq digest §2.2): `limit=100`, then each page `next`
 * names (its `page` only), anonymous (no token, no visitor IP: it is the same for everyone),
 * cached 600 s and tagged `faq`. A failure is thrown: the shop's error page (Next keeps serving
 * the last good copy while a revalidation fails).
 */
export const getFaqCategories = cache((): Promise<FaqCategory[]> =>
  everyPage((page) =>
    read<Paginated<FaqCategory>>('faq/category/list', {
      query: { limit: PAGE_SIZE, page },
      revalidate: FAQ_REVALIDATE,
      tags: [FAQ_TAG],
    }),
  ),
)

/** The categories as the page shows them (`faqSections`), shared by the page and its head. */
export const getFaqSections = cache(async (): Promise<FaqSection[]> =>
  faqSections(await getFaqCategories()),
)
