import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { renderSnippetNode, snippetNodes } from '@/features/settings/snippet-nodes'
import type { Snippet } from '@/lib/api/types/settings'

// A bare snippet (not starting with '<') is wrapped in <script> or <style> as raw text. The HTML
// parser ends that element at the first `</script` (`</style`), whatever the case, so such text
// must be escaped or the rest of the snippet would land in the page as markup.

let nextId = 1
function bare(type: 'script' | 'style', code: string): Snippet {
  return { id: nextId++, description: '', position: 'top_of_body', type, snippet: code }
}

/** The snippet as the browser parses it, followed by the rest of the page (`<p id="after">`). */
function parsed(snippet: Snippet): HTMLElement {
  const html = renderToStaticMarkup(
    snippetNodes(snippet, 'body').map((node, index) => renderSnippetNode(node, String(index))),
  )
  const page = `<!doctype html><body>${html}<p id="after">صفحه</p>`
  return new DOMParser().parseFromString(page, 'text/html').body
}

/** Exactly the wrapper, then the rest of the page as markup. */
function expectContained(body: HTMLElement, tag: 'SCRIPT' | 'STYLE') {
  expect([...body.children].map((element) => element.tagName)).toEqual([tag, 'P'])
  expect(body.lastElementChild?.id).toBe('after')
}

describe('bare script snippets', () => {
  it('cannot close their <script> wrapper early, in any letter case', () => {
    const code =
      "window.a = '</script><img src=x onerror=alert(1)>'; window.b = '</SCRIPT >'; window.c = 1"
    const body = parsed(bare('script', code))
    expectContained(body, 'SCRIPT')
    expect(body.querySelector('img')).toBeNull()
    expect(body.firstElementChild?.textContent).toContain('<\\/script>')
    expect(body.firstElementChild?.textContent).toContain('<\\/SCRIPT >')
  })

  it('cannot swallow the rest of the page through `<!--` and `<script`', () => {
    const body = parsed(bare('script', "document.write('<!--<script>')"))
    // After the snippet the page goes on: the parser left the script element at its end tag.
    expectContained(body, 'SCRIPT')
    expect(body.firstElementChild?.textContent).toBe("document.write('\\x3C!--<script>')")
  })

  it('keeps the meaning of strings, regular expressions and comments', () => {
    const code = [
      "out.str = '</script> <!-- x'",
      'out.tpl = `</Script>`',
      'out.re = /<!--|<\\/script>/i.test("</script>") // </script> <!--',
    ].join('\n')
    const [node] = snippetNodes(bare('script', code), 'body')
    const escaped = node && 'inline' in node ? (node.inline ?? '') : ''
    expect(escaped).not.toMatch(/<\/script|<!--/i)
    const out: Record<string, unknown> = {}
    new Function('out', escaped)(out)
    expect(out).toEqual({ str: '</script> <!-- x', tpl: '</Script>', re: true })
  })

  it('leaves ordinary code untouched', () => {
    const code = 'window.dataLayer = window.dataLayer || []; if (a < b) go()'
    expect(snippetNodes(bare('script', code), 'body')).toEqual([
      { tag: 'script', inline: code, attrs: {} },
    ])
  })
})

describe('bare style snippets', () => {
  it('cannot close their <style> wrapper early', () => {
    const body = parsed(bare('style', 'body::after { content: "</STYLE><b>x</b>" }'))
    expectContained(body, 'STYLE')
    expect(body.querySelector('b')).toBeNull()
    expect(body.firstElementChild?.textContent).toBe(
      'body::after { content: "<\\/STYLE><b>x</b>" }',
    )
  })
})
