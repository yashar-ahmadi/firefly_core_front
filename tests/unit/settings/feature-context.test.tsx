import { act, render, renderHook, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import {
  FeatureProvider,
  useFeature,
  useMarkFeatureDisabled,
  type FeatureMap,
} from '@/features/settings/feature-context'
import { FEATURE_KEYS, type FeatureKey } from '@/lib/api/types/common'

function featureMap(overrides: Partial<FeatureMap> = {}): FeatureMap {
  const map = Object.fromEntries(
    FEATURE_KEYS.map((key) => [key, { key, name: key, enabled: true, reason: null }]),
  ) as FeatureMap
  return { ...map, ...overrides }
}

function wrapperFor(initial: FeatureMap) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <FeatureProvider initial={initial}>{children}</FeatureProvider>
  }
}

describe('feature context', () => {
  it('reflects the initial map', () => {
    const initial = featureMap({
      coupons: { key: 'coupons', name: 'کد تخفیف', enabled: false, reason: 'موقتاً غیرفعال است' },
    })
    const { result } = renderHook(
      () => ({ coupons: useFeature('coupons'), wallet: useFeature('wallet') }),
      { wrapper: wrapperFor(initial) },
    )
    expect(result.current.coupons).toEqual({ enabled: false, reason: 'موقتاً غیرفعال است' })
    expect(result.current.wallet).toEqual({ enabled: true, reason: null })
  })

  it('treats a key missing from the map as enabled', () => {
    const initial = featureMap()
    delete (initial as Partial<FeatureMap>).blog
    const { result } = renderHook(() => useFeature('blog'), { wrapper: wrapperFor(initial) })
    expect(result.current).toEqual({ enabled: true, reason: null })
  })

  it('turns a feature off after markFeatureDisabled', () => {
    const { result } = renderHook(
      () => ({
        coupons: useFeature('coupons'),
        wallet: useFeature('wallet'),
        markFeatureDisabled: useMarkFeatureDisabled(),
      }),
      { wrapper: wrapperFor(featureMap()) },
    )
    expect(result.current.coupons.enabled).toBe(true)

    act(() => result.current.markFeatureDisabled('coupons', 'x'))
    expect(result.current.coupons).toEqual({ enabled: false, reason: 'x' })
    expect(result.current.wallet).toEqual({ enabled: true, reason: null })
  })

  it('keeps a blank reason as null', () => {
    const { result } = renderHook(
      () => ({ coupons: useFeature('coupons'), mark: useMarkFeatureDisabled() }),
      { wrapper: wrapperFor(featureMap()) },
    )
    act(() => result.current.mark('coupons', '   '))
    expect(result.current.coupons).toEqual({ enabled: false, reason: null })
  })

  it('re-renders only the components that read the changed feature', () => {
    const renders: Record<string, number> = {}
    function Reader({ feature }: { feature: FeatureKey }) {
      renders[feature] = (renders[feature] ?? 0) + 1
      const { enabled } = useFeature(feature)
      return <p>{`${feature}:${enabled ? 'on' : 'off'}`}</p>
    }
    let mark: ((key: FeatureKey, reason: string) => void) | undefined
    function Marker() {
      mark = useMarkFeatureDisabled()
      return null
    }
    render(
      <FeatureProvider initial={featureMap()}>
        <Reader feature="coupons" />
        <Reader feature="wallet" />
        <Marker />
      </FeatureProvider>,
    )
    expect(screen.getByText('coupons:on')).toBeInTheDocument()

    act(() => mark?.('coupons', 'x'))
    expect(screen.getByText('coupons:off')).toBeInTheDocument()
    expect(renders).toEqual({ coupons: 2, wallet: 1 })
  })

  it('throws a clear error outside the provider', () => {
    // React reports the render error too; keep the test output clean.
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(() => renderHook(() => useFeature('coupons'))).toThrow(/FeatureProvider/)
    error.mockRestore()
  })
})
