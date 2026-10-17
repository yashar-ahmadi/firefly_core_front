import { act, fireEvent, render } from '@testing-library/react'
import { startTransition, Suspense, use, useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NavigationProgress } from '@/components/layout/navigation-progress'
import { onRouterTransitionStart } from '@/instrumentation-client'
import { announceRouterNavigation } from '@/lib/navigation/router-navigation'

const route = vi.hoisted(() => ({ pathname: '/', search: '' }))

vi.mock('next/navigation', () => ({
  usePathname: () => route.pathname,
  useSearchParams: () => new URLSearchParams(route.search),
}))

const LINKS = [
  '<a href="/brand/apple/">اپل</a>',
  '<a href="https://elsewhere.test/">بیرون</a>',
  '<a href="/compare/" data-opens-dialog="">مقایسه</a>',
  '<a href="/">خانه</a>',
].join('')

/**
 * A click as the browser dispatches it, with jsdom kept from following the link: the stop runs
 * on window, after every listener on document has seen the click as it was.
 */
function click(element: Element, init?: MouseEventInit) {
  const stop = (event: Event) => event.preventDefault()
  window.addEventListener('click', stop)
  try {
    fireEvent.click(element, init)
  } finally {
    window.removeEventListener('click', stop)
  }
}

function setup() {
  const view = render(
    <>
      <NavigationProgress />
      <main id="main" dangerouslySetInnerHTML={{ __html: LINKS }} />
    </>,
  )
  const bar = () => view.container.querySelector<HTMLElement>('[data-phase]')
  const main = () => view.container.querySelector('main') as HTMLElement
  const navigateTo = (pathname: string, search = '') => {
    route.pathname = pathname
    route.search = search
    view.rerender(
      <>
        <NavigationProgress />
        <main id="main" />
      </>,
    )
  }
  return { ...view, bar, main, navigateTo }
}

beforeEach(() => {
  route.pathname = '/'
  route.search = ''
  vi.useFakeTimers()
})

afterEach(() => vi.useRealTimers())

describe('NavigationProgress', () => {
  it('is a decorative, empty strip while nothing is loading', () => {
    const { container, bar } = setup()
    const strip = container.querySelector('[data-navigation-progress]')
    expect(strip).toHaveAttribute('aria-hidden', 'true')
    expect(bar()).toBeNull()
  })

  it('starts on a router navigation to another URL and marks main busy', () => {
    const { bar, main } = setup()
    act(() => announceRouterNavigation('/product/x/'))
    expect(bar()).toHaveAttribute('data-phase', 'loading')
    expect(main()).toHaveAttribute('aria-busy', 'true')
  })

  it('shows at once although the router announces it inside its own navigation transition', async () => {
    // Next calls onRouterTransitionStart inside the startTransition of the navigation, which
    // stays pending (the old page on screen) until the new page arrives.
    const arriving = new Promise<never>(() => {})
    function Page({ next }: { next: boolean }) {
      if (next) use(arriving)
      return null
    }
    let navigate = () => {}
    function Router() {
      const [next, setNext] = useState(false)
      navigate = () =>
        startTransition(() => {
          onRouterTransitionStart('/product/x/')
          setNext(true)
        })
      return (
        <Suspense fallback={null}>
          <Page next={next} />
        </Suspense>
      )
    }
    const view = render(
      <>
        <NavigationProgress />
        <main id="main" />
        <Router />
      </>,
    )
    await act(async () => navigate())
    expect(view.container.querySelector('[data-phase]')).toHaveAttribute('data-phase', 'loading')
    expect(view.container.querySelector('main')).toHaveAttribute('aria-busy', 'true')
  })

  it('ignores a navigation to the URL on screen', () => {
    route.pathname = '/product-category/\u{06AF}\u{0648}\u{0634}\u{06CC}/'
    const { bar } = setup()
    act(() => announceRouterNavigation('/product-category/%DA%AF%D9%88%D8%B4%DB%8C/'))
    expect(bar()).toBeNull()
  })

  it('starts on an unmodified click on a same-origin link, before the router', () => {
    const { bar, getByText } = setup()
    click(getByText('اپل'))
    expect(bar()).toHaveAttribute('data-phase', 'loading')
  })

  it('does not start on a click that a handler of the link cancels (it opens something instead)', () => {
    const view = render(
      <>
        <NavigationProgress />
        <main id="main">
          <a href="/cart/" onClick={(event) => event.preventDefault()}>
            سبد خرید
          </a>
          <a href="/checkout/">تسویه</a>
        </main>
      </>,
    )
    const bar = () => view.container.querySelector('[data-phase]')
    click(view.getByText('سبد خرید'))
    expect(bar()).toBeNull()
    expect(view.container.querySelector('main')).not.toHaveAttribute('aria-busy')

    // A native handler on the link counts the same.
    const checkout = view.getByText('تسویه')
    checkout.addEventListener('click', (event) => event.preventDefault())
    click(checkout)
    expect(bar()).toBeNull()
  })

  it.each([
    ['a modified click', 'اپل', { ctrlKey: true }],
    ['a middle click', 'اپل', { button: 1 }],
    ['another origin', 'بیرون', {}],
    ['a link that opens a dialog', 'مقایسه', {}],
    ['a link to this page', 'خانه', {}],
  ])('does not start on %s', (_label, text, init) => {
    const { bar, getByText } = setup()
    click(getByText(text), init)
    expect(bar()).toBeNull()
  })

  it('counts a click and the router signal of the same navigation once', () => {
    const { bar, getByText } = setup()
    click(getByText('اپل'))
    const first = bar()
    act(() => announceRouterNavigation('/brand/apple/'))
    expect(bar()).toBe(first)
  })

  it.each([
    ['the path', '/brand/apple/', ''],
    ['the query', '/', 'page=2'],
  ])('completes when %s changes, then clears', (_label, pathname, search) => {
    const { bar, main, navigateTo } = setup()
    act(() => announceRouterNavigation(`${pathname}${search ? `?${search}` : ''}`))
    navigateTo(pathname, search)
    expect(bar()).toHaveAttribute('data-phase', 'done')
    expect(main()).not.toHaveAttribute('aria-busy')
    act(() => vi.advanceTimersByTime(300))
    expect(bar()).toBeNull()
  })

  it('gives up after 10 seconds when the page never changes', () => {
    const { bar, main } = setup()
    act(() => announceRouterNavigation('/product/x/'))
    act(() => vi.advanceTimersByTime(9_999))
    expect(bar()).not.toBeNull()
    act(() => vi.advanceTimersByTime(1))
    expect(bar()).toBeNull()
    expect(main()).not.toHaveAttribute('aria-busy')
  })

  it('animates only without reduced motion: otherwise a static bar that never fades', () => {
    const { bar, navigateTo } = setup()
    act(() => announceRouterNavigation('/product/x/'))
    // The base style is a full-width bar; the growth exists only under `motion-safe:`.
    expect(bar()?.className).toContain('motion-safe:animate-nav-progress')
    expect(bar()?.className).not.toMatch(/(^|\s)animate-/)
    navigateTo('/product/x/')
    expect(bar()?.className).toContain('motion-safe:animate-nav-progress-done')
    expect(bar()?.className).toContain('motion-reduce:hidden')
  })

  it('resets when the page comes back from the back-forward cache', () => {
    const { bar } = setup()
    act(() => announceRouterNavigation('/product/x/'))
    act(() => {
      window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }))
    })
    expect(bar()).toBeNull()
  })
})
