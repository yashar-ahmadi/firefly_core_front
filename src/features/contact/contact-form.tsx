'use client'

import { CircleCheck } from 'lucide-react'
import { useRef, useState } from 'react'
import { AuthForm } from '@/components/form/auth-form'
import { FormAlert } from '@/components/form/form-alert'
import { SubmitButton } from '@/components/form/submit-button'
import { useFormFocus } from '@/components/form/use-form-focus'
import { Field } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { HoneypotField } from '@/features/comments/form-fields'
import { bffFetch } from '@/lib/api/client'
import type { ContactSubject } from '@/lib/api/types/contact'
import { NO_WAIT, restartWait, type Wait } from '@/lib/forms/waits'
import { ContactChannelFields } from './contact-channel-fields'
import { contactFailure, type ContactFailure } from './contact-errors'
import {
  CONTACT_LIMITS,
  contactBody,
  contactLocalErrors,
  EMPTY_CONTACT,
  type ContactErrors,
  type ContactValues,
} from './contact-payload'
import { CONTACT_SUBMIT_PATH, fetchContactSubjects, subjectsKey } from './contact-subjects'
import { useContactWait } from './contact-wait'

const DONE = 'پیام شما ثبت شد و به\u{200C}زودی بررسی می\u{200C}شود.'
/** The list was read again after a refusal: the subjects changed while the page was open. */
const STALE_PICK = `فهرست موضوع\u{200C}ها تغییر کرده بود و به\u{200C}روز شد؛ موضوع پیام را انتخاب کنید و دوباره بفرستید. نوشته\u{200C}های شما سر جایشان است.`
const STALE_NONE = `فهرست موضوع\u{200C}ها به\u{200C}روز شد و دیگر موضوعی برای انتخاب نیست؛ پیام را دوباره بفرستید.`

/**
 * The contact form (content digest §9.2). Shown to everyone, signed in or not (nothing is taken
 * from the account): the subject select only while subjects are listed (required, its first
 * option «انتخاب کنید» disabled), the name, e-mail and phone (ContactChannelFields: at least one,
 * checked before any request), the text and the honeypot. Never submits natively (AuthForm).
 *
 * - The API's errors go where they belong (`contactFailure`), the first invalid field taking the
 *   focus; a 429 holds the button for `retry_after`, in minutes (`useContactWait`).
 * - A stale subject list (`staleSubjects`) is read again through the BFF, uncached; the select is
 *   drawn anew (keyed by the ids, so no old choice survives) and everything typed stays.
 * - On 201: the API's sentence verbatim in a polite region under the button, the form cleared,
 *   the focus on the text (for another message), just above it.
 */
export function ContactForm({ subjects: initial }: { subjects: readonly ContactSubject[] }) {
  const [subjects, setSubjects] = useState(initial)
  const [values, setValues] = useState<ContactValues>(EMPTY_CONTACT)
  const [errors, setErrors] = useState<ContactErrors>({})
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  // Bumped on each refusal: the focus then moves to the first field to fix.
  const [attempt, setAttempt] = useState(0)
  const [wait, setWait] = useState<Wait>(NO_WAIT)
  const lock = useContactWait(wait)
  const frameRef = useRef<HTMLDivElement>(null)
  const messageRef = useRef<HTMLTextAreaElement>(null)
  useFormFocus(frameRef, attempt)
  const withSubject = subjects.length > 0

  const refuse = (next: ContactErrors) => {
    setErrors(next)
    setAttempt((count) => count + 1)
  }

  const set = (key: keyof ContactValues, value: string) =>
    setValues((current) => ({ ...current, [key]: value }))

  /** The list again, the choice dropped; on failure the API's own sentences stay. */
  const refreshSubjects = async ({ errors: refused }: ContactFailure) => {
    try {
      const fresh = await fetchContactSubjects()
      setSubjects(fresh)
      setValues((current) => ({ ...current, subject: '' }))
      // The API's subject sentence («…صفحه را تازه کنید…») gives way to what happened.
      const next: ContactErrors = { ...refused, subject: undefined }
      if (fresh.length > 0) next.subject = STALE_PICK
      else next.form = STALE_NONE
      refuse(next)
    } catch {
      refuse(withSubject ? refused : { ...refused, form: refused.subject })
    }
  }

  const submit = async () => {
    if (busy || lock.locked) return
    const local = contactLocalErrors(values, { withSubject })
    if (Object.keys(local).length > 0) return refuse(local)
    setErrors({})
    setNotice('')
    setBusy(true)
    try {
      const { msg } = await bffFetch<Record<string, never>>(CONTACT_SUBMIT_PATH, {
        method: 'POST',
        body: contactBody(values, { withSubject }),
      })
      setValues(EMPTY_CONTACT)
      setNotice(msg || DONE)
      messageRef.current?.focus()
    } catch (error) {
      const failure = contactFailure(error, { withSubject })
      const seconds = failure.waitSeconds
      if (seconds) setWait((previous) => restartWait(previous, Date.now(), seconds))
      if (failure.staleSubjects) await refreshSubjects(failure)
      else refuse(failure.errors)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div ref={frameRef} className="relative">
      <AuthForm onSubmit={() => void submit()} label="فرم تماس" className="gap-5">
        {withSubject && (
          <Field label="موضوع پیام" error={errors.subject} required>
            <Select
              key={subjectsKey(subjects)}
              value={values.subject}
              onChange={(event) => set('subject', event.target.value)}
            >
              <option value="" disabled>
                انتخاب کنید
              </option>
              {subjects.map((subject) => (
                <option key={subject.id} value={String(subject.id)}>
                  {subject.title}
                </option>
              ))}
            </Select>
          </Field>
        )}
        <Field label="نام" error={errors.name} required>
          <Input
            value={values.name}
            maxLength={CONTACT_LIMITS.name}
            autoComplete="name"
            onChange={(event) => set('name', event.target.value)}
          />
        </Field>
        <ContactChannelFields
          email={values.email}
          phone={values.phone}
          errors={errors}
          onEmail={(email) => set('email', email)}
          onPhone={(phone) => set('phone', phone)}
        />
        <Field label="متن پیام" error={errors.message} required>
          <Textarea
            ref={messageRef}
            value={values.message}
            rows={6}
            minLength={CONTACT_LIMITS.messageMin}
            maxLength={CONTACT_LIMITS.messageMax}
            onChange={(event) => set('message', event.target.value)}
          />
        </Field>
        <HoneypotField value={values.website} onChange={(website) => set('website', website)} />
        {errors.form && <FormAlert>{errors.form}</FormAlert>}
        <div className="flex flex-col gap-1 sm:w-56">
          <SubmitButton busy={busy} lock={lock} size="md">
            ارسال پیام
          </SubmitButton>
        </div>
        {/* Under the button and the text that takes the focus, so it is seen where the visitor
            is; a polite region from the start, so it is read out too. */}
        <div role="status">
          {notice && (
            <p className="flex items-start gap-2 rounded-control bg-success/10 px-4 py-3 text-base leading-7 font-medium text-success">
              <CircleCheck aria-hidden className="mt-1.5 size-4 shrink-0" />
              <span>{notice}</span>
            </p>
          )}
        </div>
      </AuthForm>
    </div>
  )
}
