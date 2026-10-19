import { screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import FaqRoute, { generateMetadata } from '@/app/(shop)/faq/page'
import { jsonLdBlocks, paginated, renderTree } from '../blog/page-support'
import { stubBrowserApis } from '../support/dom-stubs'
import { FAQ_CATEGORIES, faqCategory, faqItem } from './faq-fixtures'
import type { FaqCategory } from '@/lib/api/types/faq'

// `/faq/` (blog-faq digest §2.2): every category read (`limit=100`, then each page `next` names),
// cached 600 s for everyone; the server's order kept and empty categories left out; one
// `<details id="faq-<id>">` per question, the question escaped, the answer sanitised with its
// `/media` on the API; and the FAQPage JSON-LD built from the same data, escaped.

const mocks = vi.hoisted(() => ({ apiFetch: vi.fn() }))

vi.mock('server-only', () => ({}))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }))
vi.mock('@/lib/api/server', () => ({ apiFetch: mocks.apiFetch }))
vi.mock('@/features/settings/api', () => ({
  getTranslations: async () => ({}),
  getSiteSettings: async () => ({ name: 'فایرفلای' }),
}))
vi.mock('@/config/store-config', async () => {
  const pure = await import('@/config/resolve-store-config')
  const { parseServerEnv } = await import('@/config/env-schema')
  const env = { FIREFLY_API_URL: 'https://api.shop.ir', SITE_URL: 'https://shop.ir' }
  return { ...pure, getStoreConfig: () => pure.resolveStoreConfig(parseServerEnv(env)) }
})

stubBrowserApis()

const ok = (data: unknown) =>
  Promise.resolve({ data, msg: '', status: 200, headers: new Headers() })

/** The API's pages of categories: `perPage` a page, `next` on each but the last. */
function answerFaq(categories: FaqCategory[], perPage = 100) {
  mocks.apiFetch.mockImplementation((path: string, options: { query?: { page?: number } }) => {
    if (path !== 'faq/category/list') return Promise.reject(new Error(`unexpected read: ${path}`))
    const page = options.query?.page ?? 1
    const pages = Math.max(1, Math.ceil(categories.length / perPage))
    const list = paginated(categories.slice((page - 1) * perPage, page * perPage), { page, pages })
    return ok({
      ...list,
      next: page < pages ? `http://backend:8000/api/v1/faq/?page=${page + 1}` : null,
    })
  })
}

async function show(categories: FaqCategory[] = FAQ_CATEGORIES, perPage?: number) {
  answerFaq(categories, perPage)
  return renderTree(await FaqRoute())
}

const sectionNames = () =>
  screen.getAllByRole('heading', { level: 2 }).map((heading) => heading.textContent)

beforeEach(() => {
  mocks.apiFetch.mockReset()
  window.location.hash = ''
})

describe('the help centre’s reads', () => {
  it('reads every category, page by page as `next` says, anonymously, cached 600 s', async () => {
    await show(FAQ_CATEGORIES, 2)
    const reads = mocks.apiFetch.mock.calls.map(([path, options]) => [path, options])
    expect(reads).toEqual([
      ['faq/category/list', { query: { limit: 100, page: 1 }, revalidate: 600, tags: ['faq'] }],
      ['faq/category/list', { query: { limit: 100, page: 2 }, revalidate: 600, tags: ['faq'] }],
    ])
    // Page 2's categories are on the page too.
    expect(sectionNames()).toContain('پرداخت و بازگشت وجه')
  })
})

