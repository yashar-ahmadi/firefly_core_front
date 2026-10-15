import { describe, expect, it } from 'vitest'
import { parseSnippet } from '@/lib/snippets/parse'

// The two dev snippets: the content.md/seo-cache-deploy.md fixture and the live extra-snippets rows.
const GA =
  '<!-- نمونه اسنیپت تحلیلی؛ شناسه واقعی جایگزین شود -->\n<script>window.dataLayer=window.dataLayer||[];</script>'
const ENAMAD =
  "<!-- نمونه اسنیپت نماد اعتماد -->\n<script>console.log('enamad placeholder');</script>"

describe('parseSnippet fixtures', () => {
  it('returns one inline script for the analytics snippet, comment dropped', () => {
    expect(parseSnippet(GA)).toEqual([
      { tag: 'script', inline: 'window.dataLayer=window.dataLayer||[];', attrs: {} },
    ])
  })

  it('returns one inline script for the trust-badge snippet, comment dropped', () => {
    expect(parseSnippet(ENAMAD)).toEqual([
      { tag: 'script', inline: "console.log('enamad placeholder');", attrs: {} },
    ])
  })
})

describe('parseSnippet scripts', () => {
  it('reads src and keeps boolean attributes as empty strings', () => {
    expect(parseSnippet('<script async src="https://x/y.js"></script>')).toEqual([
      { tag: 'script', src: 'https://x/y.js', attrs: { async: '', src: 'https://x/y.js' } },
    ])
  })

  it('lower-cases names, accepts all quoting styles and decodes entities in values', () => {
    const [node] = parseSnippet(
      '<SCRIPT Async SRC=\'a.js?x=1&amp;y=2\' data-Id=7 type="module" data-q=&quot;&#39;&#x27;></SCRIPT>',
    )
    expect(node).toEqual({
      tag: 'script',
      src: 'a.js?x=1&y=2',
      attrs: { async: '', src: 'a.js?x=1&y=2', 'data-id': '7', type: 'module', 'data-q': "\"''" },
    })
  })

  it('keeps the first of a duplicated attribute', () => {
    const [node] = parseSnippet('<script src="a.js" src="b.js"></script>')
    expect(node).toMatchObject({ src: 'a.js' })
  })

  it('does not look inside script text for tags, and accepts a spaced uppercase end tag', () => {
    const code = "if (a < b) { document.write('<div></div>'); }"
    expect(parseSnippet(`<script>${code}</SCRIPT >`)).toEqual([
      { tag: 'script', inline: code, attrs: {} },
    ])
  })

  it('treats an unterminated script as running to the end', () => {
    expect(parseSnippet('<script>foo()')).toEqual([{ tag: 'script', inline: 'foo()', attrs: {} }])
  })

  it('ignores the body of a script that has a src, as browsers do', () => {
    const [node] = parseSnippet('<script src="a.js">ignored()</script>')
    expect(node).not.toHaveProperty('inline')
  })

  it('keeps a comment inside a script as code', () => {
    const [node] = parseSnippet('<script>/* a */ <!-- b --> c()</script>')
    expect(node).toMatchObject({ inline: '/* a */ <!-- b --> c()' })
  })

  it('does not take tags that merely start with "script" for scripts', () => {
    expect(parseSnippet('<scripty a="1">x</scripty>')).toEqual([
      { tag: 'html', inline: '<scripty a="1">x</scripty>' },
    ])
  })
})

describe('parseSnippet other recognised tags', () => {
  it('reads noscript and style bodies verbatim', () => {
    const pixel = '<img height="1" width="1" src="https://px/?id=1&a=2">'
    expect(parseSnippet(`<noscript>${pixel}</noscript><style>.a{color:red}</style>`)).toEqual([
      { tag: 'noscript', inline: pixel },
      { tag: 'style', inline: '.a{color:red}' },
    ])
  })

  it('reads void meta and link tags, with or without a self-closing slash', () => {
    expect(
      parseSnippet(
        '<meta name="theme-color" content="#fff" /><link rel="preconnect" href="https://a" crossorigin>',
      ),
    ).toEqual([
      { tag: 'meta', attrs: { name: 'theme-color', content: '#fff' } },
      { tag: 'link', attrs: { rel: 'preconnect', href: 'https://a', crossorigin: '' } },
    ])
  })

  it('finds the end of a tag past a ">" inside a quoted value', () => {
    expect(parseSnippet('<meta content="a>b" name=x>')).toEqual([
      { tag: 'meta', attrs: { content: 'a>b', name: 'x' } },
    ])
  })

  it('keeps document order across tag kinds', () => {
    const tags = parseSnippet(
      '<link rel="stylesheet" href="/a.css"><script>1</script><noscript>n</noscript>',
    )
    expect(tags.map((n) => n.tag)).toEqual(['link', 'script', 'noscript'])
  })
})

describe('parseSnippet comments and everything else', () => {
  it('drops comments between nodes, and an unterminated comment swallows the rest', () => {
    expect(
      parseSnippet('<!-- a --><script>1</script><!--\nb\n--><meta name="m"><!-- open'),
    ).toEqual([
      { tag: 'script', inline: '1', attrs: {} },
      { tag: 'meta', attrs: { name: 'm' } },
    ])
  })

  it('turns text and other elements into html, one node per run', () => {
    expect(
      parseSnippet('<p>a</p> text <script>b</script><div id="x"><span>c</span></div>'),
    ).toEqual([
      { tag: 'html', inline: '<p>a</p> text' },
      { tag: 'script', inline: 'b', attrs: {} },
      { tag: 'html', inline: '<div id="x"><span>c</span></div>' },
    ])
  })

  it('keeps a script nested in another element inside that html node', () => {
    const html = '<div><script>a()</script></div>'
    expect(parseSnippet(html)).toEqual([{ tag: 'html', inline: html }])
  })

  it('matches nested elements of the same name to their own end tag', () => {
    expect(parseSnippet('<div><div>x</div></div><script>1</script>').map((n) => n.tag)).toEqual([
      'html',
      'script',
    ])
  })

  it('does not swallow what follows a void or self-closing element', () => {
    expect(parseSnippet('<img src="a"><br/><custom-tag x="1"/><script>1</script>')).toEqual([
      { tag: 'html', inline: '<img src="a"><br/><custom-tag x="1"/>' },
      { tag: 'script', inline: '1', attrs: {} },
    ])
  })

  it('keeps a stray "<" and end tags as text instead of failing', () => {
    expect(parseSnippet('a < b </i> <3')).toEqual([{ tag: 'html', inline: 'a < b </i> <3' }])
  })

  it('returns nothing for empty, blank or non-string input', () => {
    expect(parseSnippet('')).toEqual([])
    expect(parseSnippet('  \n ')).toEqual([])
    expect(parseSnippet(undefined as unknown as string)).toEqual([])
  })
})
