import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ContactForm } from '@/features/contact/contact-form'
import type { ContactSubject } from '@/lib/api/types/contact'
import { paginated } from '../blog/page-support'
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
  SUBJECTS_PATH,
  SUBMIT_PATH,
} from './contact-support'

// A stale subject list (content digest §9.2; plan Review Focus #4): the page's list is cached
// 300 s, so a subject switched off meanwhile (`contact_subject_unavailable`), or a list that was
// empty and is not any more (`contact_subject_required` while the form had no select), means the
// form's list is out of date. The form reads it again through the BFF (uncached), redraws the
// select (a new one: its key is the ids), keeps everything typed and says what happened.

const bffFetch = vi.hoisted(() => vi.fn())
vi.mock('@/lib/api/client', () => ({ bffFetch }))

const UNAVAILABLE = refusal(
  'contact_subject_unavailable',
  'این موضوع دیگر در فهرست نیست؛ صفحه را تازه کنید و موضوع دیگری انتخاب کنید.',
)
const REQUIRED = refusal('contact_subject_required', 'موضوع پیام را انتخاب کنید.')
const FRESH: ContactSubject[] = [
  { id: 1, title: 'پیگیری سفارش' },
  { id: 4, title: 'همکاری' },
]
const STALE_NOTE = 'فهرست موضوع\u{200C}ها تغییر کرده بود و به\u{200C}روز شد'

/** The submit answers `refusal`; the subject list answers `fresh` (or fails). */
function answer(refused: unknown, fresh: ContactSubject[] | Error) {
  bffFetch.mockImplementation((path: string) => {
    if (path === SUBMIT_PATH) return Promise.reject(refused)
    if (path === SUBJECTS_PATH) {
      return fresh instanceof Error ? Promise.reject(fresh) : ok(paginated(fresh))
    }
    return Promise.reject(new Error(`unexpected call: ${path}`))
  })
}

function show(subjects = SUBJECTS) {
  const { wrapper } = clientProviders()
  return render(<ContactForm subjects={subjects} />, { wrapper })
}

const optionTitles = () =>
  [...(subjectSelect() as HTMLSelectElement).options].map((option) => option.text)

beforeEach(() => {
  bffFetch.mockReset()
})

describe('a subject switched off meanwhile (contact_subject_unavailable)', () => {
  it('reads the subjects again, redraws the select and keeps what was typed', async () => {
    answer(UNAVAILABLE, FRESH)
    show()
    await fill({ subject: 'انتقاد و شکایت', email: 'sara@example.com' })
    const before = subjectSelect()
    await userEvent.click(sendButton())

    expect(await screen.findByText(new RegExp(STALE_NOTE))).toBeInTheDocument()
    expect(bffFetch).toHaveBeenCalledWith(SUBJECTS_PATH, { query: { limit: 100, page: 1 } })
    expect(subjectSelect()).not.toBe(before)
    expect(optionTitles()).toEqual(['انتخاب کنید', 'پیگیری سفارش', 'همکاری'])
    expect(subjectSelect()).toHaveValue('')
    expect(description(subjectSelect())).toContain(STALE_NOTE)
    expect(subjectSelect()).toHaveFocus()
    expect(nameInput()).toHaveValue('سارا احمدی')
    expect(emailInput()).toHaveValue('sara@example.com')
    expect(phoneInput()).toHaveValue('۰۹۱۲ ۱۲۳ ۴۵۶۷')
    expect(messageInput()).toHaveValue('سفارش ۸۴۹۲۳۷۰ هنوز نرسیده است.')
  })

  it('the next message goes with a subject of the new list', async () => {
    answer(UNAVAILABLE, FRESH)
    show()
    await fill()
    await userEvent.click(sendButton())
    await screen.findByText(new RegExp(STALE_NOTE))
    bffFetch.mockReturnValue(ok({}, 'پیام شما ثبت شد و به\u{200C}زودی بررسی می\u{200C}شود.'))
    await userEvent.selectOptions(subjectSelect(), 'همکاری')
    await userEvent.click(sendButton())
    expect(bffFetch).toHaveBeenLastCalledWith(SUBMIT_PATH, {
      method: 'POST',
      body: expect.objectContaining({ subject: 4, name: 'سارا احمدی' }) as unknown,
    })
  })

  it('when the list cannot be read again: the API’s sentence under the old select', async () => {
    answer(UNAVAILABLE, new Error('down'))
    show()
    await fill()
    await userEvent.click(sendButton())
    expect(await screen.findByText(/این موضوع دیگر در فهرست نیست/)).toBeInTheDocument()
    expect(optionTitles()).toHaveLength(SUBJECTS.length + 1)
  })
})

describe('a list that was empty and is not any more (contact_subject_required, no select)', () => {
  it('reads the subjects and shows the select, with what happened', async () => {
    answer(REQUIRED, FRESH)
    show([])
    expect(screen.queryByRole('combobox')).toBeNull()
    await fill()
    await userEvent.click(sendButton())
    expect(await screen.findByRole('combobox', { name: /موضوع پیام/ })).toHaveFocus()
    expect(optionTitles()).toEqual(['انتخاب کنید', 'پیگیری سفارش', 'همکاری'])
    expect(description(subjectSelect())).toContain(STALE_NOTE)
    expect(nameInput()).toHaveValue('سارا احمدی')
  })
})

describe('a list emptied meanwhile', () => {
  it('drops the select and says the message can go again without a subject', async () => {
    answer(UNAVAILABLE, [])
    show()
    await fill()
    await userEvent.click(sendButton())
    expect(await screen.findByRole('alert')).toHaveTextContent('دیگر موضوعی برای انتخاب نیست')
    expect(screen.queryByRole('combobox')).toBeNull()
    expect(messageInput()).toHaveValue('سفارش ۸۴۹۲۳۷۰ هنوز نرسیده است.')
  })
})
