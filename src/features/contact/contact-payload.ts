import { toLatinDigits } from '@/lib/format/digits'
import { normalizeIranMobile } from '@/lib/format/phone'
import type { ContactMessageBody } from '@/lib/api/types/contact'

// The contact form's values, its request body and its checks before sending (content digest
// §9.2). Pure: safe in any bundle.

export interface ContactValues {
  /** The chosen subject's id as the select holds it; '' for none. */
  subject: string
  name: string
  email: string
  phone: string
  message: string
  /** The honeypot: empty unless a bot filled it. */
  website: string
}

export const EMPTY_CONTACT: ContactValues = {
  subject: '',
  name: '',
  email: '',
  phone: '',
  message: '',
  website: '',
}

/** The fields an error can be shown under; `channel` is e-mail and phone together. */
export const CONTACT_FIELDS = ['subject', 'name', 'email', 'phone', 'message'] as const
export type ContactField = (typeof CONTACT_FIELDS)[number]
export type ContactErrors = Partial<Record<ContactField | 'channel' | 'form', string>>

/** The API's own sentences (`contact_channel_required`, `contact_subject_required`). */
export const CHANNEL_REQUIRED = 'ایمیل یا شمارهٔ موبایل خود را بنویسید تا پاسخ به دستتان برسد.'
export const SUBJECT_REQUIRED = 'موضوع پیام را انتخاب کنید.'
const NAME_REQUIRED = 'نام خود را بنویسید.'
const MESSAGE_REQUIRED = 'متن پیام را بنویسید.'

/** The API's limits, as the inputs' hints (the browser counts an emoji twice, the API once). */
export const CONTACT_LIMITS = { name: 100, email: 254, messageMin: 10, messageMax: 5000 } as const

/**
 * The phone as sent: an Iranian mobile normalised (`09121234567`, from Persian or Arabic digits,
 * spaces, dashes, `+98`); anything else trimmed in Latin digits, for the API to refuse
 * (`invalid_iranian_mobile`: a landline, a foreign number). null when empty.
 */
export function contactPhone(raw: string): string | null {
  const trimmed = raw.trim()
  if (trimmed === '') return null
  return normalizeIranMobile(trimmed) ?? toLatinDigits(trimmed)
}

/**
 * The request body: the subject as a Number (only while the form lists subjects), the name
 * trimmed, the e-mail trimmed and the phone normalised, each left out when empty (never `""`),
 * the text as typed (the API normalises its line breaks and trims it), the honeypot as typed.
 */
export function contactBody(
  values: ContactValues,
  { withSubject }: { withSubject: boolean },
): ContactMessageBody {
  const body: ContactMessageBody = {
    name: values.name.trim(),
    message: values.message,
    website: values.website,
  }
  if (withSubject && values.subject !== '') body.subject = Number(values.subject)
  const email = values.email.trim()
  const phone = contactPhone(values.phone)
  if (email) body.email = email
  if (phone) body.phone = phone
  return body
}

/**
 * What stops the form before any request: no subject chosen (while subjects are listed), no
 * name, no text, and above all neither e-mail nor phone (`channel`, the API's own sentence).
 * Lengths and formats are left to the API, whose errors are shown as they come.
 */
export function contactLocalErrors(
  values: ContactValues,
  { withSubject }: { withSubject: boolean },
): ContactErrors {
  const errors: ContactErrors = {}
  if (withSubject && values.subject === '') errors.subject = SUBJECT_REQUIRED
  if (!values.name.trim()) errors.name = NAME_REQUIRED
  if (!values.email.trim() && !values.phone.trim()) errors.channel = CHANNEL_REQUIRED
  if (!values.message.trim()) errors.message = MESSAGE_REQUIRED
  return errors
}
