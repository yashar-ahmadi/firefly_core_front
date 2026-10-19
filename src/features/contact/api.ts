import 'server-only'
import { cache } from 'react'
import { read } from '@/features/catalog/loaders/read'
import { getPublishedPage } from '@/features/content/pages/api'
import { CONTACT_US_SLUG } from '@/features/content/pages/page-routes'
import { everyPage } from '@/lib/api/every-page'
import type { Paginated } from '@/lib/api/types/common'
import type { ContactSubject } from '@/lib/api/types/contact'
import type { PageDetail } from '@/lib/api/types/page'
import { CONTACT_SUBJECTS_TAG } from '@/lib/bff/contact-subjects'

/** The digest's 300 s; a stale list expires it at once (`lib/bff/contact-subjects.ts`). */
const SUBJECTS_REVALIDATE = 300

/**
 * The contact form's subjects, in the operator's order (content digest §9.1): `limit=100`, then
 * each page `next` names; anonymous (the same list for everyone), cached 300 s and tagged
 * `contact-subjects`. A failure is thrown (the error page): a form without the subjects could not
 * send a valid message.
 */
export const getContactSubjects = cache((): Promise<ContactSubject[]> =>
  everyPage((page) =>
    read<Paginated<ContactSubject>>('contact-us/subject/list', {
      query: { limit: 100, page },
      revalidate: SUBJECTS_REVALIDATE,
      tags: [CONTACT_SUBJECTS_TAG],
    }),
  ),
)

/**
 * The operator's `contact-us` content page, published only (cached like every page), or null:
 * none, a draft, or a failed read (logged; the contact page still shows the form and the shop's
 * details without it).
 */
export const getContactPage = cache(async (): Promise<PageDetail | null> => {
  try {
    return await getPublishedPage(CONTACT_US_SLUG)
  } catch (error) {
    console.error('[contact] the contact-us page could not be read:', (error as Error).message)
    return null
  }
})
