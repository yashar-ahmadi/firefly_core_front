import { describe, expect, it } from 'vitest'
import { isTrackingParam, withoutTracking } from '@/lib/url/tracking-params'

// Campaign and click identifiers (Plan 5 Task 7): never filters, never in a canonical, never in a
// cache key. Pure.

describe('isTrackingParam', () => {
  it.each([
    'utm_source',
    'utm_medium',
    'utm_campaign',
    'utm_term',
    'utm_content',
    'utm_id',
    'UTM_Source',
    'gclid',
    'gbraid',
    'wbraid',
    'fbclid',
    'msclkid',
    'yclid',
    '_ga',
    '_gl',
    'srsltid',
  ])('%s is one', (key) => {
    expect(isTrackingParam(key)).toBe(true)
  })

  it.each([
    'page',
    'sort',
    'search',
    'q',
    'brand',
    'utm',
    'utm_',
    'source',
    'ga',
    'gclid2',
    'next',
  ])('%s is not', (key) => {
    expect(isTrackingParam(key)).toBe(false)
  })
})

describe('withoutTracking', () => {
  it('drops tracking keys and keeps everything else as it was, repeats included', () => {
    expect(
      withoutTracking({
        utm_source: 'x',
        gclid: ['a', 'b'],
        page: '2',
        brand: ['apple', 'samsung'],
        empty: undefined,
      }),
    ).toEqual({ page: '2', brand: ['apple', 'samsung'], empty: undefined })
  })

  it('a new object: the input is left as it was', () => {
    const input = { utm_source: 'x', page: '2' }
    withoutTracking(input)
    expect(input).toEqual({ utm_source: 'x', page: '2' })
  })
})
