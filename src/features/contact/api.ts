import 'server-only'
import { cache } from 'react'
import { read } from '@/features/catalog/loaders/read'
import { getPage, SIGN_IN } from '@/features/content/pages/api'
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
 * The operator's `contact-us` content page through the pages' two-path read (`getPage`): the
 * published page, anonymous and cached like every page; only when that is a 404 and the visitor
 * has a session, read again with their token, uncached, so staff can preview a draft here
 * (`/page/contact-us/` redirects to this page, the only place a draft of it can be seen). null:
 * none, a draft for anyone but staff, one for signed-in visitors only to a guest, or a failed read
 * (logged; the contact page still shows the form and the shop's details without it).
 */
export const getContactPage = cache(async (): Promise<PageDetail | null> => {
  try {
    const page = await getPage(CONTACT_US_SLUG)
    // A contact page for signed-in visitors only would hide the form's own context from guests:
    // the form and the shop's details still show, without the operator's page.
    return page === SIGN_IN ? null : page
  } catch (error) {
    console.error('[contact] the contact-us page could not be read:', (error as Error).message)
    return null
  }
})
