import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest'
import { SnippetHtmlZone, Snippets } from '@/features/settings/snippets'
import type { Snippet } from '@/lib/api/types/settings'

vi.mock('server-only', () => ({}))
const api = vi.hoisted(() => ({ getSnippets: vi.fn<() => Promise<Snippet[]>>() }))
vi.mock('@/features/settings/api', () => api)

type Slot = 'in_head' | 'top_of_body' | 'bottom_of_body'

// Ids are unique across the file: the "warn once" bookkeeping is per snippet id.
let nextId = 1
function snippet(position: string, type: string, code: string): Snippet {
  return { id: nextId++, description: 'یادداشت مدیر', position, type, snippet: code }
}

function serve(...rows: Snippet[]) {
  api.getSnippets.mockResolvedValue(rows)
}

async function markup(position: Slot): Promise<string> {
  return renderToStaticMarkup(await Snippets({ position }))
}

async function zoneMarkup(position: 'top' | 'bottom'): Promise<string> {
  return renderToStaticMarkup(await SnippetHtmlZone({ position }))
}

/** Parsed into a detached element: scripts inserted through innerHTML never run. */
function parse(html: string): HTMLElement {
  const container = document.createElement('div')
  container.innerHTML = html
  return container
}

async function nodes(position: Slot): Promise<HTMLElement> {
  return parse(await markup(position))
}

let warn: MockInstance<typeof console.warn>

beforeEach(() => {
  warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
  api.getSnippets.mockReset()
})

