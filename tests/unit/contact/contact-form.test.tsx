import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ContactForm } from '@/features/contact/contact-form'
import { CHANNEL_REQUIRED } from '@/features/contact/contact-payload'
import { ApiError } from '@/lib/api/errors'
import { clientProviders } from '../support/providers'
import {
  description,
  emailInput,
  fill,
  messageInput,
  nameInput,
  ok,
  phoneInput,
  refusal,
  sendButton,
  subjectSelect,
  SUBJECTS,
  SUBMIT_PATH,
} from './contact-support'

// The contact form (content digest §9.2): the subject select only while subjects are listed (its
// first option «انتخاب کنید», disabled), the name, e-mail and phone in one fieldset (at least one
// of them, checked before any request), the text, the honeypot; the API's errors where they
// belong; the 201's own sentence; a 429 held in minutes.

const bffFetch = vi.hoisted(() => vi.fn())
vi.mock('@/lib/api/client', () => ({ bffFetch }))

function show(subjects = SUBJECTS, hasSession = false) {
  const { wrapper } = clientProviders({ hasSession })
  return render(<ContactForm subjects={subjects} />, { wrapper })
}

beforeEach(() => {
  bffFetch.mockReset()
})

describe('the form', () => {
  it('offers the subjects after a disabled «انتخاب کنید», and every field with its hints', () => {
    show()
    const subject = subjectSelect() as HTMLSelectElement
    expect(subject).toHaveAttribute('aria-required', 'true')
    expect(
      [...subject.options].map((option) => [option.text, option.value, option.disabled]),
    ).toEqual([
      ['انتخاب کنید', '', true],
      ['پیگیری سفارش', '1', false],
      ['پیشنهاد', '2', false],
      ['انتقاد و شکایت', '3', false],
    ])
    expect(subject).toHaveValue('')
    expect(nameInput()).toHaveAttribute('maxlength', '100')
    expect(nameInput()).toHaveAttribute('autocomplete', 'name')
    const channel = within(screen.getByRole('group', { name: /راه پاسخ/ }))
    expect(channel.getByRole('textbox', { name: /ایمیل/ })).toHaveAttribute('type', 'email')
    expect(emailInput()).toHaveAttribute('dir', 'ltr')
    expect(emailInput()).toHaveAttribute('maxlength', '254')
    expect(channel.getByRole('textbox', { name: /موبایل/ })).toHaveAttribute('type', 'tel')
    expect(phoneInput()).toHaveAttribute('dir', 'ltr')
    expect(messageInput()).toHaveAttribute('minlength', '10')
    expect(messageInput()).toHaveAttribute('maxlength', '5000')
    const honeypot = document.querySelector<HTMLInputElement>('input[name="website"]')!
    expect(honeypot).toHaveAttribute('tabindex', '-1')
    expect(honeypot.closest('[aria-hidden="true"]')).not.toBeNull()
  })

  it('has no subject select while the list is empty; a signed-in visitor still sees every field', () => {
    show([], true)
    expect(screen.queryByRole('combobox')).toBeNull()
    expect(nameInput()).toBeInTheDocument()
    expect(emailInput()).toBeInTheDocument()
    expect(phoneInput()).toBeInTheDocument()
  })
})

describe('before sending', () => {
  it('without e-mail and phone: the API’s sentence under both, the focus on e-mail, nothing sent', async () => {
    show()
    await fill({ phone: '' })
    await userEvent.click(sendButton())
    expect(bffFetch).not.toHaveBeenCalled()
    expect(screen.getByText(CHANNEL_REQUIRED)).toBeInTheDocument()
    for (const input of [emailInput(), phoneInput()]) {
      expect(input).toHaveAttribute('aria-invalid', 'true')
      expect(description(input)).toContain(CHANNEL_REQUIRED)
    }
    expect(emailInput()).toHaveFocus()
  })
})

