import { act, renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import {
  FeatureProvider,
  useFeature,
  useMarkFeatureDisabled,
  type FeatureMap,
} from '@/features/settings/feature-context'
import { FEATURE_KEYS } from '@/lib/api/types/common'

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

  it('takes a newer map from a server re-render, keeping the same marker', () => {
    let initial = featureMap({
      coupons: { key: 'coupons', name: '', enabled: false, reason: 'خاموش' },
    })
    const { result, rerender } = renderHook(
      () => ({
        coupons: useFeature('coupons'),
        wallet: useFeature('wallet'),
        mark: useMarkFeatureDisabled(),
      }),
      {
        wrapper: ({ children }: { children: ReactNode }) => (
          <FeatureProvider initial={initial}>{children}</FeatureProvider>
        ),
      },
    )
    const mark = result.current.mark
    act(() => mark('wallet', 'x'))
    rerender()
    // The same server map: the client's own knowledge stays.
    expect(result.current.wallet).toEqual({ enabled: false, reason: 'x' })

    // router.refresh() after the operator switched coupons back on.
    initial = featureMap()
    rerender()
    expect(result.current.coupons).toEqual({ enabled: true, reason: null })
    expect(result.current.wallet).toEqual({ enabled: true, reason: null })

    // The QueryClient keeps the first marker it was given: it must still work.
    expect(result.current.mark).toBe(mark)
    act(() => mark('coupons', 'y'))
    expect(result.current.coupons).toEqual({ enabled: false, reason: 'y' })
  })

  it('throws a clear error outside the provider', () => {
    // React reports the render error too; keep the test output clean.
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(() => renderHook(() => useFeature('coupons'))).toThrow(/FeatureProvider/)
    error.mockRestore()
  })
})
