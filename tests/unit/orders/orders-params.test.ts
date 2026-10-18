import { describe, expect, it } from 'vitest'
import {
  ordersApiQuery,
  ordersSearch,
  parseOrdersParams,
  resolveGroup,
  type OrdersParams,
} from '@/features/orders/account/orders-params'

// «سفارش‌های من»'s URL state (`?group=in_progress&sort=total-desc&search=…&page=2`, defaults left
// out) and the API query it makes (order digest §3.1.2): `group` is the API's `status_group`
// (the dashboard's strip and the checkout's unpaid-limit link already use `?group=`). A value the
// API would refuse is never sent: an unknown sort is the default, and a group is sent only when
// the code knows it or the summary lists it (`order_status_group_filter_unknown` and
// `invalid_choice` cannot come from the page).

const parse = (query: string) => parseOrdersParams(new URLSearchParams(query))
const BASE: OrdersParams = { group: null, sort: 'date-desc', search: '', page: 1 }

describe('parseOrdersParams', () => {
  it('nothing: every order, newest first, page 1', () => {
    expect(parse('')).toEqual(BASE)
  })

  it('takes the four sorts the API knows; anything else is the default', () => {
    for (const sort of ['date-desc', 'date-asc', 'total-desc', 'total-asc'] as const)
      expect(parse(`sort=${sort}`).sort).toBe(sort)
    for (const sort of ['price', 'DATE-ASC', '-created', ''])
      expect(parse(`sort=${sort}`).sort).toBe('date-desc')
  })

  it('a group is a key’s shape (lower case, underscores); anything else is none', () => {
    expect(parse('group=in_progress').group).toBe('in_progress')
    expect(parse('group=on_hold').group).toBe('on_hold')
    for (const group of ['', 'In_Progress', 'a,b', '../x', 'x'.repeat(60), 'sent;drop'])
      expect(parse(`group=${encodeURIComponent(group)}`).group).toBeNull()
  })

  it('the search is trimmed and capped; the page from Persian digits too', () => {
    expect(parse('search=%20%20۲۵۸۳%20').search).toBe('۲۵۸۳')
    expect(parse(`search=${'ک'.repeat(150)}`).search).toHaveLength(100)
    expect(parse('page=۳').page).toBe(3)
    expect(parse('page=0').page).toBe(1)
  })
})

describe('ordersSearch', () => {
  it('leaves the defaults out', () => {
    expect(ordersSearch(BASE)).toBe('')
  })

  it('in a fixed order', () => {
    expect(ordersSearch({ group: 'delivered', sort: 'total-asc', search: 'گوشی', page: 2 })).toBe(
      '?group=delivered&sort=total-asc&search=%DA%AF%D9%88%D8%B4%DB%8C&page=2',
    )
  })

  it('round-trips', () => {
    const params: OrdersParams = { group: 'cancelled', sort: 'date-asc', search: '12', page: 4 }
    expect(parse(ordersSearch(params).slice(1))).toEqual(params)
  })
})

describe('resolveGroup', () => {
  it('none: every order', () => {
    expect(resolveGroup(null, undefined)).toEqual({ kind: 'all' })
  })

  it('a group the code knows is sent at once, before the summary is read', () => {
    for (const key of ['awaiting_payment', 'in_progress', 'delivered', 'returned', 'cancelled'])
      expect(resolveGroup(key, undefined)).toEqual({ kind: 'group', key })
  })

  it('a key the code does not know waits for the summary, which may list it (a new tab)', () => {
    expect(resolveGroup('on_hold', undefined)).toEqual({ kind: 'pending' })
    expect(resolveGroup('on_hold', ['awaiting_payment', 'on_hold'])).toEqual({
      kind: 'group',
      key: 'on_hold',
    })
  })

  it('a key neither knows (an old link, a typo) falls back to every order', () => {
    expect(resolveGroup('sent', ['awaiting_payment', 'in_progress'])).toEqual({ kind: 'all' })
    // The summary could not be read: nothing unknown is sent either.
    expect(resolveGroup('on_hold', null)).toEqual({ kind: 'all' })
  })
})

describe('ordersApiQuery', () => {
  it('the API’s own names, nothing for a default', () => {
    expect(ordersApiQuery(BASE, { kind: 'all' })).toEqual({})
    expect(
      ordersApiQuery(
        { group: 'delivered', sort: 'total-desc', search: 'گوشی', page: 3 },
        { kind: 'group', key: 'delivered' },
      ),
    ).toEqual({ status_group: 'delivered', sort: 'total-desc', search: 'گوشی', page: 3 })
  })

  it('a group that fell back is not sent', () => {
    expect(ordersApiQuery({ ...BASE, group: 'sent' }, { kind: 'all' })).toEqual({})
  })
})
