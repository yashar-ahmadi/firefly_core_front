import { act, fireEvent, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { onRouterTransitionStart } from '@/instrumentation-client'
import {
  announceRouterNavigation,
  isSameOriginLinkClick,
  ROUTER_NAVIGATION_START,
  useLeavingPage,
} from '@/lib/navigation/router-navigation'

const route = vi.hoisted(() => ({ pathname: '/', search: '' }))

vi.mock('next/navigation', () => ({
  usePathname: () => route.pathname,
  useSearchParams: () => new URLSearchParams(route.search),
}))

describe('onRouterTransitionStart (instrumentation-client)', () => {
  const listener = vi.fn()
  afterEach(() => window.removeEventListener(ROUTER_NAVIGATION_START, listener))

  it('announces every App Router navigation to the page', () => {
    window.addEventListener(ROUTER_NAVIGATION_START, listener)
    onRouterTransitionStart('/brand/apple/')
    onRouterTransitionStart('/product-category/digital/')
    expect(listener.mock.calls.map(([event]) => (event as CustomEvent<string>).detail)).toEqual([
      '/brand/apple/',
      '/product-category/digital/',
    ])
  })
})

describe('useLeavingPage', () => {
  beforeEach(() => {
    route.pathname = '/'
    route.search = ''
  })

  function leavingAfter(target: string) {
    const onLeave = vi.fn()
    const { result } = renderHook(() => useLeavingPage(onLeave))
    act(() => announceRouterNavigation(target))
    return { pending: result.current, onLeave }
  }

  it('holds while a navigation to another URL is on its way', () => {
    route.pathname = '/brand/apple/'
    const { pending, onLeave } = leavingAfter('/brand/samsung/')
    expect(onLeave).toHaveBeenCalledTimes(1)
    expect(pending).toBe(true)
  })

  it('does not hold for the URL on screen spelled with its path percent-encoded', () => {
    route.pathname = '/product-category/\u{06AF}\u{0648}\u{0634}\u{06CC}/'
    route.search = 'brand=apple'
    const { pending, onLeave } = leavingAfter(
      '/product-category/%DA%AF%D9%88%D8%B4%DB%8C/?brand=apple',
    )
    expect(onLeave).toHaveBeenCalledTimes(1)
    expect(pending).toBe(false)
  })

  it('does not hold for the URL on screen with its query spelled another way', () => {
    route.pathname = '/product/list/'
    route.search = 'search=a+b&q=%DA%A9'
    expect(leavingAfter('/product/list/?search=a%20b&q=\u{06A9}').pending).toBe(false)
  })

  it('treats a different query as another URL', () => {
    route.pathname = '/product/list/'
    route.search = 'page=2'
    expect(leavingAfter('/product/list/?page=3').pending).toBe(true)
  })
})

describe('isSameOriginLinkClick', () => {
  afterEach(() => {
    for (const link of document.querySelectorAll('body > a')) link.remove()
  })

  function clickOn(href: string): boolean {
    const link = document.createElement('a')
    link.href = href
    document.body.append(link)
    let result = false
    const read = (event: MouseEvent) => {
      result = isSameOriginLinkClick(event)
      event.preventDefault()
    }
    document.addEventListener('click', read, true)
    fireEvent.click(link)
    document.removeEventListener('click', read, true)
    return result
  }

  it('counts a link to another page of the shop', () => {
    expect(clickOn('/brand/apple/')).toBe(true)
    expect(clickOn('/brand/apple/#reviews')).toBe(true)
  })

  it('does not count a jump within this page (the skip link, an in-page anchor)', () => {
    expect(clickOn('#main')).toBe(false)
    expect(clickOn(`${window.location.pathname}${window.location.search}#reviews`)).toBe(false)
  })
})
