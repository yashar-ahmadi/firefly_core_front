import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderSnippetHtmlZone, SnippetHtmlZone, Snippets } from '@/features/settings/snippets'
import type { Snippet } from '@/lib/api/types/settings'

// The operator's code (analytics, chat widgets, trust seals) runs only on the pages the proxy
// marked as ordinary pages (`x-ff-route-kind: page`): never on a page whose URL holds a payment
// link's token or a payment's uuid (order digest §1.3: they are bearer credentials, and a script
// there would send the full URL to a third party), and never on a request the proxy did not mark
// (fail closed). Visible HTML zones go too: their markup is unsanitised operator HTML.

vi.mock('server-only', () => ({}))
const state = vi.hoisted(() => ({ kind: null as string | null, snippets: [] as Snippet[] }))
vi.mock('next/headers', () => ({
  headers: async () => new Headers(state.kind ? { 'x-ff-route-kind': state.kind } : {}),
}))
vi.mock('@/features/settings/api', () => ({ getSnippets: async () => state.snippets }))

const ROWS: Snippet[] = [
  { id: 1, description: '', position: 'in_head', type: 'script', snippet: 'window.ga=1' },
  { id: 2, description: '', position: 'top_of_body', type: 'script', snippet: '<p>بالای صفحه</p>' },
  {
    id: 3,
    description: '',
    position: 'bottom_of_body',
    type: 'script',
    snippet: '<img src="https://seal.example/x.png" alt="نماد"><script>seal()</script>',
  },
]

async function everything(): Promise<string> {
  const parts = await Promise.all([
    Snippets({ position: 'in_head' }),
    Snippets({ position: 'top_of_body' }),
    Snippets({ position: 'bottom_of_body' }),
    SnippetHtmlZone({ position: 'top' }),
    renderSnippetHtmlZone('bottom'),
  ])
  return parts.map((part) => renderToStaticMarkup(<>{part}</>)).join('')
}

beforeEach(() => {
  state.snippets = ROWS
})

describe('operator code and the route kind', () => {
  it('renders on a page the proxy marked as a page', async () => {
    state.kind = 'page'
    const html = await everything()
    expect(html).toContain('window.ga=1')
    expect(html).toContain('seal()')
    expect(html).toContain('بالای صفحه')
    expect(html).toContain('seal.example')
  })

  it.each([
    ['a payment page', 'credential'],
    ['an unmarked request', null],
    ['an unknown marker', 'CREDENTIAL'],
  ])('renders nothing at all on %s', async (_, kind) => {
    state.kind = kind
    expect(await everything()).toBe('')
    expect(await renderSnippetHtmlZone('bottom')).toBeNull()
  })
})
