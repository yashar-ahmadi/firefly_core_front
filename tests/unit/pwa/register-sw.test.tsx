import { render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { INSTALLABLE_EVENT, SESSION_KEY, VISITS_KEY } from '@/features/pwa/install-state'
import { REGISTER_SCRIPT, RegisterServiceWorker } from '@/features/pwa/register-sw'
import { scriptPage as page } from './script-page'

// The service worker's registration (FEATURE_PWA, production builds only): a few lines of inline
// script the root layout writes into the page, no chunk of JavaScript to download. After `load`,
// once the browser is idle, it registers `/sw.js` for the whole site, the same registration web
// push uses. It also counts the visits (one per tab session) and keeps the browser's install
// offer, which comes early, for the install prompt (install-prompt.tsx).

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('RegisterServiceWorker', () => {
  it.each([
    ['production, FEATURE_PWA on', 'production', true, 1],
    ['production, FEATURE_PWA off', 'production', false, 0],
    ['development, FEATURE_PWA on', 'development', true, 0],
    ['a test run, FEATURE_PWA on', 'test', true, 0],
  ])('%s: %#', (_, mode, enabled, scripts) => {
    vi.stubEnv('NODE_ENV', mode)
    const { container } = render(<RegisterServiceWorker enabled={enabled} />)
    expect(container.querySelectorAll('script')).toHaveLength(scripts)
    if (scripts) expect(container.querySelector('script')!.innerHTML).toBe(REGISTER_SCRIPT)
  })
})

describe('the registration script', () => {
  it('registers /sw.js for the whole site after load, once the browser is idle', () => {
    const tab = page()
    tab.run()
    expect(tab.register).not.toHaveBeenCalled()
    tab.fire('load')
    expect(tab.register).not.toHaveBeenCalled()
    tab.idleNow()
    expect(tab.register).toHaveBeenCalledExactlyOnceWith('/sw.js', { scope: '/' })
  })

  it('a page already loaded: on the next idle moment', () => {
    const tab = page({ loaded: true })
    tab.run()
    tab.idleNow()
    expect(tab.register).toHaveBeenCalledOnce()
  })

  it('a browser without service workers: nothing, and no error', () => {
    const tab = page({ worker: false })
    expect(() => tab.run()).not.toThrow()
    expect(tab.listeners.load).toBeUndefined()
  })

  it('counts a visit once per tab session', () => {
    const tab = page()
    tab.run()
    tab.run()
    expect(tab.local.get(VISITS_KEY)).toBe('1')
    tab.session.clear()
    tab.run()
    expect(tab.local.get(VISITS_KEY)).toBe('2')
    expect(tab.session.get(SESSION_KEY)).toBe('1')
  })

  it('storage refused (a private window): no count, the worker registered all the same', () => {
    const tab = page({ storage: false })
    expect(() => tab.run()).not.toThrow()
    tab.fire('load')
    tab.idleNow()
    expect(tab.register).toHaveBeenCalledOnce()
  })

  it('keeps the browser’s install offer for the prompt, instead of its own banner', () => {
    const tab = page()
    tab.run()
    const offer = { preventDefault: vi.fn() }
    tab.fire('beforeinstallprompt', offer)
    expect(offer.preventDefault).toHaveBeenCalled()
    expect(tab.window.__ffInstall).toBe(offer)
    expect(tab.dispatched).toEqual([INSTALLABLE_EVENT])
  })
})