describe('the help centre’s page', () => {
  it('has its one h1, and keeps the server’s order; an empty category is left out', async () => {
    await show()
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('پرسش\u{200C}های متداول')
    expect(sectionNames()).toEqual(['سفارش و خرید', 'ارسال و تحویل', 'پرداخت و بازگشت وجه'])
    const chips = within(screen.getByRole('navigation', { name: 'دسته\u{200C}های پرسش\u{200C}ها' }))
    expect(
      chips.getAllByRole('link').map((link) => [link.textContent, link.getAttribute('href')]),
    ).toEqual([
      ['سفارش و خرید', '#faq-category-10001'],
      ['ارسال و تحویل', '#faq-category-10002'],
      ['پرداخت و بازگشت وجه', '#faq-category-10003'],
    ])
    expect(document.getElementById('faq-category-10005')).toBeNull()
  })

  it('gives each question a <details id="faq-<id>">, the question escaped in its summary', async () => {
    await show([
      faqCategory(1, 'عمومی', [
        faqItem(42, '<b>پرسش</b>\nخط دوم', 'پاسخ'),
        faqItem(43, 'دیگر', 'پاسخ'),
      ]),
    ])
    const details = document.getElementById('faq-42')!
    expect(details.tagName).toBe('DETAILS')
    expect(details).not.toHaveAttribute('open')
    const summary = details.querySelector('summary')!
    expect(summary.textContent).toContain('<b>پرسش</b>\nخط دوم')
    expect(summary.querySelector('b')).toBeNull()
    expect(summary.querySelector('.whitespace-pre-line')).not.toBeNull()
    // The question is a heading under its category's h2.
    expect(within(summary).getByRole('heading', { level: 3 })).toHaveTextContent('خط دوم')
    expect([...document.querySelectorAll('details')].map((item) => item.id)).toEqual([
      'faq-42',
      'faq-43',
    ])
  })

  it('sanitises each answer: no script, no handler, no javascript: URL; /media on the API', async () => {
    await show()
    const answer = document.getElementById('faq-10007')!
    expect(answer.querySelector('script')).toBeNull()
    expect(answer.innerHTML).not.toMatch(/onerror|javascript:/i)
    expect(answer.querySelector('img')).toHaveAttribute(
      'src',
      'https://api.shop.ir/media/uploads/faq/gateways.png',
    )
    expect(within(answer).getByRole('link', { name: 'کیف پول' })).toHaveAttribute(
      'href',
      '/page/terms/',
    )
  })

  it('shows its empty state when no category has a question, with no JSON-LD', async () => {
    await show([faqCategory(1, 'خالی', [])])
    expect(screen.getByText('هنوز پرسشی در مرکز راهنما ثبت نشده است.')).toBeInTheDocument()
    expect(document.querySelector('details')).toBeNull()
    expect(jsonLdBlocks().filter(({ data }) => data['@type'] === 'FAQPage')).toEqual([])
  })
})

describe('the FAQPage JSON-LD', () => {
  it('lists every question shown, in order, each answer as plain text, escaped', async () => {
    await show([
      faqCategory(1, 'عمومی', [
        faqItem(1, 'چرا </script><script>alert(1)</script>؟', '<p>چون <b>امن</b> است.</p>'),
      ]),
      faqCategory(2, 'خالی', []),
      faqCategory(3, 'ارسال', [faqItem(2, 'کی می\u{200C}رسد؟', 'دو روز')]),
    ])
    const blocks = jsonLdBlocks().filter(({ data }) => data['@type'] === 'FAQPage')
    expect(blocks).toHaveLength(1)
    const [{ raw, data }] = blocks
    expect(raw).not.toContain('</script')
    expect(raw).toContain('\\u003c')
    expect(data).toEqual({
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: [
        {
          '@type': 'Question',
          name: 'چرا </script><script>alert(1)</script>؟',
          acceptedAnswer: { '@type': 'Answer', text: 'چون امن است.' },
        },
        {
          '@type': 'Question',
          name: 'کی می\u{200C}رسد؟',
          acceptedAnswer: { '@type': 'Answer', text: 'دو روز' },
        },
      ],
    })
  })
})

describe('the help centre’s head', () => {
  it('an absolute title, a self canonical, a description from the categories, indexable', async () => {
    answerFaq(FAQ_CATEGORIES)
    const metadata = await generateMetadata()
    expect(metadata.title).toEqual({ absolute: 'پرسش\u{200C}های متداول | فایرفلای' })
    expect(metadata.alternates).toEqual({ canonical: '/faq/' })
    expect(metadata.description).toBe(
      'پاسخ پرسش\u{200C}های پرتکرار دربارهٔ سفارش و خرید، ارسال و تحویل، پرداخت و بازگشت وجه در فایرفلای.',
    )
    expect(metadata.robots).toBeUndefined()
    expect(metadata.openGraph).toMatchObject({
      url: '/faq/',
      title: 'پرسش\u{200C}های متداول | فایرفلای',
    })
  })
})
