import { expect, test, type APIRequestContext } from '@playwright/test'

// The operator's code snippets (`global/extra-snippets/`) run in the page. The sample data has a
// Google Analytics placeholder in <head> (`window.dataLayer = window.dataLayer || []`) and a trust
// seal placeholder at the end of <body> (`console.log('enamad placeholder')`).

const API_URL = process.env.FIREFLY_API_URL ?? 'http://localhost:8000'
const SEAL_LOG = 'enamad placeholder'

interface SnippetRow {
  position: string
  snippet: string
}

async function snippets(request: APIRequestContext): Promise<SnippetRow[]> {
  const res = await request.get(`${API_URL}/api/v1/global/extra-snippets/?limit=100`)
  expect(res.ok(), 'snippets from the backend').toBe(true)
  return ((await res.json()) as { data: { results: SnippetRow[] } }).data.results
}

test.describe('operator snippets', () => {
  // Same page and data on every viewport: run once.
  test.beforeAll(({}, workerInfo) => {
    test.skip(workerInfo.project.name !== 'desktop', 'snippet checks run once (desktop project)')
  })

  test('the <head> snippet ran: window.dataLayer exists on the home page', async ({
    page,
    request,
  }) => {
    const rows = await snippets(request)
    const analytics = rows.some(
      (row) => row.position === 'in_head' && row.snippet.includes('window.dataLayer'),
    )
    test.skip(!analytics, 'the backend has no dataLayer snippet in <head>')

    await page.goto('/')
    const hasDataLayer = await page.evaluate(() =>
      Array.isArray((window as Window & { dataLayer?: unknown }).dataLayer),
    )
    expect(hasDataLayer).toBe(true)
  })

  test('the end-of-body snippet ran exactly once', async ({ page, request }) => {
    const rows = await snippets(request)
    const seal = rows.some(
      (row) => row.position === 'bottom_of_body' && row.snippet.includes(SEAL_LOG),
    )
    test.skip(!seal, 'the backend has no trust seal placeholder snippet')

    const logs: string[] = []
    page.on('console', (message) => logs.push(message.text()))
    await page.goto('/')
    await page.waitForLoadState('load')
    expect(logs.filter((text) => text === SEAL_LOG)).toHaveLength(1)
  })
})
