import { describe, expect, it, vi } from 'vitest'
import { RESERVED_IDS } from '@/lib/html/reserved-ids'
import { sanitizeOperatorHtml } from '@/lib/html/sanitize'

vi.mock('server-only', () => ({}))

// A blog post's headings carry the ids the API gave them, which its `headings` list (the table of
// contents) links to (blog digest §1.5). The sanitiser keeps exactly those ids, on headings only,
// each once, and never one the page's own markup uses (`RESERVED_IDS`).

const API = 'https://api.shop.ir/'
const IDS = new Set(['چرا-بودجه-۳۰-میلیونی', 'معیارها', 'top'])

const clean = (html: string, headingIds?: ReadonlySet<string>) =>
  sanitizeOperatorHtml(html, API, headingIds ? { headingIds } : {})

describe('sanitizeOperatorHtml: heading ids', () => {
  it('keeps the listed ids on h2 to h6, an h1 (shown as h2) included', () => {
    expect(
      clean(
        '<h1 id="top">عنوان</h1><h2 id="چرا-بودجه-۳۰-میلیونی">چرا؟</h2><h3 id="معیارها">معیارها</h3>',
        IDS,
      ),
    ).toBe(
      '<h2 id="top">عنوان</h2><h2 id="چرا-بودجه-۳۰-میلیونی">چرا؟</h2><h3 id="معیارها">معیارها</h3>',
    )
  })

  it('drops an id the list does not have, and every id that is not on a heading', () => {
    expect(clean('<h2 id="other">x</h2><p id="top">y</p><a id="top" href="/x/">z</a>', IDS)).toBe(
      '<h2>x</h2><p>y</p><a href="/x/">z</a>',
    )
  })

  it('keeps none without a list (operator HTML elsewhere: the footer, FAQ answers…)', () => {
    expect(clean('<h2 id="top">x</h2>')).toBe('<h2>x</h2>')
  })

  it('an empty id is no anchor', () => {
    expect(clean('<h2 id="">؟!</h2>', new Set(['']))).toBe('<h2>؟!</h2>')
  })
})

describe('sanitizeOperatorHtml: heading ids the page can use', () => {
  it('keeps an id on its first heading only: the document never has it twice', () => {
    const ids = new Set(['note'])
    expect(clean('<h2 id="note">الف</h2><h3 id="note">ب</h3><h4 id="note">پ</h4>', ids)).toBe(
      '<h2 id="note">الف</h2><h3>ب</h3><h4>پ</h4>',
    )
  })

  it('an id dropped elsewhere first (not a heading) is still kept on the first heading', () => {
    expect(clean('<p id="note">الف</p><h2 id="note">ب</h2>', new Set(['note']))).toBe(
      '<p>الف</p><h2 id="note">ب</h2>',
    )
  })

  it('each call starts afresh (the ids are per document)', () => {
    const ids = new Set(['note'])
    expect(clean('<h2 id="note">الف</h2>', ids)).toBe('<h2 id="note">الف</h2>')
    expect(clean('<h2 id="note">الف</h2>', ids)).toBe('<h2 id="note">الف</h2>')
  })

  it.each([...RESERVED_IDS])('never keeps «%s», an id of the page itself', (id) => {
    expect(clean(`<h2 id="${id}">x</h2><h2 id="top">y</h2>`, new Set([id, 'top']))).toBe(
      '<h2>x</h2><h2 id="top">y</h2>',
    )
  })
})
