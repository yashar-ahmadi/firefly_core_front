import { ApiError, GENERIC_ERROR_DETAIL } from '@/lib/api/errors'
import { toPersianDigits } from '@/lib/format/digits'
import { CONTACT_FIELDS, type ContactErrors, type ContactField } from './contact-payload'

// Where each answer of the contact form's error table goes (content digest §9.2, §12). Pure.

/** No answer from the API, or not the API's (the digest's own sentence for a failed form). */
export const SEND_FAILED = 'ارسال نشد؛ لحظه\u{200C}ای بعد دوباره امتحان کنید.'

const SUBJECT_REQUIRED = 'contact_subject_required'
const SUBJECT_UNAVAILABLE = 'contact_subject_unavailable'
const CHANNEL_REQUIRED = 'contact_channel_required'

/** What a refused message means for the form. */
export interface ContactFailure {
  errors: ContactErrors
  /** The subject list the form shows is out of date: read it again (content digest §9.2). */
  staleSubjects: boolean
  /** A 429's `retry_after`: the button waits it out. */
  waitSeconds: number | null
}

/** A wait in whole minutes, a part of one counted as one, never 0. */
export function waitMinutes(seconds: number): number {
  return Math.max(1, Math.ceil(seconds / 60))
}

/** The throttle's sentence: up to an hour (10 kept messages an hour), so in minutes. */
export function throttledSentence(seconds: number | null): string {
  if (!seconds || seconds <= 0)
    return 'سقف پیام\u{200C}های این ساعت پر شده است؛ کمی بعد دوباره بفرستید.'
  const minutes = toPersianDigits(String(waitMinutes(seconds)))
  return `سقف پیام\u{200C}های این ساعت پر شده است؛ ${minutes} دقیقهٔ دیگر دوباره بفرستید.`
}

const isField = (attr: string): attr is ContactField =>
  (CONTACT_FIELDS as readonly string[]).includes(attr)

/**
 * - the three contact codes (`attr: null`) by code: `contact_subject_*` under the subject,
 *   `contact_channel_required` under e-mail and phone; the list is stale on
 *   `contact_subject_unavailable` (a subject switched off meanwhile), and on
 *   `contact_subject_required` when the form had no select (the list was empty, now it is not);
 * - field errors (`required`, `blank`, `null`, `max_length`, `min_length`, `invalid`,
 *   `invalid_iranian_mobile`…) under the field their `attr` names, several at once;
 * - a 429: its wait, and the throttle's sentence in minutes;
 * - anything the visitor cannot fix (`parse_error`, the honeypot's or another unknown field's
 *   error, 405, 413, 415, an API key's 401, a CSRF 403): the generic sentence;
 * - no answer, a 5xx or anything that is not the API: «ارسال نشد…».
 */
export function contactFailure(
  error: unknown,
  { withSubject }: { withSubject: boolean },
): ContactFailure {
  const none = { staleSubjects: false, waitSeconds: null }
  if (!(error instanceof ApiError) || error.status === 0 || error.status >= 500) {
    return { ...none, errors: { form: SEND_FAILED } }
  }
  if (error.status === 429) {
    return {
      ...none,
      errors: { form: throttledSentence(error.retryAfter) },
      waitSeconds: error.retryAfter,
    }
  }
  if (error.status !== 400) return { ...none, errors: { form: GENERIC_ERROR_DETAIL } }

  const errors: ContactErrors = {}
  let staleSubjects = false
  for (const { code, detail, attr } of error.errors) {
    if (code === SUBJECT_UNAVAILABLE || code === SUBJECT_REQUIRED) {
      errors.subject ??= detail
      staleSubjects ||= code === SUBJECT_UNAVAILABLE || !withSubject
    } else if (code === CHANNEL_REQUIRED) {
      errors.channel ??= detail
    } else if (attr !== null && isField(attr)) {
      errors[attr] ??= detail
    } else {
      errors.form ??= GENERIC_ERROR_DETAIL
    }
  }
  if (Object.keys(errors).length === 0) errors.form = GENERIC_ERROR_DETAIL
  return { ...none, errors, staleSubjects }
}