describe('<Snippets>', () => {
  it('renders a <script> for an inline snippet and drops the HTML comment', async () => {
    serve(
      snippet(
        'in_head',
        'script',
        '<!-- نمونه اسنیپت تحلیلی -->\n<script>window.dataLayer=window.dataLayer||[];</script>',
      ),
    )
    const html = await markup('in_head')
    expect(html).toBe('<script>window.dataLayer=window.dataLayer||[];</script>')
  })

  it('renders only the snippets of the requested position', async () => {
    serve(
      snippet('bottom_of_body', 'script', '<script>bottom()</script>'),
      snippet('in_head', 'script', '<script>head()</script>'),
      snippet('top_of_body', 'script', '<script>top()</script>'),
    )
    expect(await markup('in_head')).toBe('<script>head()</script>')
    expect(await markup('top_of_body')).toBe('<script>top()</script>')
    expect(await markup('bottom_of_body')).toBe('<script>bottom()</script>')
  })

  it('renders outside_of_body snippets with bottom_of_body, in API order', async () => {
    serve(
      snippet('bottom_of_body', 'script', '<script>first()</script>'),
      snippet('bottom_of_body', 'style', '<style>.a{}</style>'),
      snippet('outside_of_body', 'script', '<script>last()</script>'),
    )
    expect(await markup('bottom_of_body')).toBe(
      '<script>first()</script><style>.a{}</style><script>last()</script>',
    )
  })

  it('renders external scripts with their attributes, honouring async and defer', async () => {
    serve(
      snippet(
        'in_head',
        'script',
        '<script async src="https://www.googletagmanager.com/gtag/js?id=G-1" crossorigin="anonymous" data-site="7"></script>' +
          '<script defer src="https://cdn.example.com/a.js" referrerpolicy="origin"></script>' +
          '<script src="https://cdn.example.com/b.js"></script>',
      ),
    )
    const scripts = [...(await nodes('in_head')).querySelectorAll('script')]
    const bySrc = (src: string) => scripts.find((script) => script.getAttribute('src') === src)

    const gtag = bySrc('https://www.googletagmanager.com/gtag/js?id=G-1')
    expect(gtag?.hasAttribute('async')).toBe(true)
    expect(gtag?.getAttribute('crossorigin')).toBe('anonymous')
    expect(gtag?.getAttribute('data-site')).toBe('7')

    const deferred = bySrc('https://cdn.example.com/a.js')
    expect(deferred?.hasAttribute('defer')).toBe(true)
    expect(deferred?.hasAttribute('async')).toBe(false)
    expect(deferred?.getAttribute('referrerpolicy')).toBe('origin')

    const plain = bySrc('https://cdn.example.com/b.js')
    expect(plain?.hasAttribute('async')).toBe(false)
    expect(plain?.hasAttribute('defer')).toBe(false)
    expect(scripts).toHaveLength(3)
  })

  it('wraps a snippet that is not HTML by its type', async () => {
    serve(
      snippet('in_head', 'script', '  window.shop = { id: 1 }  '),
      snippet('in_head', 'style', 'body { margin: 0 }'),
    )
    expect(await markup('in_head')).toBe(
      '<script>window.shop = { id: 1 }</script><style>body { margin: 0 }</style>',
    )
  })

  it('skips meta, link and unknown snippets that are not HTML, warning once per snippet', async () => {
    const meta = snippet('in_head', 'meta', 'name=robots content=noindex')
    const link = snippet('in_head', 'link', 'https://cdn.example.com/a.css')
    const odd = snippet('in_head', 'json', '{"a":1}')
    serve(meta, link, odd)
    expect(await markup('in_head')).toBe('')
    expect(await markup('in_head')).toBe('')

    expect(warn).toHaveBeenCalledTimes(3)
    expect(warn.mock.calls.map(([message]) => String(message))).toEqual([
      expect.stringContaining(`snippet ${meta.id}`),
      expect.stringContaining(`snippet ${link.id}`),
      expect.stringContaining(`snippet ${odd.id}`),
    ])
    // Never the operator's code itself.
    expect(JSON.stringify(warn.mock.calls)).not.toContain('noindex')
  })

  it('renders style, noscript, meta and link nodes', async () => {
    serve(
      snippet(
        'in_head',
        'meta',
        '<meta name="google-site-verification" content="abc">' +
          '<meta http-equiv="x-ua-compatible" content="ie=edge">' +
          '<link rel="preconnect" href="https://cdn.example.com" crossorigin>' +
          '<style>.badge{display:block}</style>' +
          '<noscript><img src="https://px.example.com/p.gif" alt=""></noscript>',
      ),
    )
    const fragment = await nodes('in_head')
    expect(fragment.querySelector('meta[name="google-site-verification"]')).toHaveAttribute(
      'content',
      'abc',
    )
    expect(fragment.querySelector('meta[http-equiv="x-ua-compatible"]')).toHaveAttribute(
      'content',
      'ie=edge',
    )
    const link = fragment.querySelector('link[rel="preconnect"]')
    expect(link).toHaveAttribute('href', 'https://cdn.example.com')
    expect(link).toHaveAttribute('crossorigin')
    expect(fragment.querySelector('style')?.textContent).toBe('.badge{display:block}')
    expect(fragment.querySelector('noscript')?.innerHTML).toContain('px.example.com/p.gif')
  })

  it('renders top_of_body HTML visibly in the top zone; the slot keeps the scripts', async () => {
    serve(snippet('top_of_body', 'script', '<div id="chat-root"></div><script>chat()</script>'))
    expect(await markup('top_of_body')).toBe('<script>chat()</script>')

    const zone = parse(await zoneMarkup('top')).querySelector('[data-snippet-zone="top"]')
    expect(zone?.querySelector('#chat-root')).not.toBeNull()
    expect(zone?.closest('[hidden]')).toBeNull()
    expect(zone?.querySelector('[hidden]')).toBeNull()
  })

  it('collects bottom_of_body and outside_of_body HTML in a visible, centred bottom zone', async () => {
    const seal =
      '<a referrerpolicy="origin" target="_blank" href="https://trustseal.enamad.ir/?id=1&Code=x">' +
      '<img referrerpolicy="origin" src="https://trustseal.enamad.ir/logo.aspx?id=1" alt="" id="enamad-seal"></a>'
    serve(
      snippet('bottom_of_body', 'script', seal),
      snippet('outside_of_body', 'script', '<span id="other-badge">نشان</span>'),
    )
    // HTML has no place in the script slot.
    expect(await markup('bottom_of_body')).toBe('')

    const zone = parse(await zoneMarkup('bottom')).querySelector('[data-snippet-zone="bottom"]')
    expect(zone).not.toBeNull()
    expect(zone?.className).toContain('justify-center')
    expect(zone?.querySelector('[hidden]')).toBeNull()
    expect(
      zone?.querySelector('a[href^="https://trustseal.enamad.ir/"] img#enamad-seal'),
    ).not.toBeNull()
    // API order: bottom_of_body, then outside_of_body.
    expect(zone?.innerHTML.indexOf('enamad-seal')).toBeLessThan(
      zone?.innerHTML.indexOf('other-badge') ?? -1,
    )
  })

  it('renders no zone when there is no HTML', async () => {
    serve(
      snippet('top_of_body', 'script', '<script>top()</script>'),
      snippet('bottom_of_body', 'script', '<script>bottom()</script>'),
    )
    expect(await zoneMarkup('top')).toBe('')
    expect(await zoneMarkup('bottom')).toBe('')
  })

  it('skips loose HTML in the head with a warning', async () => {
    const row = snippet('in_head', 'script', '<div>بنر</div><script>head()</script>')
    serve(row)
    expect(await markup('in_head')).toBe('<script>head()</script>')
    expect(warn).toHaveBeenCalledTimes(1)
    expect(String(warn.mock.calls[0]?.[0])).toContain(`snippet ${row.id}`)
  })

  it('drops attributes React cannot render from markup and keeps the rest', async () => {
    const row = snippet(
      'bottom_of_body',
      'script',
      '<script src="https://cdn.example.com/w.js" class="widget" onload="init()" style="x" key="k" ref="r" id="w"></script>',
    )
    serve(row)
    const script = (await nodes('bottom_of_body')).querySelector('script')
    expect(script).toHaveAttribute('src', 'https://cdn.example.com/w.js')
    expect(script).toHaveAttribute('class', 'widget')
    expect(script).toHaveAttribute('id', 'w')
    for (const name of ['onload', 'style', 'key', 'ref']) expect(script).not.toHaveAttribute(name)

    // One warning naming the snippet and the attributes, never their values.
    await markup('bottom_of_body')
    expect(warn).toHaveBeenCalledTimes(1)
    const message = String(warn.mock.calls[0]?.[0])
    expect(message).toContain(`snippet ${row.id}`)
    expect(message).toContain('onload, style, key, ref')
    expect(message).not.toContain('init()')
  })

  it('ignores unknown positions and renders nothing without snippets', async () => {
    serve(snippet('footer', 'script', '<script>nowhere()</script>'))
    for (const slot of ['in_head', 'top_of_body', 'bottom_of_body'] as const) {
      expect(await markup(slot)).toBe('')
    }
    expect(await zoneMarkup('bottom')).toBe('')
    serve()
    expect(await markup('bottom_of_body')).toBe('')
  })
})
