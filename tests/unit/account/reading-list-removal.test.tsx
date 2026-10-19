import { act, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SUMMARY_KEY } from '@/lib/session/viewer-queries'
import { SARA } from '../auth/fixtures'
import { stubBrowserApis } from '../support/dom-stubs'
import { summary } from './fixtures'
import { listPage, renderReadingList, savedPost } from './reading-list-support'

// A bookmark pressed on the reading list page (the cards' own, the shared toggle): the DELETE is
// answered 204 with no body (never parsed), the card leaves once it succeeded, it is said with
// «بازگردانی» (saves it again: POST), and the account's badge (the summary) is read again. Here
// the real BFF client talks to a stand-in `fetch`.

const mocks = vi.hoisted(() => ({
  notify: { success: vi.fn(), error: vi.fn(), info: vi.fn(), dismiss: vi.fn() },
}))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  usePathname: () => '/account/reading-list/',
  useSearchParams: () => new URLSearchParams(),
}))
vi.mock('@/components/ui/toaster', () => ({ notify: mocks.notify, toastRegionReady: () => true }))

const REMOVE = 'حذف از لیست مطالعه'
let saved = [1, 2, 3]
const requests: { method: string; path: string }[] = []
/** The 204's body readers: never called (DELETE answers no body). */
const bodyReads = { json: vi.fn(), text: vi.fn() }

function json(data: unknown, status = 200, msg = '') {
  return new Response(JSON.stringify({ msg, code: status, data }), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

function noContent(): Response {
  const response = new Response(null, { status: 204 })
  response.json = bodyReads.json.mockRejectedValue(new SyntaxError('no body'))
  response.text = bodyReads.text.mockResolvedValue('')
  return response
}

async function server(input: string | URL | Request, init: RequestInit = {}): Promise<Response> {
  const url = new URL(String(input), 'https://shop.test')
  const method = init.method ?? 'GET'
  const path = url.pathname.replace(/^\/api\/bff\//, '')
  requests.push({ method, path })
  if (path === 'dashboard/summary/') return json(summary({ reading_list_count: saved.length }))
  if (path === 'account/profile/me/') return json(SARA)
  if (path === 'blog/reading-list/list/') return json(listPage(saved.map((id) => savedPost(id))))
  const toggle = /^blog\/post\/post-(\d+)\/reading-list\/$/.exec(path)
  if (toggle && method === 'DELETE') {
    saved = saved.filter((id) => id !== Number(toggle[1]))
    return noContent()
  }
  if (toggle && method === 'POST') {
    saved = [Number(toggle[1]), ...saved]
    return json({ is_in_reading_list: true }, 201, 'مطلب به لیست مطالعه اضافه شد.')
  }
  return json(null, 404)
}

beforeEach(() => {
  vi.clearAllMocks()
  stubBrowserApis()
  saved = [1, 2, 3]
  requests.length = 0
  vi.stubGlobal('fetch', vi.fn(server))
})

afterEach(() => vi.unstubAllGlobals())

const card = (name: string) => screen.getByRole('link', { name }).closest('article') as HTMLElement

/** The bookmark of `name`'s card once her ids are in (pressed). */
async function bookmarkOf(name: string) {
  const button = await within(await waitFor(() => card(name))).findByRole('button', {
    name: REMOVE,
  })
  await waitFor(() => expect(button).not.toHaveAttribute('aria-disabled'))
  return button
}

describe('ReadingListPage: removing a post', () => {
  it('one DELETE (204, its body never read), the card leaves, the badge goes stale', async () => {
    const { user, client } = renderReadingList()
    // The account nav's badge (`reading_list_count`), as the shell has read it.
    client.setQueryData(SUMMARY_KEY, summary({ reading_list_count: 3 }))
    const bookmark = await bookmarkOf('مطلب ۲')
    await user.click(bookmark)
    await waitFor(() => expect(screen.queryByRole('link', { name: 'مطلب ۲' })).toBeNull())
    expect(requests.filter((request) => request.method === 'DELETE')).toEqual([
      { method: 'DELETE', path: 'blog/post/post-2/reading-list/' },
    ])
    expect(bodyReads.json).not.toHaveBeenCalled()
    expect(bodyReads.text).not.toHaveBeenCalled()
    expect(screen.getAllByRole('article')).toHaveLength(2)
    expect(mocks.notify.success).toHaveBeenCalledWith(
      '«مطلب ۲» از لیست مطالعه حذف شد.',
      expect.objectContaining({ action: expect.objectContaining({ label: 'بازگردانی' }) }),
    )
    // Read again by the nav that shows it.
    await waitFor(() => expect(client.getQueryState(SUMMARY_KEY)?.isInvalidated).toBe(true))
  })

  it('«بازگردانی» saves it again (POST) and the card comes back', async () => {
    const { user } = renderReadingList()
    await user.click(await bookmarkOf('مطلب ۱'))
    await waitFor(() => expect(screen.queryByRole('link', { name: 'مطلب ۱' })).toBeNull())
    const [, options] = mocks.notify.success.mock.calls.find(([message]) =>
      String(message).includes('حذف شد'),
    )!
    await act(async () => options.action.onClick(new MouseEvent('click')))
    expect(requests.filter((request) => request.method === 'POST')).toEqual([
      { method: 'POST', path: 'blog/post/post-1/reading-list/' },
    ])
    expect(await screen.findByRole('link', { name: 'مطلب ۱' })).toBeInTheDocument()
    expect(screen.getAllByRole('article')).toHaveLength(3)
  })
})
