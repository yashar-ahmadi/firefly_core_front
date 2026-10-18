import { describe, expect, it } from 'vitest'
import {
  historyApiQuery,
  ledgerApiQuery,
  parseWalletParams,
  walletSearch,
  withdrawalsApiQuery,
} from '@/features/wallet/wallet-params'

// The wallet page's URL (`/account/wallet/?tab=…&…`): the tab, then that tab's filters and page
// in the API's own names (dashboard digest §3.3: `ordering` created|-created|amount|-amount, any
// other value a 400 `invalid_choice`, so never sent; an unknown filter value an empty page, so
// never sent either). Unknown values fall back to the defaults; defaults are left out.

const parse = (search: string) => parseWalletParams(new URLSearchParams(search))

describe('the tab', () => {
  it('the ledger by default; the withdrawals and the payment history by name', () => {
    expect(parse('').tab).toBe('transactions')
    expect(parse('tab=withdrawals').tab).toBe('withdrawals')
    expect(parse('tab=history').tab).toBe('history')
    expect(parse('tab=nope').tab).toBe('transactions')
  })

  it('only the tab on screen keeps its filters in the URL', () => {
    const params = parse('tab=history&status=failed&direction=credit&page=2')
    expect(walletSearch(params)).toBe('?tab=history&status=failed&page=2')
    expect(walletSearch(parse('direction=credit&status=failed'))).toBe('?direction=credit')
  })
})

describe('the ledger (wallet/transaction/list/)', () => {
  it('direction, cause, ordering, an order code’s start and the page, in the API’s names', () => {
    const params = parse('direction=debit&cause=order_payment&ordering=-amount&search=۰۴۰۴&page=3')
    expect(params.ledger).toEqual({
      direction: 'debit',
      cause: 'order_payment',
      ordering: '-amount',
      search: '0404',
      page: 3,
    })
    expect(ledgerApiQuery(params.ledger)).toEqual({
      direction: 'debit',
      cause: 'order_payment',
      ordering: '-amount',
      search: '0404',
      page: 3,
    })
    expect(walletSearch(params)).toBe(
      '?direction=debit&cause=order_payment&ordering=-amount&search=0404&page=3',
    )
  })

  it('unknown values fall back and are never sent (no `invalid_choice`, no empty page)', () => {
    const params = parse('direction=sideways&cause=lottery&ordering=price&search=abc&page=0')
    expect(params.ledger).toEqual({
      direction: null,
      cause: null,
      ordering: '-created',
      search: '',
      page: 1,
    })
    expect(ledgerApiQuery(params.ledger)).toEqual({})
    expect(walletSearch(params)).toBe('')
  })

  it('the default ordering is left out of the URL and the query', () => {
    expect(ledgerApiQuery(parse('ordering=-created').ledger)).toEqual({})
    expect(ledgerApiQuery(parse('ordering=created').ledger)).toEqual({ ordering: 'created' })
  })

  it('a search is the digits of an order code’s start (ten at most)', () => {
    expect(parse('search=0404614013999').ledger.search).toBe('0404614013')
    expect(parse('search=٠٤٠').ledger.search).toBe('040')
  })
})

describe('the withdrawals (wallet/withdrawal/list/)', () => {
  it('status and ordering in the API’s names; unknown ones dropped', () => {
    const params = parse('tab=withdrawals&status=paid&ordering=amount&page=2')
    expect(withdrawalsApiQuery(params.withdrawals)).toEqual({
      status: 'paid',
      ordering: 'amount',
      page: 2,
    })
    expect(
      withdrawalsApiQuery(parse('tab=withdrawals&status=lost&ordering=x').withdrawals),
    ).toEqual({})
  })

  it('the withdrawal a ledger row points at (`focus`, a uuid) is kept only well-formed', () => {
    const uuid = '0a9e0001-0000-4000-8000-000000000001'
    expect(parse(`tab=withdrawals&focus=${uuid}`).focus).toBe(uuid)
    expect(parse('tab=withdrawals&focus=../x').focus).toBeNull()
    expect(walletSearch(parse(`tab=withdrawals&focus=${uuid}`))).toBe(
      `?tab=withdrawals&focus=${uuid}`,
    )
  })
})

describe('the payment history (payment/history/)', () => {
  it('status, method and what it was for (`applies_to`)', () => {
    const params = parse('tab=history&status=settled&method=bank_gateway&applies_to=wallet_topup')
    expect(historyApiQuery(params.history)).toEqual({
      status: 'settled',
      method: 'bank_gateway',
      applies_to: 'wallet_topup',
    })
    expect(walletSearch(params)).toBe(
      '?tab=history&status=settled&method=bank_gateway&applies_to=wallet_topup',
    )
  })

  it('unknown values dropped (an empty page, not an error, would mislead)', () => {
    expect(
      historyApiQuery(parse('tab=history&status=x&method=crypto&applies_to=y&page=-1').history),
    ).toEqual({})
  })
})
