// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { statusPage } from '@/lib/edge/status-page'

describe('statusPage', () => {
  it('answers a small RTL Persian HTML page with the given status', async () => {
    const res = statusPage(410, 'این صفحه حذف شده است', 'این صفحه دیگر وجود ندارد.')
    expect(res.status).toBe(410)
    expect(res.headers.get('content-type')).toBe('text/html; charset=utf-8')
    expect(res.headers.get('cache-control')).toBe('no-store')
    const html = await res.text()
    expect(html).toContain('dir="rtl"')
    expect(html).toContain('lang="fa"')
    expect(html).toContain('<title>این صفحه حذف شده است</title>')
    expect(html).toContain('این صفحه دیگر وجود ندارد.')
    expect(html).toContain('<a href="/"')
    expect(html).toContain('بازگشت به صفحه\u{0654} اصلی')
  })

  it('loads nothing from outside the page', async () => {
    const html = await statusPage(404, 't', 'm').text()
    expect(html).not.toMatch(/<link|<script|src=|url\(/i)
  })

  it('escapes the title and message', async () => {
    const html = await statusPage(503, '<b>&"', "<script>'x'</script>").text()
    expect(html).not.toContain('<b>')
    expect(html).not.toContain('<script>')
    expect(html).toContain('&lt;b&gt;&amp;&quot;')
    expect(html).toContain('&lt;script&gt;&#39;x&#39;&lt;/script&gt;')
  })
})
