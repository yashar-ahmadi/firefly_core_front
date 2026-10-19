/**
 * Wire types of the contact form (content digest §9: `GET contact-us/subject/list/`,
 * `POST contact-us/message/submit/`). Pure types: safe in any bundle.
 */

/** A subject the form offers, in the operator's order; inactive ones are not listed. */
export interface ContactSubject {
  id: number
  title: string
}

/**
 * The message. At least one of `email` and `phone`; no empty strings sent for them. `subject` is
 * required while the subject list is not empty, and left out while it is.
 */
export interface ContactMessageBody {
  subject?: number
  /** ≤ 100; line breaks and space runs become one space. */
  name: string
  /** ≤ 254. */
  email?: string
  /** An Iranian mobile number only (`09…`, `+989…`; Latin or Persian digits). */
  phone?: string
  /** 10–5000 once control and bidi characters are dropped. */
  message: string
  /** The honeypot, as typed (a filled one is answered 201 and dropped). */
  website: string
}
