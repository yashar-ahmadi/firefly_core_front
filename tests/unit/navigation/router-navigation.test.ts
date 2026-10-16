import { afterEach, describe, expect, it, vi } from 'vitest'
import { onRouterTransitionStart } from '@/instrumentation-client'
import { ROUTER_NAVIGATION_START } from '@/lib/navigation/router-navigation'

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
