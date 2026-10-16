import { describe, expect, it, vi } from 'vitest'
import { sanitizeOperatorHtml } from '@/lib/html/sanitize'

vi.mock('server-only', () => ({}))

const API = 'https://api.shop.ir/'
const SITE = 'https://shop.ir'

function clean(html: string, siteUrl?: string): string {
  return sanitizeOperatorHtml(html, API, siteUrl ? { siteUrl } : undefined)
}

/** The sanitised markup as a DOM fragment, to assert on what a browser would build from it. */
function dom(html: string, siteUrl?: string): HTMLElement {
  const container = document.createElement('div')
  container.innerHTML = clean(html, siteUrl)
  return container
}

/** Every element of the fragment, for checks that must hold everywhere. */
function everyElement(container: HTMLElement): Element[] {
  return [...container.querySelectorAll('*')]
}

function hasExecutableContent(container: HTMLElement): boolean {
  return everyElement(container).some(
    (element) =>
      ['SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'EMBED', 'SVG', 'MATH', 'TEMPLATE'].includes(
        element.tagName.toUpperCase(),
      ) ||
      [...element.attributes].some(
        (attribute) =>
          attribute.name.startsWith('on') ||
          attribute.name === 'style' ||
          /^\s*(?:javascript|vbscript|data):/i.test(attribute.value),
      ),
  )
}

describe('sanitizeOperatorHtml: allowed markup', () => {
  it('keeps basic formatting, lists, quotes and line breaks', () => {
    const html =
      '<p>فروشگاه <strong>فایرفلای</strong>؛ <em>ارسال</em> <u>سریع</u><br>و <small>مطمئن</small></p>' +
      '<ul><li>اصالت کالا</li><li>ضمانت بازگشت</li></ul><ol start="3"><li>سه</li></ol>' +
      '<blockquote>نقل قول</blockquote><hr>'
    expect(clean(html)).toBe(html.replace('<br>', '<br />').replace('<hr>', '<hr />'))
  })

  it('demotes h1 to h2 (the page already has its own h1) and keeps h2 to h6', () => {
    expect(clean('<h1>درباره ما</h1><h3>تاریخچه</h3>')).toBe('<h2>درباره ما</h2><h3>تاریخچه</h3>')
  })

  it('keeps dir and lang with valid values and drops anything else', () => {
    expect(clean('<p dir="ltr" lang="en">Firefly</p><p dir="sideways">x</p>')).toBe(
      '<p dir="ltr" lang="en">Firefly</p><p>x</p>',
    )
  })

  it('drops classes, ids, styles and unknown attributes', () => {
    expect(
      clean('<p class="fixed inset-0" id="x" name="y" style="color:red" data-x="1">متن</p>'),
    ).toBe('<p>متن</p>')
  })

  it('returns an empty string for empty or whitespace-only input', () => {
    expect(clean('')).toBe('')
    expect(clean('   \n ')).toBe('')
  })
})

