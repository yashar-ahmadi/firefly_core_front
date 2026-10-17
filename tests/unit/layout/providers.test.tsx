import { useMutation, useQuery } from '@tanstack/react-query'
import { act, render, renderHook, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Providers } from '@/app/providers'
import { IconButton } from '@/components/ui/icon-button'
import { Tooltip, TooltipProvider } from '@/components/ui/tooltip'
import { parseServerEnv } from '@/config/env-schema'
import { resolveStoreConfig, toPublicConfig } from '@/config/resolve-store-config'
import { useAuthSettings } from '@/features/auth/use-auth-settings'
import { useFeature, type FeatureMap } from '@/features/settings/feature-context'
import { ApiError } from '@/lib/api/errors'
import { FEATURE_KEYS } from '@/lib/api/types/common'
import { useStoreConfig } from '@/lib/config-context'
import { useT } from '@/lib/i18n/i18n-context'
import { SessionProvider, useSession } from '@/lib/session/session-context'
import { emailOnlyAuth } from '../support/auth'
import { stubBrowserApis } from '../support/dom-stubs'

const config = toPublicConfig(
  resolveStoreConfig(
    parseServerEnv({
      FIREFLY_API_URL: 'https://api.shop.ir/',
      SITE_URL: 'https://shop.ir/',
      FIREFLY_API_KEY: 'k',
      STORE_PRESET: 'digital',
    }),
  ),
)

const auth = emailOnlyAuth()

const features = Object.fromEntries(
  FEATURE_KEYS.map((key) => [key, { key, name: '', enabled: true, reason: null }]),
) as FeatureMap

function providers(props: { hasSession?: boolean; translations?: Record<string, string> } = {}) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <Providers
        config={config}
        auth={auth}
        features={features}
        translations={props.translations ?? {}}
        hasSession={props.hasSession ?? false}
      >
        {children}
      </Providers>
    )
  }
}

const featureOff = () =>
  ApiError.fromBody(503, {
    data: { feature: 'coupons', errors: [{ code: 'feature_disabled', detail: 'غیرفعال' }] },
  })

beforeEach(() => {
  stubBrowserApis()
})

describe('Providers', () => {
  it('exposes the public store config', () => {
    const { result } = renderHook(() => useStoreConfig(), { wrapper: providers() })
    expect(result.current.preset).toBe('digital')
    expect(result.current.mediaOrigin).toBe('https://api.shop.ir')
  })

  it("exposes the settings' auth block, which the login and registration forms are built from", () => {
    const { result } = renderHook(() => useAuthSettings(), { wrapper: providers() })
    expect(result.current).toEqual(auth)
  })

  it('asks for the auth settings only inside the providers', () => {
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      expect(() => renderHook(() => useAuthSettings())).toThrow(/Providers/)
    } finally {
      quiet.mockRestore()
    }
  })

  it('translates with the operator overrides over the bundled dictionary', () => {
    const { result } = renderHook(() => useT(), {
      wrapper: providers({ translations: { cart: 'سبد من' } }),
    })
    expect(result.current('cart')).toBe('سبد من')
    expect(result.current('search')).toBe('جستجو')
  })

  it('starts the session flag from the server and lets the client change it', () => {
    const { result } = renderHook(() => useSession(), {
      wrapper: providers({ hasSession: true }),
    })
    expect(result.current.hasSession).toBe(true)
    act(() => result.current.setHasSession(false))
    expect(result.current.hasSession).toBe(false)
  })

  it('keeps a local change until a server re-render brings a different flag', () => {
    let initial = false
    const { result, rerender } = renderHook(() => useSession(), {
      wrapper: ({ children }) => (
        <SessionProvider initialHasSession={initial}>{children}</SessionProvider>
      ),
    })
    act(() => result.current.setHasSession(true))
    rerender()
    expect(result.current.hasSession).toBe(true)

    // router.refresh() after signing in: the layout now sees the ff_auth cookie.
    initial = true
    rerender()
    expect(result.current.hasSession).toBe(true)
    // ...and after signing out elsewhere, it no longer does.
    initial = false
    rerender()
    expect(result.current.hasSession).toBe(false)
  })

  it('marks a feature disabled when a query fails with 503 feature_disabled', async () => {
    const { result } = renderHook(
      () => ({
        coupons: useFeature('coupons'),
        query: useQuery({ queryKey: ['coupon'], queryFn: () => Promise.reject(featureOff()) }),
      }),
      { wrapper: providers() },
    )
    expect(result.current.coupons.enabled).toBe(true)
    await waitFor(() =>
      expect(result.current.coupons).toEqual({ enabled: false, reason: 'غیرفعال' }),
    )
    // Not retried: the error arrives after the first attempt.
    expect(result.current.query.failureCount).toBe(1)
  })

  it('marks a feature disabled when a mutation fails with 503 feature_disabled', async () => {
    const { result } = renderHook(
      () => ({
        coupons: useFeature('coupons'),
        mutation: useMutation({ mutationFn: () => Promise.reject(featureOff()) }),
      }),
      { wrapper: providers() },
    )
    act(() => result.current.mutation.mutate())
    await waitFor(() => expect(result.current.coupons.enabled).toBe(false))
  })

  it('needs no tooltip provider: a Tooltip brings its own, so pages without one skip its code', async () => {
    const user = userEvent.setup()
    render(
      <Tooltip content="افزودن به علاقه‌مندی‌ها" delayDuration={0}>
        <IconButton label="علاقه‌مندی" icon="♥" />
      </Tooltip>,
      { wrapper: providers() },
    )
    await user.hover(screen.getByRole('button', { name: 'علاقه‌مندی' }))
    expect(await screen.findByRole('tooltip')).toHaveTextContent('افزودن به علاقه‌مندی‌ها')
  })

  it('a Tooltip works with no provider above it, alone or in a TooltipProvider group', async () => {
    const user = userEvent.setup()
    render(
      <>
        <Tooltip content="تنها" delayDuration={0}>
          <IconButton label="یک" icon="۱" />
        </Tooltip>
        <TooltipProvider>
          <Tooltip content="در گروه" delayDuration={0}>
            <IconButton label="دو" icon="۲" />
          </Tooltip>
        </TooltipProvider>
      </>,
    )
    await user.hover(screen.getByRole('button', { name: 'یک' }))
    expect(await screen.findByRole('tooltip')).toHaveTextContent('تنها')
    await user.unhover(screen.getByRole('button', { name: 'یک' }))
    await user.hover(screen.getByRole('button', { name: 'دو' }))
    expect(await screen.findByRole('tooltip', { name: 'در گروه' })).toBeInTheDocument()
  })
})

describe('hooks outside their provider', () => {
  it.each<[string, () => unknown, RegExp]>([
    ['useStoreConfig', () => useStoreConfig(), /StoreConfigProvider/],
    ['useSession', () => useSession(), /SessionProvider/],
  ])('%s throws a clear error', (_name, hook, message) => {
    // React reports the render error too; keep the test output clean.
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(() => renderHook(hook)).toThrow(message)
    error.mockRestore()
  })
})
