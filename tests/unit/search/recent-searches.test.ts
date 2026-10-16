import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  RECENT_SEARCHES_KEY,
  RECENT_SEARCHES_MAX,
  useRecentSearches,
} from '@/features/search/recent-searches'

const store = () => useRecentSearches.getState()

function saved(): unknown {
  return JSON.parse(localStorage.getItem(RECENT_SEARCHES_KEY) ?? 'null')
}

beforeEach(() => {
  localStorage.clear()
  useRecentSearches.setState({ items: [] })
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('recent searches', () => {
  it('keeps the newest first and saves them on this device', () => {
    store().add('گوشی')
    store().add('سامسونگ')
    expect(store().items).toEqual(['سامسونگ', 'گوشی'])
    expect(saved()).toEqual({ state: { items: ['سامسونگ', 'گوشی'] }, version: 0 })
  })

  it(`keeps at most ${RECENT_SEARCHES_MAX}`, () => {
    for (let index = 1; index <= RECENT_SEARCHES_MAX + 2; index += 1) store().add(`کالا ${index}`)
    expect(store().items).toHaveLength(RECENT_SEARCHES_MAX)
    expect(store().items[0]).toBe('کالا 10')
    expect(store().items.at(-1)).toBe('کالا 3')
  })

  it('lists a term once: searching it again moves it to the front, as last typed', () => {
    store().add('گوشی')
    store().add('لپ تاپ')
    store().add('  \u{06AF}\u{0648}\u{0634}\u{064A}  ')
    expect(store().items).toEqual(['گوشي', 'لپ تاپ'])
    store().add('Galaxy  S25')
    store().add('galaxy s25')
    expect(store().items).toEqual(['galaxy s25', 'گوشي', 'لپ تاپ'])
  })

  it('ignores what the search would refuse: under two characters once normalised', () => {
    store().add(' ')
    store().add('گ')
    store().add('ـگ')
    expect(store().items).toEqual([])
  })

  it('removes one term, or all of them', () => {
    store().add('گوشی')
    store().add('سامسونگ')
    store().add('هدفون')
    store().remove('\u{0633}\u{0627}\u{0645}\u{0633}\u{0648}\u{0646}\u{06AF}')
    expect(store().items).toEqual(['هدفون', 'گوشی'])
    store().clear()
    expect(store().items).toEqual([])
    expect(saved()).toEqual({ state: { items: [] }, version: 0 })
  })

  it('reads back only well-formed entries', async () => {
    localStorage.setItem(
      RECENT_SEARCHES_KEY,
      JSON.stringify({ state: { items: ['گوشی', 3, null, 'گوشی', 'هدفون'] }, version: 0 }),
    )
    await useRecentSearches.persist.rehydrate()
    expect(store().items).toEqual(['گوشی', 'هدفون'])
  })

  it('still works for this page when the browser refuses storage', async () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('quota', 'QuotaExceededError')
    })
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('denied', 'SecurityError')
    })
    const warn = vi.spyOn(console, 'warn')
    const error = vi.spyOn(console, 'error')
    await useRecentSearches.persist.rehydrate()
    expect(() => store().add('گوشی')).not.toThrow()
    expect(store().items).toEqual(['گوشی'])
    expect(() => store().remove('گوشی')).not.toThrow()
    expect(store().items).toEqual([])
    expect(warn).not.toHaveBeenCalled()
    expect(error).not.toHaveBeenCalled()
  })

  it('still works when even reaching localStorage throws', async () => {
    const descriptor = Object.getOwnPropertyDescriptor(window, 'localStorage')!
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      get() {
        throw new DOMException('denied', 'SecurityError')
      },
    })
    try {
      await useRecentSearches.persist.rehydrate()
      expect(() => store().add('گوشی')).not.toThrow()
      expect(store().items).toEqual(['گوشی'])
    } finally {
      Object.defineProperty(window, 'localStorage', descriptor)
    }
  })
})
