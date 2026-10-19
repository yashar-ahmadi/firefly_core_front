import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FaqBrowser } from '@/features/faq/faq-browser'
import type { FaqSection } from '@/features/faq/faq-sections'

// The help centre in the browser: the search over every question (Persian-aware, its count said
// politely, an empty state), the chip row to each category, and a `#faq-<id>` link opening its
// question and bringing it into view.

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }))

const entry = (id: number, question: string, text: string) => ({
  id,
  question,
  html: `<p>${text}</p>`,
  text,
})

const SECTIONS: FaqSection[] = [
  // Ids as live: a category's id can be a question's too (category 10001 holds question 10001).
  {
    id: 10001,
    name: 'سفارش و خرید',
    entries: [
      entry(10001, 'چطور سفارش خود را ثبت کنم؟', 'کالا را به سبد خرید اضافه کنید.'),
      entry(10002, 'آیا بدون ثبت نام می\u{200C}توانم بخرم؟', 'بله، خرید مهمان فعال است.'),
    ],
  },
  {
    id: 10002,
    name: 'ارسال و تحویل',
    entries: [entry(10005, 'هزینه ارسال چطور محاسبه می شود؟', 'بر اساس وزن مرسوله.')],
  },
]

const scrolled = vi.fn()

beforeEach(() => {
  window.location.hash = ''
  scrolled.mockReset()
  Element.prototype.scrollIntoView = scrolled
})

afterEach(() => {
  window.location.hash = ''
})

const question = (id: number) => document.getElementById(`faq-${id}`) as HTMLDetailsElement
/** Not hidden by the search, nor inside a hidden category (a closed <details> is still shown). */
const listed = (id: number) => question(id).closest('[hidden]') === null
const status = () => screen.getByRole('status')
const search = () => screen.getByRole('searchbox', { name: 'جستجو در پرسش\u{200C}ها' })

describe('the search', () => {
  it('filters the questions, Persian-aware, and says the count politely', async () => {
    render(<FaqBrowser sections={SECTIONS} />)
    expect(status()).toHaveTextContent('')
    await userEvent.type(search(), 'هز\u{064A}نه')
    expect(listed(10005)).toBe(true)
    expect(listed(10001)).toBe(false)
    expect(listed(10002)).toBe(false)
    // A category without a match goes with its questions; the chip row while searching too.
    expect(screen.queryByRole('heading', { name: 'سفارش و خرید' })).toBeNull()
    expect(screen.queryByRole('navigation', { name: 'دسته\u{200C}های پرسش\u{200C}ها' })).toBeNull()
    expect(status()).toHaveAttribute('aria-live', 'polite')
    expect(status()).toHaveTextContent('۱ پرسش پیدا شد.')
  })

  it('searches the answers too, and counts every match', async () => {
    render(<FaqBrowser sections={SECTIONS} />)
    await userEvent.type(search(), 'خرید')
    expect(status()).toHaveTextContent('۲ پرسش پیدا شد.')
  })

  it('shows its empty state when nothing matches, with the way to ask the shop', async () => {
    render(<FaqBrowser sections={SECTIONS} />)
    await userEvent.type(search(), 'گارانتی')
    expect(document.querySelectorAll('details:not([hidden])')).toHaveLength(0)
    expect(status()).toHaveTextContent('پرسشی پیدا نشد.')
    expect(screen.getByText('برای «گارانتی» پرسشی پیدا نشد.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'پرسش خود را برای ما بفرستید' })).toHaveAttribute(
      'href',
      '/contact-us/',
    )
  })

  it('shows every question and the chips again once the query is cleared', async () => {
    render(<FaqBrowser sections={SECTIONS} />)
    await userEvent.type(search(), 'گارانتی')
    await userEvent.clear(search())
    expect(document.querySelectorAll('details:not([hidden])')).toHaveLength(3)
    expect(screen.getByRole('navigation', { name: 'دسته\u{200C}های پرسش\u{200C}ها' })).toBeVisible()
    expect(status()).toHaveTextContent('')
  })
})

describe('a link to one question', () => {
  it('opens it and brings it into view on arrival (#faq-<id>)', () => {
    window.location.hash = '#faq-10005'
    render(<FaqBrowser sections={SECTIONS} />)
    expect(question(10005).open).toBe(true)
    expect(question(10001).open).toBe(false)
    expect(scrolled.mock.contexts).toEqual([question(10005)])
  })

  it('opens the question an in-page link names (hashchange)', () => {
    render(<FaqBrowser sections={SECTIONS} />)
    act(() => {
      window.location.hash = '#faq-10002'
      window.dispatchEvent(new HashChangeEvent('hashchange'))
    })
    expect(question(10002).open).toBe(true)
  })

  it('clears a search that hides the question, then opens it', async () => {
    render(<FaqBrowser sections={SECTIONS} />)
    await userEvent.type(search(), 'هزینه')
    expect(listed(10001)).toBe(false)
    act(() => {
      window.location.hash = '#faq-10001'
      window.dispatchEvent(new HashChangeEvent('hashchange'))
    })
    expect(search()).toHaveValue('')
    expect(listed(10001)).toBe(true)
    expect(question(10001).open).toBe(true)
  })

  it('leaves a category’s anchor (whose id a question may share) and an unknown question alone', () => {
    window.location.hash = '#faq-category-10002'
    render(<FaqBrowser sections={SECTIONS} />)
    expect(document.querySelectorAll('details[open]')).toHaveLength(0)
    expect(scrolled).not.toHaveBeenCalled()
    within(document.body).getByRole('heading', { name: 'ارسال و تحویل' })
  })
})