describe('sanitizeOperatorHtml: dangerous markup', () => {
  it('removes scripts and styles together with their content', () => {
    expect(clean('<p>سلام</p><script>alert(1)</script><style>body{display:none}</style>')).toBe(
      '<p>سلام</p>',
    )
    expect(clean('<SCRIPT SRC="https://evil.example/x.js"></SCRIPT>متن')).toBe('متن')
  })

  it('removes iframes, objects, embeds, svg, math, forms and templates', () => {
    const container = dom(
      '<iframe src="https://www.aparat.com/video/video/embed/videohash/x">fallback</iframe>' +
        '<object data="x.swf"></object><embed src="x.swf">' +
        '<svg><script>alert(1)</script><text>svg</text></svg><math><mi>x</mi></math>' +
        '<form action="https://evil.example"><input name="card"><button>پرداخت</button></form>' +
        '<template><p>t</p></template><p>ماند</p>',
    )
    expect(hasExecutableContent(container)).toBe(false)
    expect(container.querySelector('form, input, button')).toBeNull()
    expect(container.innerHTML).not.toContain('fallback')
    expect(container.innerHTML).not.toContain('svg')
    expect(container.textContent).toContain('ماند')
  })

  it('removes event handler attributes in any case', () => {
    const container = dom(
      '<img src="/media/a.png" onerror="alert(1)" alt="الف"><p ONCLICK="x()" onMouseOver="y()">متن</p>' +
        '<a href="/page/x/" onfocus="z()">پیوند</a>',
    )
    expect(hasExecutableContent(container)).toBe(false)
    expect(container.querySelector('img')).toHaveAttribute('alt', 'الف')
  })

  it('removes javascript:, vbscript: and data: URLs, however they are disguised', () => {
    const hrefs = [
      'javascript:alert(1)',
      'JaVaScRiPt:alert(1)',
      ' javascript:alert(1)',
      'java\nscript:alert(1)',
      'java&#x09;script:alert(1)',
      '&#106;avascript:alert(1)',
      'vbscript:msgbox(1)',
      'data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==',
    ]
    for (const href of hrefs) {
      const container = dom(`<a href="${href}">پیوند</a>`)
      expect(container.querySelector('a')?.hasAttribute('href'), href).toBe(false)
      expect(container.textContent).toBe('پیوند')
    }
    // An image left without a source is dropped altogether.
    expect(clean('<img src="data:image/png;base64,iVBORw0KGgo=" alt="">')).toBe('')
    expect(clean('<p><img src="javascript:alert(1)">متن</p>')).toBe('<p>متن</p>')
  })

  it('defeats nested and malformed tag tricks', () => {
    const tricks = [
      '<scr<script>ipt>alert(1)</script>',
      '<<script>script>alert(1)<</script>/script>',
      '<script<script>>alert(1)</script>',
      '<img src=x onerror=alert(1)//',
      '<img """><script>alert(1)</script>">',
      '<!--<script>alert(1)</script>-->',
      '<p title="</p><script>alert(1)</script>">متن</p>',
      '<a href="/x/"<script>alert(1)</script>>x</a>',
      '<div><style><img src=x onerror=alert(1)></style></div>',
      '<noscript><p title="</noscript><img src=x onerror=alert(1)>"></noscript>',
    ]
    for (const trick of tricks) {
      const container = dom(trick)
      expect(hasExecutableContent(container), trick).toBe(false)
      expect(container.querySelector('script'), trick).toBeNull()
    }
  })

  it('escapes text so it can never become markup again', () => {
    const output = clean('<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>')
    expect(output).toBe('<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>')
    expect(dom(output).querySelector('script')).toBeNull()
  })
})

