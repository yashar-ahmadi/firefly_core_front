import { pageEntry, parsePage, toSearch } from '@/features/account/lists/page-param'
import type { QueryInit } from '@/lib/api/envelope'
import { toLatinDigits } from '@/lib/format/digits'
import type { WalletCause, WalletDirection, WithdrawalStatus } from '@/lib/api/types/wallet'
import {
  APPLIES_TO,
  CAUSES,
  DEFAULT_ORDERING,
  DIRECTIONS,
  ORDERINGS,
  PAYMENT_METHODS,
  PAYMENT_STATUSES,
  WITHDRAWAL_STATUSES,
  type Option,
  type Ordering,
} from './wallet-labels'

// The wallet page's URL state (`/account/wallet/?tab=…&…`), read on every render (Plan 3's list
// helpers): the tab, then that tab's own filters and page in the API's names (only the tab on
// screen keeps them). A value the API would refuse (`ordering`: 400 `invalid_choice`) or answer
// with an empty page (an unknown direction, cause, status, method or `applies_to`) falls back to
// the default and is never sent. Pure.

export type WalletTab = 'transactions' | 'withdrawals' | 'history'

export const WALLET_TABS: readonly Option<WalletTab>[] = [
  { value: 'transactions', label: 'تراکنش\u{200C}ها' },
  { value: 'withdrawals', label: 'برداشت' },
  { value: 'history', label: 'تاریخچهٔ پرداخت' },
]

export interface LedgerParams {
  direction: WalletDirection | null
  cause: WalletCause | null
  ordering: Ordering
  /** Digits of an order code's start (the API's `search`), or ''. */
  search: string
  page: number
}

export interface WithdrawalsParams {
  status: WithdrawalStatus | null
  ordering: Ordering
  page: number
}

export interface HistoryParams {
  status: string | null
  method: string | null
  appliesTo: string | null
  page: number
}

export interface WalletParams {
  tab: WalletTab
  ledger: LedgerParams
  withdrawals: WithdrawalsParams
  history: HistoryParams
  /** The withdrawal a ledger row points at (its uuid), brought forward on its tab. */
  focus: string | null
}

type Search = Pick<URLSearchParams, 'get'>

const UUID = /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i
const ORDER_CODE_DIGITS = 10

function pick<V extends string>(options: readonly Option<V>[], value: string | null): V | null {
  return options.find((option) => option.value === value)?.value ?? null
}

const orderingOf = (value: string | null): Ordering => pick(ORDERINGS, value) ?? DEFAULT_ORDERING

export function parseWalletParams(search: Search): WalletParams {
  const page = parsePage(search.get('page'))
  const focus = search.get('focus')
  return {
    tab: pick(WALLET_TABS, search.get('tab')) ?? 'transactions',
    ledger: {
      direction: pick(DIRECTIONS, search.get('direction')),
      cause: pick(CAUSES, search.get('cause')),
      ordering: orderingOf(search.get('ordering')),
      search: toLatinDigits(search.get('search') ?? '')
        .replace(/\D/g, '')
        .slice(0, ORDER_CODE_DIGITS),
      page,
    },
    withdrawals: {
      status: pick(WITHDRAWAL_STATUSES, search.get('status')),
      ordering: orderingOf(search.get('ordering')),
      page,
    },
    history: {
      status: pick(PAYMENT_STATUSES, search.get('status')),
      method: pick(PAYMENT_METHODS, search.get('method')),
      appliesTo: pick(APPLIES_TO, search.get('applies_to')),
      page,
    },
    focus: focus && UUID.test(focus) ? focus : null,
  }
}

type Entry = [string, string]
const entry = (key: string, value: string | null | undefined): Entry[] =>
  value ? [[key, value]] : []
const orderingEntry = (ordering: Ordering) =>
  entry('ordering', ordering === DEFAULT_ORDERING ? null : ordering)

/** The URL's query: the tab (none for the ledger), then only that tab's state; defaults out. */
export function walletSearch(params: WalletParams): string {
  const { tab, ledger, withdrawals, history } = params
  const entries: Entry[] = entry('tab', tab === 'transactions' ? null : tab)
  if (tab === 'transactions') {
    entries.push(
      ...entry('direction', ledger.direction),
      ...entry('cause', ledger.cause),
      ...orderingEntry(ledger.ordering),
      ...entry('search', ledger.search),
      ...pageEntry(ledger.page),
    )
  } else if (tab === 'withdrawals') {
    entries.push(
      ...entry('status', withdrawals.status),
      ...orderingEntry(withdrawals.ordering),
      ...pageEntry(withdrawals.page),
      ...entry('focus', params.focus),
    )
  } else {
    entries.push(
      ...entry('status', history.status),
      ...entry('method', history.method),
      ...entry('applies_to', history.appliesTo),
      ...pageEntry(history.page),
    )
  }
  return toSearch(entries)
}

const query = (entries: Entry[], page: number): QueryInit => ({
  ...Object.fromEntries(entries),
  ...(page > 1 ? { page } : {}),
})

/** `GET wallet/transaction/list/`'s query. */
export const ledgerApiQuery = (ledger: LedgerParams): QueryInit =>
  query(
    [
      ...entry('direction', ledger.direction),
      ...entry('cause', ledger.cause),
      ...orderingEntry(ledger.ordering),
      ...entry('search', ledger.search),
    ],
    ledger.page,
  )

/** `GET wallet/withdrawal/list/`'s query. */
export const withdrawalsApiQuery = (withdrawals: WithdrawalsParams): QueryInit =>
  query(
    [...entry('status', withdrawals.status), ...orderingEntry(withdrawals.ordering)],
    withdrawals.page,
  )

/** `GET payment/history/`'s query. */
export const historyApiQuery = (history: HistoryParams): QueryInit =>
  query(
    [
      ...entry('status', history.status),
      ...entry('method', history.method),
      ...entry('applies_to', history.appliesTo),
    ],
    history.page,
  )
