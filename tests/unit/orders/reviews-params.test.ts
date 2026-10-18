import { describe, expect, it } from 'vitest'
import { parseReviewsParams } from '@/features/orders/reviews/reviews-params'

// «در انتظار دیدگاه»'s URL (`?order=<code>&product=<slug>` from the order page's «ثبت دیدگاه»):
// the product is any slug a product page takes (`productPath`: one path segment, Persian with its
// ZWNJ and combining marks included), never a path; the order exactly ten digits.

const parse = (search: string) => parseReviewsParams(new URLSearchParams(search))
const target = (product: string) =>
  parse(`order=6216528804&product=${encodeURIComponent(product)}`).target

describe('parseReviewsParams', () => {
  it('a Latin slug, and a Persian one with its ZWNJ and a combining mark', () => {
    expect(target('online-course-seo')).toEqual({
      order: '6216528804',
      product: 'online-course-seo',
    })
    expect(target('چای\u{200C}سبز-ممتاز')?.product).toBe('چای\u{200C}سبز-ممتاز')
    expect(target('خامه\u{0654}-تازه')?.product).toBe('خامه\u{0654}-تازه')
    expect(target('kit.pro_2')?.product).toBe('kit.pro_2')
  })

  it('never a path or a dot segment, nor an empty slug', () => {
    expect(target('a/b')).toBeNull()
    expect(target('..')).toBeNull()
    expect(target('.')).toBeNull()
    expect(target('')).toBeNull()
    expect(target('x'.repeat(256))).toBeNull()
  })

  it('the order exactly ten digits', () => {
    expect(parse('order=123&product=a').target).toBeNull()
    expect(parse('order=6216528804').target).toBeNull()
  })
})
