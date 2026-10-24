'use client'

import { useQueryClient } from '@tanstack/react-query'
import { Search } from 'lucide-react'
import Link from 'next/link'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { buttonClasses } from '@/components/ui/button-styles'
import { Input } from '@/components/ui/input'
import { toLatinDigits } from '@/lib/format/digits'
import { fetchLedger, ledgerKey } from './api'
import { TransactionRow } from './transaction-row'
import { useWalletUrl, WALLET_PATH } from './use-wallet-url'
import { CAUSES, DIRECTIONS, ORDERINGS } from './wallet-labels'
import { FilterSelect, ListEmpty, WalletList } from './wallet-list'
import { ledgerApiQuery, type LedgerParams } from './wallet-params'
import { useLedger } from './wallet-queries'

// «تراکنش‌ها», the ledger (order digest §3.3.2, §7; dashboard digest §3.3): money that actually
// moved, newest first unless ordered otherwise; filtered by direction and cause, ordered by date
// or amount, searched by an order code's start: the URL's state (a change replaces it and goes
// back to page 1; a search is a new history entry), sent in the API's names. Readable whatever
// the switches say. A row's link to its withdrawal request only while that tab is there.

const SEARCH_MAX = 10

export function TransactionsList({
  onShowPayment,
  withdrawalsTab,
}: {
  onShowPayment: (uuid: string) => void
  /** The withdrawals' tab is offered: a withdrawal's row links to its request there. */
  withdrawalsTab: boolean
}) {
  const url = useWalletUrl()
  const { params } = url
  const ledger = params.ledger
  const client = useQueryClient()
  const query = ledgerApiQuery(ledger)
  const list = useLedger(query)
  const [text, setText] = useState(ledger.search)
  const [seen, setSeen] = useState(ledger.search)
  if (seen !== ledger.search) {
    setSeen(ledger.search)
    setText(ledger.search)
  }
  const go = (next: Partial<LedgerParams>, push = false) => {
    const target = {
      ...params,
      tab: 'transactions' as const,
      ledger: { ...ledger, page: 1, ...next },
    }
    if (push) url.push(target)
    else url.replace(target)
  }
  const filtered = ledger.direction !== null || ledger.cause !== null || ledger.search !== ''

  return (
    <div className="flex flex-col gap-4">
      <form
        role="search"
        aria-label="جستجو در تراکنش‌ها"
        method="get"
        action={WALLET_PATH}
        className="flex gap-2"
        onSubmit={(event) => {
          event.preventDefault()
          go({ search: toLatinDigits(text).replace(/\D/g, '').slice(0, SEARCH_MAX) }, true)
        }}
      >
        <Input
          type="search"
          name="search"
          inputMode="numeric"
          aria-label="جستجو با کد سفارش"
          placeholder="ابتدای کد سفارش"
          maxLength={SEARCH_MAX}
          value={text}
          onChange={(event) => setText(event.currentTarget.value)}
          startAdornment={<Search aria-hidden />}
          className="min-w-0 flex-1"
        />
        <Button type="submit" variant="outline">
          جستجو
        </Button>
      </form>
      <div className="grid gap-3 sm:grid-cols-3">
        <FilterSelect
          label="نوع تراکنش"
          value={ledger.direction}
          options={DIRECTIONS}
          all="همه"
          onChange={(direction) => go({ direction })}
        />
        <FilterSelect
          label="علت"
          value={ledger.cause}
          options={CAUSES}
          all="همه"
          onChange={(cause) => go({ cause })}
        />
        <FilterSelect
          label="مرتب‌سازی"
          value={ledger.ordering}
          options={ORDERINGS}
          onChange={(ordering) => ordering && go({ ordering })}
        />
      </div>
      <WalletList
        label="تراکنش‌های کیف پول"
        query={list}
        page={ledger.page}
        readFirst={() => {
          const first = ledgerApiQuery({ ...ledger, page: 1 })
          return client.fetchQuery({
            queryKey: ledgerKey(first),
            queryFn: ({ signal }) => fetchLedger(first, signal),
          })
        }}
        goTo={(page) => url.replace({ ...params, ledger: { ...ledger, page } })}
        hrefFor={(page) => url.href({ ...params, ledger: { ...ledger, page } })}
        onFollowPage={url.followPage}
        errorMessage="تراکنش‌های کیف پول بارگذاری نشد."
        rowKey={(row) => `${row.created}-${row.cause}-${row.amount}-${row.balance_after}`}
        row={(row) => (
          <TransactionRow
            row={row}
            onShowPayment={onShowPayment}
            withdrawalHref={
              withdrawalsTab
                ? (uuid) => url.href({ ...params, tab: 'withdrawals', focus: uuid })
                : undefined
            }
            onFollow={url.follow}
          />
        )}
        empty={
          filtered ? (
            <ListEmpty
              action={
                <Link
                  href={WALLET_PATH}
                  onClick={url.follow}
                  scroll={false}
                  prefetch={false}
                  className={buttonClasses({ variant: 'outline' })}
                >
                  همهٔ تراکنش‌ها
                </Link>
              }
            >
              تراکنشی با این فیلترها پیدا نشد.
            </ListEmpty>
          ) : (
            <ListEmpty>هنوز تراکنشی در کیف پول شما ثبت نشده است.</ListEmpty>
          )
        }
      />
    </div>
  )
}
