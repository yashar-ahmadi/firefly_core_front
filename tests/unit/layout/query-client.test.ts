import { describe, expect, it, vi } from 'vitest'
import { ApiError } from '@/lib/api/errors'
import { createQueryClient, shouldRetryQuery } from '@/lib/query/query-client'

const featureOff = () =>
  ApiError.fromBody(503, {
    msg: 'این قابلیت موقتاً غیرفعال است.',
    data: {
      feature: 'coupons',
      errors: [{ code: 'feature_disabled', detail: 'کد تخفیف فعلاً غیرفعال است.' }],
    },
  })

describe('shouldRetryQuery', () => {
  it('never retries client errors or a disabled feature', () => {
    for (const status of [400, 401, 403, 404, 409, 429]) {
      expect(shouldRetryQuery(0, new ApiError({ status }))).toBe(false)
    }
    expect(shouldRetryQuery(0, featureOff())).toBe(false)
  })

  it('retries server errors, lost connections and unknown errors at most twice', () => {
    for (const error of [new ApiError({ status: 500 }), ApiError.network(), new TypeError('x')]) {
      expect(shouldRetryQuery(0, error)).toBe(true)
      expect(shouldRetryQuery(1, error)).toBe(true)
      expect(shouldRetryQuery(2, error)).toBe(false)
    }
  })
})

describe('createQueryClient', () => {
  it('sets the storefront defaults', () => {
    const queries = createQueryClient().getDefaultOptions().queries
    expect(queries).toMatchObject({ staleTime: 30_000, refetchOnWindowFocus: false })
    expect(queries?.retry).toBe(shouldRetryQuery)
  })

  it('reports a disabled feature from a failed query or mutation', async () => {
    const onFeatureDisabled = vi.fn()
    const client = createQueryClient({ onFeatureDisabled })

    await expect(
      client.fetchQuery({ queryKey: ['coupon'], queryFn: () => Promise.reject(featureOff()) }),
    ).rejects.toBeInstanceOf(ApiError)
    expect(onFeatureDisabled).toHaveBeenCalledWith('coupons', 'کد تخفیف فعلاً غیرفعال است.')

    const mutation = client.getMutationCache().build(client, {
      mutationFn: () => Promise.reject(featureOff()),
    })
    await expect(mutation.execute(undefined)).rejects.toBeInstanceOf(ApiError)
    expect(onFeatureDisabled).toHaveBeenCalledTimes(2)
  })

  it('ignores other errors and a feature_disabled error without a known feature', async () => {
    const onFeatureDisabled = vi.fn()
    const client = createQueryClient({ onFeatureDisabled })
    const unknownFeature = new ApiError({ status: 503, code: 'feature_disabled' })
    for (const [index, error] of [new ApiError({ status: 404 }), unknownFeature].entries()) {
      await expect(
        client.fetchQuery({ queryKey: ['q', index], queryFn: () => Promise.reject(error) }),
      ).rejects.toBe(error)
    }
    expect(onFeatureDisabled).not.toHaveBeenCalled()
  })
})
