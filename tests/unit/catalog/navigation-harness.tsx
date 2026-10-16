import { createContext, use, useContext, useLayoutEffect, useState, type ReactNode } from 'react'
import { afterEach, beforeEach, vi } from 'vitest'

// A stand-in for the Next router in listing tests. Use it as the `next/navigation` mock:
//   vi.mock('next/navigation', async () => (await import('./navigation-harness')).navigationMock)
// Without <NavigatingRouter>, `useSearchParams()` reads `navigation.search` and `replace` does
// nothing. Inside it, `replace` behaves like Next's: the new URL is committed in the caller's
// transition, which stays pending (old UI kept, optimistic state shown) until the test calls
// `finishNavigations()` (see `useRealScheduling`). `go(search)` changes the URL at once (a
// history sync or a link).

interface UrlState {
  params: URLSearchParams
  ready: Promise<void> | null
}

const UrlContext = createContext<URLSearchParams | null>(null)

export const navigation = {
  search: '',
  replace: vi.fn<(href: string, options?: { scroll?: boolean }) => void>(),
  push: vi.fn(),
  notFound: vi.fn((): never => {
    throw new Error('NEXT_NOT_FOUND')
  }),
  pending: [] as (() => void)[],
  setUrl: null as ((state: UrlState) => void) | null,
}

export const navigationMock = {
  useRouter: () => ({ replace: navigation.replace, push: navigation.push }),
  useSearchParams: () => useContext(UrlContext) ?? new URLSearchParams(navigation.search),
  usePathname: () => '/',
  notFound: () => navigation.notFound(),
}

/**
 * Runs the tests of a `describe` outside React's act environment, where a transition that
 * suspended retries once its promise resolves, as in a browser (inside `act` the retry is
 * dropped). Trigger those navigations with native events (`element.click()`) or direct calls,
 * not user-event or fireEvent (both wrap in act), and wait with `waitFor`.
 */
export function useRealScheduling(): void {
  const scope = globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  beforeEach(() => {
    scope.IS_REACT_ACT_ENVIRONMENT = false
  })
  afterEach(() => {
    scope.IS_REACT_ACT_ENVIRONMENT = true
  })
}

/** Resets the mocks and the URL; call in `beforeEach`. */
export function resetNavigation(search = ''): void {
  navigation.search = search
  navigation.replace.mockReset()
  navigation.push.mockReset()
  navigation.notFound.mockClear()
  navigation.pending = []
  navigation.setUrl = null
}

/** Lets every pending navigation commit (wrap in `act`). */
export function finishNavigations(): void {
  for (const finish of navigation.pending.splice(0)) finish()
}

/** Changes the URL at once, like Next syncing a `history.replaceState` (wrap in `act`). */
export function go(search: string): void {
  navigation.setUrl?.({ params: new URLSearchParams(search), ready: null })
}

export function NavigatingRouter({
  initial = '',
  children,
}: {
  initial?: string
  children: ReactNode
}) {
  const [url, setUrl] = useState<UrlState>(() => ({
    params: new URLSearchParams(initial),
    ready: null,
  }))
  // Wired before any interaction; the router mock commits URLs through this component.
  useLayoutEffect(() => {
    navigation.setUrl = setUrl
    navigation.replace.mockImplementation((href) => {
      let finish = () => {}
      const ready = new Promise<void>((resolve) => (finish = resolve))
      navigation.pending.push(finish)
      setUrl({ params: new URL(href, 'https://shop.test').searchParams, ready })
    })
  }, [])
  if (url.ready) use(url.ready)
  return <UrlContext value={url.params}>{children}</UrlContext>
}
