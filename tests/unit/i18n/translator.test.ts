import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest'
import { fa } from '@/lib/i18n/fa'
import { createTranslator } from '@/lib/i18n/translator'

// ZWNJ and the combining hamza are written as escapes: invisible characters do not survive tooling.
const REQUIRED: Record<string, string> = {
  currency: 'تومان',
  add_to_cart: 'افزودن به سبد خرید',
  search_placeholder: 'جستجو در محصولات\u{2026}',
  login_register: 'ورود | ثبت\u{200C}نام',
  cart: 'سبد خرید',
  categories: 'دسته\u{200C}بندی\u{200C}ها',
  home: 'خانه',
  account: 'حساب من',
  see_all: 'مشاهده\u{0654} همه',
  not_found_title: 'صفحه\u{200C}ای که دنبالش بودید پیدا نشد',
  retry: 'تلاش دوباره',
}

let warn: MockInstance<typeof console.warn>

beforeEach(() => {
  warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
})

afterEach(() => {
  warn.mockRestore()
})

describe('fa dictionary', () => {
  it.each(Object.entries(REQUIRED))('has %s verbatim', (key, value) => {
    expect(fa[key]).toBe(value)
  })

  it('uses flat snake_case keys and non-empty strings only', () => {
    for (const [key, value] of Object.entries(fa)) {
      expect(key).toMatch(/^[a-z][a-z0-9]*(_[a-z0-9]+)*$/)
      expect(typeof value).toBe('string')
      expect(value.trim()).not.toBe('')
    }
  })

  it('has the shell keys the header and footer will need', () => {
    for (const key of ['menu', 'close', 'open_menu', 'phone_support', 'announcement_dismiss']) {
      expect(fa).toHaveProperty(key)
    }
    expect(fa).toHaveProperty('back_to_top')
    expect(fa).toHaveProperty('categories_all')
  })
})

describe('createTranslator', () => {
  it('falls back to the bundled Persian dictionary', () => {
    const t = createTranslator({})
    expect(t('add_to_cart')).toBe(REQUIRED.add_to_cart)
    expect(t('currency')).toBe('تومان')
  })

  it('lets an override win over the bundled string', () => {
    const t = createTranslator({ add_to_cart: 'بریز تو سبد' })
    expect(t('add_to_cart')).toBe('بریز تو سبد')
    expect(t('cart')).toBe(REQUIRED.cart)
  })

  it('ignores blank overrides, which the operator may have cleared to reset a key', () => {
    const t = createTranslator({ cart: '', home: '   ' })
    expect(t('cart')).toBe(REQUIRED.cart)
    expect(t('home')).toBe('خانه')
  })

  it('serves keys that only the server dictionary has', () => {
    expect(createTranslator({ promo_title: 'پیشنهاد ویژه' })('promo_title')).toBe('پیشنهاد ویژه')
    expect(warn).not.toHaveBeenCalled()
  })

  it('interpolates {name} placeholders and writes numbers with Persian digits', () => {
    const t = createTranslator({ items_in_cart: '{count} کالا در سبد شما، {name}!' })
    expect(t('items_in_cart', { count: 12, name: 'سارا' })).toBe(
      '\u{06F1}\u{06F2} کالا در سبد شما، سارا!',
    )
  })

  it('does not touch string values, keeps unknown placeholders and repeats a placeholder', () => {
    const t = createTranslator({ a: '{x}-{x}-{y}', b: 'کد {code}' })
    expect(t('a', { x: 'v' })).toBe('v-v-{y}')
    expect(t('b', { code: 'AB12' })).toBe('کد AB12')
  })

  it('does not interpret "$" patterns in values', () => {
    expect(createTranslator({ a: 'قیمت {p}' })('a', { p: "$& $1 $'" })).toBe("قیمت $& $1 $'")
  })

  it('returns an unknown key and warns once per key', () => {
    const t = createTranslator({})
    expect(t('no_such_key_a')).toBe('no_such_key_a')
    expect(t('no_such_key_a')).toBe('no_such_key_a')
    expect(createTranslator({})('no_such_key_a')).toBe('no_such_key_a')
    expect(warn).toHaveBeenCalledTimes(1)
    expect(String(warn.mock.calls[0]?.[0])).toContain('no_such_key_a')
    t('no_such_key_b')
    expect(warn).toHaveBeenCalledTimes(2)
  })

  it('never resolves inherited object properties as keys', () => {
    const t = createTranslator({})
    expect(t('constructor')).toBe('constructor')
    expect(t('toString')).toBe('toString')
    expect(t('__proto__')).toBe('__proto__')
  })

  it('stays quiet in production', () => {
    vi.stubEnv('NODE_ENV', 'production')
    try {
      expect(createTranslator({})('no_such_key_prod')).toBe('no_such_key_prod')
      expect(warn).not.toHaveBeenCalled()
    } finally {
      vi.unstubAllEnvs()
    }
  })
})
