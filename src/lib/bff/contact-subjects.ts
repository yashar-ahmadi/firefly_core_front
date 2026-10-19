import 'server-only'
import { revalidateTag } from 'next/cache'

/**
 * The contact form's stale subject list (content digest §9.2). The page reads the subjects
 * cached 300 s under this tag (`features/contact/api.ts`). When the API refuses a message
 * because the list it was chosen from is out of date (`contact_subject_unavailable`: a subject
 * switched off meanwhile; `contact_subject_required`: the list was empty, now it is not), the BFF
 * expires that cache at once, so the next render of the page reads the new list; the form reads
 * it again itself through the BFF, which never caches.
 *
 * Only the storefront's own form can cause it: the BFF's CSRF check (`X-Requested-With: ff`,
 * a same-origin `Origin`) runs before any call, and the API must have answered one of the two
 * codes. A forged request from a script can still name a stale subject, so a bust happens at
 * most once per `BUST_INTERVAL_MS` per server process: each costs one subject read on the next
 * render, never more than a couple a minute.
 */
export const CONTACT_SUBJECTS_TAG = 'contact-subjects'
const CONTACT_SUBMIT_PATH = 'contact-us/message/submit/'
const STALE_CODES = new Set(['contact_subject_unavailable', 'contact_subject_required'])
const BUST_INTERVAL_MS = 30_000

let lastBust = Number.NEGATIVE_INFINITY

function errorCodes(body: Record<string, unknown> | null): string[] {
  const data = body?.data as { errors?: Array<{ code?: unknown }> } | undefined
  if (!Array.isArray(data?.errors)) return []
  return data.errors.flatMap((error) => (typeof error?.code === 'string' ? [error.code] : []))
}

/**
 * After the API's answer to a call the BFF forwarded: expires the subjects' cache when it was a
 * message refused for a stale subject. True when it did.
 */
export function bustStaleSubjects(
  method: string,
  path: string,
  status: number,
  body: Record<string, unknown> | null,
  now = Date.now(),
): boolean {
  if (method !== 'POST' || path !== CONTACT_SUBMIT_PATH || status !== 400) return false
  if (!errorCodes(body).some((code) => STALE_CODES.has(code))) return false
  if (now - lastBust < BUST_INTERVAL_MS) return false
  lastBust = now
  revalidateTag(CONTACT_SUBJECTS_TAG, { expire: 0 })
  return true
}