describe('sanitizeOperatorHtml: links and images', () => {
  it('makes /media and /static URLs absolute on the API origin', () => {
    const container = dom(
      '<img src="/media/footer/badge.png" alt="نشان"><a href="/static/docs/terms.pdf">شرایط</a>',
    )
    expect(container.querySelector('img')).toHaveAttribute(
      'src',
      'https://api.shop.ir/media/footer/badge.png',
    )
    expect(container.querySelector('a')).toHaveAttribute(
      'href',
      'https://api.shop.ir/static/docs/terms.pdf',
    )
  })

  it('leaves storefront paths and absolute URLs as written', () => {
    const container = dom(
      '<a href="/page/terms/">قوانین</a><a href="/mediakit/">رسانه</a>' +
        '<img src="https://cdn.example.com/a.png" alt="">',
    )
    const [terms, mediakit] = container.querySelectorAll('a')
    expect(terms).toHaveAttribute('href', '/page/terms/')
    expect(mediakit).toHaveAttribute('href', '/mediakit/')
    expect(container.querySelector('img')).toHaveAttribute('src', 'https://cdn.example.com/a.png')
  })

  it('opens external links in a new tab with rel="noopener noreferrer"', () => {
    const link = dom('<a href="https://instagram.com/shop">اینستاگرام</a>').querySelector('a')
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', 'noopener noreferrer')
    const relative = dom('<a href="//t.me/shop">تلگرام</a>').querySelector('a')
    expect(relative).toHaveAttribute('target', '_blank')
  })

  it('treats backslash and tab spellings of another host as external (browsers read them as //)', () => {
    const hrefs = [
      '/\\evil.example/',
      '\\\\evil.example/',
      '\\/evil.example/',
      'https:\\\\evil.example/',
    ]
    for (const href of [...hrefs, '/&#9;/evil.example/']) {
      const link = dom(`<a href="${href}">پیوند</a>`, SITE).querySelector('a')
      expect(link, href).toHaveAttribute('target', '_blank')
      expect(link, href).toHaveAttribute('rel', 'noopener noreferrer')
    }
    expect(dom('<a href="/page\\about/">درباره</a>', SITE).querySelector('a')).not.toHaveAttribute(
      'target',
    )
  })

  it('reads hrefs as browsers do: leading and trailing C0 controls and spaces are ignored', () => {
    for (const lead of ['\u{0}', '\u{1}', '\u{8}', '\t', '\n', ' \u{1F} ']) {
      const script = dom(`<a href="${lead}javascript:alert(1)${lead}">پیوند</a>`, SITE)
      const href = script.querySelector('a')?.getAttribute('href')
      // Removed, or harmless once a browser resolves it against the page.
      if (href) expect(new URL(href, SITE).protocol, JSON.stringify(lead)).not.toBe('javascript:')
      const external = dom(`<a href="${lead}//evil.example/${lead}">پیوند</a>`, SITE)
      expect(external.querySelector('a'), JSON.stringify(lead)).toHaveAttribute('target', '_blank')
    }
  })

  it('keeps internal, mailto and tel links in the same tab', () => {
    const container = dom(
      '<a href="/page/about/" target="_self">درباره</a><a href="mailto:hi@shop.ir">ایمیل</a>' +
        '<a href="tel:+982191000000">تلفن</a><a href="https://shop.ir/blog/">بلاگ</a>',
      SITE,
    )
    for (const link of container.querySelectorAll('a')) {
      expect(link.hasAttribute('target'), link.textContent ?? '').toBe(false)
      expect(link.hasAttribute('rel'), link.textContent ?? '').toBe(false)
    }
  })

  it('protects an internal link the operator opens in a new tab and keeps rel hints', () => {
    const container = dom(
      '<a href="/page/x/" target="_blank">x</a><a href="https://ads.example" rel="sponsored nofollow evil">آگهی</a>',
    )
    const [internal, sponsored] = container.querySelectorAll('a')
    expect(internal).toHaveAttribute('target', '_blank')
    expect(internal).toHaveAttribute('rel', 'noopener noreferrer')
    expect(sponsored).toHaveAttribute('rel', 'sponsored nofollow noopener noreferrer')
  })

  it('lazy-loads images and gives them an empty alt when none is set', () => {
    const image = dom('<img src="/media/a.png" width="120" height="40">').querySelector('img')
    expect(image).toHaveAttribute('loading', 'lazy')
    expect(image).toHaveAttribute('decoding', 'async')
    expect(image).toHaveAttribute('alt', '')
    expect(image).toHaveAttribute('width', '120')
  })
})

describe('sanitizeOperatorHtml: tables', () => {
  const WRAP = '<div class="table-wrap" role="region" tabindex="0" aria-label="جدول">'

  it('wraps every table in a focusable, labelled scroll region', () => {
    const output = clean(
      '<table><tr><th scope="col">وزن</th><td colspan="2">۱ کیلو</td></tr></table>',
    )
    expect(output).toBe(
      `${WRAP}<table><tr><th scope="col">وزن</th><td colspan="2">۱ کیلو</td></tr></table></div>`,
    )
  })

  it('wraps nested and unclosed tables, and only real table tags', () => {
    const container = dom(
      '<table><tr><td title="<table>">بیرونی<table><tr><td>درونی</td></tr></table></td></tr></table>' +
        '<p>&lt;table&gt; متن</p><table><tr><td>باز',
    )
    const wraps = container.querySelectorAll('.table-wrap')
    expect(wraps).toHaveLength(3)
    for (const wrap of wraps) {
      expect(wrap.firstElementChild?.tagName).toBe('TABLE')
      expect(wrap).toHaveAttribute('tabindex', '0')
    }
    expect(container.querySelector('p')?.textContent).toBe('<table> متن')
  })
})
