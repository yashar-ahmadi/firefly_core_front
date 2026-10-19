import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ApiError } from '@/lib/api/errors'
import type { ContactSubject } from '@/lib/api/types/contact'

// What the contact form's tests share: the dev subjects, the API's refusals and the fields.

export const SUBJECTS: ContactSubject[] = [
  { id: 1, title: 'پیگیری سفارش' },
  { id: 2, title: 'پیشنهاد' },
  { id: 3, title: 'انتقاد و شکایت' },
]

export const SUBMIT_PATH = 'contact-us/message/submit/'
export const SUBJECTS_PATH = 'contact-us/subject/list/'

/** A 400 as the API sends it (the contact codes with `attr: null`). */
export function refusal(code: string, detail: string, attr: string | null = null, status = 400) {
  return ApiError.fromBody(status, {
    msg: 'درخواست ارسالی معتبر نیست.',
    code: status,
    data: { type: attr ? 'validation_error' : 'client_error', errors: [{ code, detail, attr }] },
  })
}

export const ok = <T>(data: T, msg = '') => Promise.resolve({ data, msg, status: 200 })

export const subjectSelect = () => screen.getByRole('combobox', { name: /موضوع پیام/ })
export const nameInput = () => screen.getByRole('textbox', { name: /^نام/ })
export const emailInput = () => screen.getByRole('textbox', { name: /ایمیل/ })
export const phoneInput = () => screen.getByRole('textbox', { name: /موبایل/ })
export const messageInput = () => screen.getByRole('textbox', { name: /متن پیام/ })
export const sendButton = () => screen.getByRole('button', { name: 'ارسال پیام' })

/** Fills the form as a visitor would (the subject only when there is a select). */
export async function fill({
  subject = 'انتقاد و شکایت',
  name = 'سارا احمدی',
  email = '',
  phone = '۰۹۱۲ ۱۲۳ ۴۵۶۷',
  message = 'سفارش ۸۴۹۲۳۷۰ هنوز نرسیده است.',
}: Partial<Record<'subject' | 'name' | 'email' | 'phone' | 'message', string>> = {}) {
  if (subject && screen.queryByRole('combobox')) {
    await userEvent.selectOptions(subjectSelect(), subject)
  }
  if (name) await userEvent.type(nameInput(), name)
  if (email) await userEvent.type(emailInput(), email)
  if (phone) await userEvent.type(phoneInput(), phone)
  if (message) await userEvent.type(messageInput(), message)
}

/** The texts that describe a control (its hint, its error), joined. */
export function description(element: HTMLElement): string {
  return (element.getAttribute('aria-describedby') ?? '')
    .split(' ')
    .filter(Boolean)
    .map((id) => document.getElementById(id)?.textContent ?? '')
    .join(' ')
}
