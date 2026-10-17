import { act, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '@/lib/api/errors'
import { announceRouterNavigation } from '@/lib/navigation/router-navigation'
import { focusedElement } from '../support/dom-stubs'
import { BASE_PATH, listPage, renderLoadMore } from './load-more-support'
import { go, navigation, resetNavigation, useRealScheduling } from './navigation-harness'

const bff = vi.hoisted(() => ({ fetch: vi.fn() }))
vi.mock('@/lib/api/client', () => ({ bffFetch: bff.fetch }))
vi.mock('next/navigation', async () => (await import('./navigation-harness')).navigationMock)

/** A BFF request that answers when the test says, recording its abort signal. */
function heldRequest() {
  const held: { signal: AbortSignal | null; answer: (page: number) => void } = {
    signal: null,
    answer: () => {},
  }
  bff.fetch.mockImplementation(
    (_path: string, { signal }: { signal: AbortSignal }) =>
      new Promise((resolve) => {
        held.signal = signal
        held.answer = (page) => resolve({ data: listPage([4, 5], page), msg: '', status: 200 })
      }),
  )
  return held
}

const loadMoreButton = () => screen.getByRole('button', { name: 'نمایش بیشتر' })
const nextPageLink = () => screen.getByRole('link', { name: 'صفحه بعدی' })

let replaceState: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  bff.fetch.mockReset()
  resetNavigation()
  replaceState = vi.spyOn(window.history, 'replaceState')
})

afterEach(() => {
  replaceState.mockRestore()
})

describe('LoadMore yields to a navigation', () => {
  useRealScheduling()

  it('aborts its request when a filter or sort change starts; nothing is appended or recorded', async () => {
    const held = heldRequest()
    renderLoadMore()
    loadMoreButton().click()
    await waitFor(() => expect(held.signal).not.toBeNull())
    screen.getByRole('button', { name: 'ارزان‌ترین' }).click()
    await waitFor(() => expect(held.signal?.aborted).toBe(true))
    held.answer(2)
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(replaceState).not.toHaveBeenCalled()
    expect(screen.queryByRole('list', { name: 'صفحهٔ ۲' })).toBeNull()
    expect(navigation.replace).toHaveBeenCalledWith(`${BASE_PATH}?brand=apple&sort=price-asc`, {
      scroll: false,
    })
  })

  it('does not start while new results are on the way', async () => {
    renderLoadMore()
    screen.getByRole('button', { name: 'ارزان‌ترین' }).click()
    await waitFor(() => expect(loadMoreButton()).toBeDisabled())
    loadMoreButton().click()
    expect(bff.fetch).not.toHaveBeenCalled()
  })
})

