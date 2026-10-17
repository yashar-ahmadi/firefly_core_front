import { describe, expect, it } from 'vitest'
import {
  commentsApiQuery,
  commentsSearch,
  parseCommentsParams,
} from '@/features/account/comments/comment-params'
import { parsePage } from '@/features/account/lists/page-param'
import {
  parseWishlistParams,
  wishlistApiQuery,
  wishlistSearch,
} from '@/features/account/wishlist/wishlist-params'

// The account lists' URL state (pure): what the URL may say, what is sent to the API, and the
// URL written back (defaults left out, so `/account/wishlist/` is the plain page).

const url = (query: string) => new URLSearchParams(query)

describe('parsePage', () => {
  it('takes a whole page number from 1, Persian digits too; anything else is page 1', () => {
    expect(parsePage('2')).toBe(2)
    expect(parsePage('۳')).toBe(3)
    for (const value of [null, '', '0', '-1', '1.5', 'abc', '2abc', '1e3', '99999999999999999']) {
      expect(parsePage(value), String(value)).toBe(1)
    }
  })
})

describe('the wishlist’s URL', () => {
  it('reads sort, the in-stock switch and the page; unknown values are the defaults', () => {
    expect(parseWishlistParams(url(''))).toEqual({ sort: 'added-desc', inStock: false, page: 1 })
    expect(parseWishlistParams(url('sort=added-asc&in_stock=true&page=2'))).toEqual({
      sort: 'added-asc',
      inStock: true,
      page: 2,
    })
    expect(parseWishlistParams(url('sort=price-asc&in_stock=yes&page=x'))).toEqual({
      sort: 'added-desc',
      inStock: false,
      page: 1,
    })
  })

  it('writes only what is not a default, in a fixed order', () => {
    expect(wishlistSearch({ sort: 'added-desc', inStock: false, page: 1 })).toBe('')
    expect(wishlistSearch({ sort: 'added-asc', inStock: true, page: 2 })).toBe(
      '?sort=added-asc&in_stock=true&page=2',
    )
    expect(wishlistSearch({ sort: 'added-desc', inStock: true, page: 1 })).toBe('?in_stock=true')
  })

  it('sends the API its own names, nothing for a default', () => {
    expect(wishlistApiQuery({ sort: 'added-desc', inStock: false, page: 1 })).toEqual({})
    expect(wishlistApiQuery({ sort: 'added-asc', inStock: true, page: 3 })).toEqual({
      sort: 'added-asc',
      in_stock: 'true',
      page: 3,
    })
  })
})

describe('my comments’ URL', () => {
  it('reads the types (repeated), the status and the page; unknown values are dropped', () => {
    expect(parseCommentsParams(url(''))).toEqual({ types: [], status: null, page: 1 })
    expect(parseCommentsParams(url('type=post&status=pending&page=2'))).toEqual({
      types: ['post'],
      status: 'pending',
      page: 2,
    })
    expect(parseCommentsParams(url('type=page&type=post&type=page'))).toEqual({
      types: ['post', 'page'],
      status: null,
      page: 1,
    })
    expect(parseCommentsParams(url('type=review&type=post,page&status=approved'))).toEqual({
      types: [],
      status: null,
      page: 1,
    })
  })

  it('writes the URL back without defaults, and sends subject_type as an array (repeated)', () => {
    expect(commentsSearch({ types: [], status: null, page: 1 })).toBe('')
    expect(commentsSearch({ types: ['post'], status: 'declined', page: 2 })).toBe(
      '?type=post&status=declined&page=2',
    )
    expect(commentsApiQuery({ types: [], status: null, page: 1 })).toEqual({})
    expect(commentsApiQuery({ types: ['product', 'page'], status: 'accepted', page: 4 })).toEqual({
      subject_type: ['product', 'page'],
      status: 'accepted',
      page: 4,
    })
  })
})
