import { bffFetch } from '@/lib/api/client'
import { everyPage } from '@/lib/api/every-page'
import type { Paginated } from '@/lib/api/types/common'
import type { ContactSubject } from '@/lib/api/types/contact'

// The contact form's subjects as the browser reads them again (content digest §9.2: a stale list).
// Safe in Client Components.

export const CONTACT_SUBMIT_PATH = 'contact-us/message/submit/'
const SUBJECTS_PATH = 'contact-us/subject/list/'

/**
 * Every subject, read now through the BFF: never from the page's 300 s cache (the BFF's calls are
 * uncached), with the visitor's IP as every BFF call (so it is charged to them). The BFF has
 * already expired that cache when the API refused the message (`lib/bff/contact-subjects.ts`), so
 * the next page render reads the new list too.
 */
export function fetchContactSubjects(): Promise<ContactSubject[]> {
  return everyPage(async (page) => {
    const { data } = await bffFetch<Paginated<ContactSubject>>(SUBJECTS_PATH, {
      query: { limit: 100, page },
    })
    return data
  })
}

/** The select's key: a new list (other ids) is a new select, so its choice starts afresh. */
export function subjectsKey(subjects: readonly ContactSubject[]): string {
  return subjects.map((subject) => subject.id).join('-')
}