describe('sending', () => {
  it('posts the subject as a Number, the phone normalised, no empty e-mail, the honeypot as typed', async () => {
    bffFetch.mockReturnValue(ok({}, 'پیام شما ثبت شد و به\u{200C}زودی بررسی می\u{200C}شود.'))
    show()
    await fill()
    await userEvent.click(sendButton())
    expect(bffFetch).toHaveBeenCalledTimes(1)
    expect(bffFetch).toHaveBeenCalledWith(SUBMIT_PATH, {
      method: 'POST',
      body: {
        subject: 3,
        name: 'سارا احمدی',
        phone: '09121234567',
        message: 'سفارش ۸۴۹۲۳۷۰ هنوز نرسیده است.',
        website: '',
      },
    })
  })

  it('on 201: the API’s sentence verbatim, the form cleared, the focus on the text', async () => {
    bffFetch.mockReturnValue(ok({}, 'پیام شما ثبت شد و به\u{200C}زودی بررسی می\u{200C}شود.'))
    show()
    await fill({ email: 'sara@example.com' })
    await userEvent.click(sendButton())
    // Verbatim, in a polite region that was on the page before (so it is read out).
    const notice = await screen.findByText('پیام شما ثبت شد و به\u{200C}زودی بررسی می\u{200C}شود.')
    expect(notice.closest('[role="status"]')).not.toBeNull()
    expect(subjectSelect()).toHaveValue('')
    for (const input of [nameInput(), emailInput(), phoneInput(), messageInput()]) {
      expect(input).toHaveValue('')
    }
    expect(messageInput()).toHaveFocus()
  })

  it('holds the button while the message is on its way: a second press sends nothing', async () => {
    bffFetch.mockReturnValue(new Promise(() => {}))
    show()
    await fill()
    await userEvent.click(sendButton())
    expect(sendButton()).toHaveAttribute('aria-busy', 'true')
    await userEvent.click(sendButton())
    expect(bffFetch).toHaveBeenCalledTimes(1)
  })
})

describe('the API’s refusals, where they belong', () => {
  it('contact_subject_required (attr null) under the subject, which takes the focus', async () => {
    bffFetch.mockRejectedValue(refusal('contact_subject_required', 'موضوع پیام را انتخاب کنید.'))
    show()
    await fill()
    await userEvent.click(sendButton())
    expect(description(subjectSelect())).toContain('موضوع پیام را انتخاب کنید.')
    expect(subjectSelect()).toHaveFocus()
  })

  it('invalid_iranian_mobile under the phone; the typed text kept', async () => {
    const detail =
      'شمارهٔ موبایل ایران را وارد کنید؛ تلفن ثابت و شمارهٔ خارجی پذیرفته نمی\u{200C}شود.'
    bffFetch.mockRejectedValue(refusal('invalid_iranian_mobile', detail, 'phone'))
    show()
    await fill({ phone: '02188776655' })
    await userEvent.click(sendButton())
    expect(description(phoneInput())).toContain(detail)
    expect(phoneInput()).toHaveFocus()
    expect(phoneInput()).toHaveValue('02188776655')
  })

  it('a parse_error, a 413 or no connection: one alert above the button', async () => {
    bffFetch.mockRejectedValue(ApiError.network())
    show()
    await fill()
    await userEvent.click(sendButton())
    expect(screen.getByRole('alert')).toHaveTextContent('ارسال نشد')
  })

  it('a 429 holds the button for `retry_after`, said in minutes; a press then sends nothing', async () => {
    bffFetch.mockRejectedValue(
      ApiError.fromBody(429, {
        msg: 'x',
        code: 429,
        data: {
          type: 'client_error',
          errors: [{ code: 'throttled', detail: 'x', attr: null }],
          retry_after: 3506,
        },
      }),
    )
    show()
    await fill()
    await userEvent.click(sendButton())
    expect(screen.getByRole('alert')).toHaveTextContent('۵۹ دقیقهٔ دیگر')
    expect(sendButton()).toHaveAttribute('aria-disabled', 'true')
    expect(description(sendButton())).toContain('۵۹ دقیقه')
    await userEvent.click(sendButton())
    expect(bffFetch).toHaveBeenCalledTimes(1)
  })
})
