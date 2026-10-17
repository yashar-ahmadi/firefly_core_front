import { act, fireEvent, render, renderHook, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useListUrl } from '@/features/account/lists/use-list-url'
import { ROUTER_NAVIGATION_START } from '@/lib/navigation/router-navigation'
import { spyOnHistory } from '../support/history'

// An account list's URL (`useListUrl`): the server page never reads the query, so a sort, a switch
// or a filter only rewrites the URL with the native history API, which Next keeps in step with
// `useSearchParams` (Next 16 docs, «Native History API»): no router call, no server round trip.

const mocks = vi.hoisted(() => ({ search: 'sort=b', router: { replace: vi.fn(), push: vi.fn() } }))
vi.mock('next/navigation', () => ({
  useRouter: () => mocks.router,
  usePathname: () => '/account/things/',
  useSearchParams: () => new URLSearchParams(mocks.search),
}))

interface Params {
  sort: string
  page: number
}
const parse = (search: URLSearchParams): Params => ({
  sort: search.get('sort') ?? 'a',
  page: Number(search.get('page') ?? 1),
})
const toSearch = ({ sort, page }: Params) => {
  const entries = [
    ...(sort === 'a' ? [] : [['sort', sort]]),
    ...(page > 1 ? [['page', `${page}`]] : []),
  ]
  return entries.length > 0 ? `?${new URLSearchParams(entries).toString()}` : ''
}

const useThings = () => useListUrl('/account/things/', parse, toSearch)

function Filters() {
  const url = useThings()
  return (
    <>
      <a href={url.href({ ...url.params, sort: 'c', page: 1 })} onClick={url.follow}>
        مرتب‌سازی c
      </a>
      <a href={url.href(url.params)} onClick={url.follow}>
        همین
      </a>
    </>
  )
}

let history = spyOnHistory()
/** Whether each click reached the document with its default prevented (then stopped: jsdom). */
let prevented: boolean[] = []
const record = (event: MouseEvent) => {
  prevented.push(event.defaultPrevented)
  event.preventDefault()
}

beforeEach(() => {
  mocks.search = 'sort=b'
  prevented = []
  window.history.replaceState(null, '', '/account/things/?sort=b')
  vi.clearAllMocks()
  history = spyOnHistory()
  document.addEventListener('click', record)
})

afterEach(() => {
  document.removeEventListener('click', record)
  window.history.replaceState(null, '', '/')
})

describe('useListUrl', () => {
  it('replace: the URL in place of this entry, through the native API, never the router', () => {
    const { result } = renderHook(useThings)
    expect(result.current.params).toEqual({ sort: 'b', page: 1 })
    act(() => result.current.replace({ sort: 'a', page: 2 }))
    expect(history.replaced()).toEqual(['/account/things/?page=2'])
    expect(history.pushed()).toEqual([])
    expect(mocks.router.replace).not.toHaveBeenCalled()
    expect(mocks.router.push).not.toHaveBeenCalled()
  })

  it('replace: nothing for the state already on screen', () => {
    const { result } = renderHook(useThings)
    act(() => result.current.replace({ sort: 'b', page: 1 }))
    expect(history.replaced()).toEqual([])
  })

  it('replace: nothing while the visitor is on the way to another page', () => {
    const { result } = renderHook(useThings)
    act(() => {
      window.dispatchEvent(new CustomEvent(ROUTER_NAVIGATION_START, { detail: '/product/x/' }))
    })
    act(() => result.current.replace({ sort: 'b', page: 3 }))
    expect(history.replaced()).toEqual([])
  })

  it('a filter link’s click: a new history entry for its URL, the link’s own navigation stopped', () => {
    render(<Filters />)
    fireEvent.click(screen.getByRole('link', { name: 'مرتب‌سازی c' }))
    expect(prevented).toEqual([true])
    expect(history.pushed()).toEqual(['/account/things/?sort=c'])
    expect(mocks.router.push).not.toHaveBeenCalled()
  })

  it('a click that opens a new tab is left to the browser; the link on screen adds no entry', () => {
    render(<Filters />)
    fireEvent.click(screen.getByRole('link', { name: 'مرتب‌سازی c' }), { ctrlKey: true })
    fireEvent.click(screen.getByRole('link', { name: 'مرتب‌سازی c' }), { button: 1 })
    expect(prevented).toEqual([false, false])
    fireEvent.click(screen.getByRole('link', { name: 'همین' }))
    expect(prevented).toEqual([false, false, true])
    expect(history.pushed()).toEqual([])
  })
})
