'use client'

import { useQueryClient } from '@tanstack/react-query'
import Link from 'next/link'
import { buttonClasses } from '@/components/ui/button-styles'
import { fetchPayments, paymentsKey } from './api'
import { HistoryRow } from './history-row'
import { useWalletUrl } from './use-wallet-url'
import { APPLIES_TO, PAYMENT_METHODS, PAYMENT_STATUSES } from './wallet-labels'
import { FilterSelect, ListEmpty, WalletList } from './wallet-list'
import { historyApiQuery, type HistoryParams } from './wallet-params'
import { usePayments } from './wallet-queries'

// «تاریخچهٔ پرداخت» (order digest §3.2.9; dashboard digest §3.3): every payment of the account
// (each online leg, door collections, top-ups including the attempts that never settled,
// refunds), newest first; filtered by status, method and what it was for, in the URL, sent in the
// API's names. A row's detail opens in a sheet (`onShowPayment`). Not a wallet operation: shown
// whatever the switches say.

export function PaymentHistory({ onShowPayment }: { onShowPayment: (uuid: string) => void }) {
  const url = useWalletUrl()
  const { params } = url
  const filters = params.history
  const client = useQueryClient()
  const list = usePayments(historyApiQuery(filters))
  const go = (next: Partial<HistoryParams>) =>
    url.replace({ ...params, tab: 'history', history: { ...filters, page: 1, ...next } })
  const filtered = filters.status !== null || filters.method !== null || filters.appliesTo !== null
  const everything = url.href({
    ...params,
    tab: 'history',
    history: { status: null, method: null, appliesTo: null, page: 1 },
  })

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <FilterSelect
          label="وضعیت پرداخت"
          value={filters.status}
          options={PAYMENT_STATUSES}
          all="همه"
          onChange={(status) => go({ status })}
        />
        <FilterSelect
          label="روش پرداخت"
          value={filters.method}
          options={PAYMENT_METHODS}
          all="همه"
          onChange={(method) => go({ method })}
        />
        <FilterSelect
          label="مربوط به"
          value={filters.appliesTo}
          options={APPLIES_TO}
          all="همه"
          onChange={(appliesTo) => go({ appliesTo })}
        />
      </div>
      <WalletList
        label="پرداخت‌های حساب"
        query={list}
        page={filters.page}
        readFirst={() => {
          const first = historyApiQuery({ ...filters, page: 1 })
          return client.fetchQuery({
            queryKey: paymentsKey(first),
            queryFn: ({ signal }) => fetchPayments(first, signal),
          })
        }}
        goTo={(page) => url.replace({ ...params, history: { ...filters, page } })}
        hrefFor={(page) => url.href({ ...params, history: { ...filters, page } })}
        onFollowPage={url.followPage}
        errorMessage="تاریخچهٔ پرداخت بارگذاری نشد."
        rowKey={(payment) => payment.uuid}
        row={(payment) => <HistoryRow payment={payment} onShowPayment={onShowPayment} />}
        empty={
          filtered ? (
            <ListEmpty
              action={
                <Link
                  href={everything}
                  onClick={url.follow}
                  scroll={false}
                  prefetch={false}
                  className={buttonClasses({ variant: 'outline' })}
                >
                  همهٔ پرداخت‌ها
                </Link>
              }
            >
              پرداختی با این فیلترها پیدا نشد.
            </ListEmpty>
          ) : (
            <ListEmpty>هنوز پرداختی در حساب شما ثبت نشده است.</ListEmpty>
          )
        }
      />
    </div>
  )
}