describe('LoadMore and the page links', () => {
  // Keep jsdom from following the link: on window, after the listeners on document have seen
  // the click as not cancelled (a cancelled click does not leave the page).
  const stopNavigation = (event: Event) => event.preventDefault()
  beforeEach(() => window.addEventListener('click', stopNavigation))
  afterEach(() => window.removeEventListener('click', stopNavigation))

  /** A link elsewhere on the page (the header, a card), outside the listing. */
  function linkTo(href: string, attributes: Record<string, string> = {}) {
    const link = document.createElement('a')
    link.href = href
    link.textContent = 'پیوند'
    for (const [name, value] of Object.entries(attributes)) link.setAttribute(name, value)
    document.body.append(link)
    return link
  }

  afterEach(() => {
    for (const link of document.querySelectorAll('body > a')) link.remove()
  })

  it('a click on any same-origin link on the page aborts a request in flight', async () => {
    const held = heldRequest()
    const user = renderLoadMore()
    await user.click(loadMoreButton())
    fireEvent.click(linkTo('/brand/apple/').appendChild(document.createElement('span')))
    expect(held.signal?.aborted).toBe(true)
    await act(async () => held.answer(2))
    expect(replaceState).not.toHaveBeenCalled()
    expect(screen.queryByRole('list', { name: 'صفحهٔ ۲' })).toBeNull()
  })

  it('ignores clicks that do not leave this tab for this shop', async () => {
    const held = heldRequest()
    const user = renderLoadMore()
    await user.click(loadMoreButton())
    const link = linkTo('/brand/apple/')
    fireEvent.click(link, { ctrlKey: true })
    fireEvent.click(link, { metaKey: true })
    fireEvent.click(link, { shiftKey: true })
    fireEvent.click(link, { altKey: true })
    fireEvent.click(link, { button: 1 })
    fireEvent.click(linkTo('/brand/apple/', { target: '_blank' }))
    fireEvent.click(linkTo('/media/catalog.pdf', { download: '' }))
    fireEvent.click(linkTo('https://other.example/'))
    fireEvent.click(document.body)
    expect(held.signal?.aborted).toBe(false)
    await act(async () => held.answer(2))
    expect(await screen.findByRole('list', { name: 'صفحهٔ ۲' })).toBeInTheDocument()
  })

  it('a page link click aborts a request in flight', async () => {
    const held = heldRequest()
    const user = renderLoadMore()
    await user.click(loadMoreButton())
    fireEvent.click(nextPageLink())
    expect(held.signal?.aborted).toBe(true)
    await act(async () => held.answer(2))
    expect(replaceState).not.toHaveBeenCalled()
    expect(screen.queryByRole('list', { name: 'صفحهٔ ۲' })).toBeNull()
  })

  it('starts over when the URL moves to a page it did not set (a link back to page 1)', async () => {
    bff.fetch.mockResolvedValue({ data: listPage([4], 2), msg: '', status: 200 })
    const user = renderLoadMore()
    await user.click(loadMoreButton())
    await screen.findByRole('list', { name: 'صفحهٔ ۲' })
    // Next syncs the replaceState into the router: the page it set, so nothing changes.
    act(() => go('brand=apple&page=2'))
    expect(screen.getByRole('list', { name: 'صفحهٔ ۲' })).toBeInTheDocument()
    // A link to page 1 of the same query keeps the component mounted: it starts over.
    act(() => go('brand=apple'))
    expect(screen.queryByRole('list', { name: 'صفحهٔ ۲' })).toBeNull()
    const pager = screen.getByRole('navigation', { name: 'صفحه‌بندی' })
    expect(within(pager).getByRole('link', { name: 'صفحه ۱' })).toHaveAttribute(
      'aria-current',
      'page',
    )
  })

  it('moves focus to the results heading when the list turns out to have ended', async () => {
    bff.fetch.mockRejectedValue(new ApiError({ status: 404, code: 'not_found' }))
    const user = renderLoadMore({ page: 2 })
    await user.click(loadMoreButton())
    await waitFor(() => expect(screen.queryByRole('button', { name: 'نمایش بیشتر' })).toBeNull())
    expect(focusedElement()).toBe(screen.getByRole('heading', { name: 'کالاها' }))
    expect(screen.queryByRole('alert')).toBeNull()
  })
})

describe('LoadMore and router navigations', () => {
  it('aborts its request when any router navigation starts (a push from code, Back)', async () => {
    const held = heldRequest()
    const user = renderLoadMore()
    await user.click(loadMoreButton())
    act(() => announceRouterNavigation('/login/?next=%2F'))
    expect(held.signal?.aborted).toBe(true)
    await act(async () => held.answer(2))
    expect(replaceState).not.toHaveBeenCalled()
    expect(screen.queryByRole('list', { name: 'صفحهٔ ۲' })).toBeNull()
  })

  it('stays off while that navigation is pending, until the URL changes', async () => {
    bff.fetch.mockResolvedValue({ data: listPage([4], 2), msg: '', status: 200 })
    const user = renderLoadMore()
    act(() => announceRouterNavigation('/brand/apple/'))
    expect(loadMoreButton()).toBeDisabled()
    await user.click(loadMoreButton())
    expect(bff.fetch).not.toHaveBeenCalled()
    act(() => go('brand=apple&in_stock=true'))
    expect(loadMoreButton()).toBeEnabled()
  })

  it('is not held by a navigation to the URL already shown', () => {
    renderLoadMore()
    act(() => announceRouterNavigation(`/?brand=apple`))
    expect(loadMoreButton()).toBeEnabled()
  })

  it('gives up waiting for a navigation that never lands here', () => {
    vi.useFakeTimers()
    try {
      renderLoadMore()
      act(() => announceRouterNavigation('/brand/apple/'))
      expect(loadMoreButton()).toBeDisabled()
      act(() => vi.advanceTimersByTime(10_000))
      expect(loadMoreButton()).toBeEnabled()
    } finally {
      vi.useRealTimers()
    }
  })
})
