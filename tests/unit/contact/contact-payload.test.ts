import { describe, expect, it } from 'vitest'
import {
  CHANNEL_REQUIRED,
  contactBody,
  contactLocalErrors,
  contactPhone,
  EMPTY_CONTACT,
  type ContactValues,
} from '@/features/contact/contact-payload'

// The contact form's request body and its one check before sending (content digest §9.2): the
// subject as a Number (left out while the form has no subject list), the e-mail and the phone
// trimmed and left out when empty, the phone's digits normalised, the honeypot as typed; and
// neither e-mail nor phone means no request at all.

const filled: ContactValues = {
  subject: '3',
  name: '  سارا احمدی ',
  email: '  sara@example.com ',
  phone: '',
  message: 'سفارشم هنوز نرسیده است.\nلطفاً پیگیری کنید.',
  website: '',
}

describe('contactPhone', () => {
  it('normalises an Iranian mobile written in Persian digits, with spaces or +98', () => {
    expect(contactPhone('۰۹۱۲ ۱۲۳ ۴۵۶۷')).toBe('09121234567')
    expect(contactPhone(' +98 912-123-4567 ')).toBe('09121234567')
    expect(contactPhone('٩١٢١٢٣٤٥٦٧')).toBe('09121234567')
  })

  it('sends anything else in Latin digits, trimmed, for the API to judge (a landline)', () => {
    expect(contactPhone(' ۰۲۱۸۸۷۷۶۶۵۵ ')).toBe('02188776655')
    expect(contactPhone('+14155552671')).toBe('+14155552671')
  })

  it('is null when empty', () => {
    expect(contactPhone('   ')).toBeNull()
  })
})

describe('contactBody', () => {
  it('sends the subject as a Number, the e-mail trimmed, no empty phone, the honeypot as typed', () => {
    expect(contactBody(filled, { withSubject: true })).toEqual({
      subject: 3,
      name: 'سارا احمدی',
      email: 'sara@example.com',
      message: 'سفارشم هنوز نرسیده است.\nلطفاً پیگیری کنید.',
      website: '',
    })
  })

  it('leaves the subject out while the form has no subject list, and the empty e-mail', () => {
    const body = contactBody(
      { ...filled, subject: '', email: ' ', phone: '۰۹۱۲۱۲۳۴۵۶۷' },
      { withSubject: false },
    )
    expect(body).toEqual({
      name: 'سارا احمدی',
      phone: '09121234567',
      message: filled.message,
      website: '',
    })
    expect(Object.keys(body)).not.toContain('subject')
    expect(Object.keys(body)).not.toContain('email')
  })

  it('forwards a filled honeypot untouched', () => {
    expect(
      contactBody({ ...filled, website: ' http://spam ' }, { withSubject: true }).website,
    ).toBe(' http://spam ')
  })
})

describe('contactLocalErrors', () => {
  it('with neither e-mail nor phone: the API’s own `contact_channel_required` sentence', () => {
    expect(contactLocalErrors({ ...filled, email: '  ' }, { withSubject: true })).toEqual({
      channel: CHANNEL_REQUIRED,
    })
    expect(CHANNEL_REQUIRED).toBe('ایمیل یا شمارهٔ موبایل خود را بنویسید تا پاسخ به دستتان برسد.')
  })

  it('asks for the subject (when listed), the name and the text; their lengths are the API’s', () => {
    expect(contactLocalErrors({ ...EMPTY_CONTACT, phone: '0912' }, { withSubject: true })).toEqual({
      subject: 'موضوع پیام را انتخاب کنید.',
      name: 'نام خود را بنویسید.',
      message: 'متن پیام را بنویسید.',
    })
    expect(
      contactLocalErrors({ ...filled, subject: '', message: 'کوتاه' }, { withSubject: false }),
    ).toEqual({})
  })
})
