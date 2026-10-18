'use client'

import { useQueryClient } from '@tanstack/react-query'
import { Banknote, Info } from 'lucide-react'
import dynamic from 'next/dynamic'
import { useEffect, useRef, useState } from 'react'
import { focusInsteadOfGone, useFocusWhenGone } from '@/features/orders/account/gone-trigger'
import { Button } from '@/components/ui/button'
import { useFeature } from '@/features/settings/feature-context'
import type { WalletBalance } from '@/lib/api/types/payment'
import type { WithdrawalRequest } from '@/lib/api/types/wallet'
import { fetchWithdrawals, OPEN_WITHDRAWAL_KEY, withdrawalsKey } from './api'
import type { CancelWithdrawalDialogProps } from './cancel-withdrawal-dialog'
import { OpenWithdrawal } from './open-withdrawal'
import { useWalletUrl } from './use-wallet-url'
import { walletAccess } from './wallet-access'
import { ORDERINGS, WITHDRAWAL_STATUSES } from './wallet-labels'
import { FilterSelect, ListEmpty, WalletList } from './wallet-list'
import { withdrawalsApiQuery, type WithdrawalsParams } from './wallet-params'
import { useOpenWithdrawal, useWithdrawals } from './wallet-queries'
import type { RefreshWallet } from './use-withdrawal-request'
import type { WithdrawalFormProps } from './withdrawal-form'
import { WithdrawalRow } from './withdrawal-row'

// «برداشت» (order digest §3.3.4–3.3.6, §7): the one open request first (with «لغو درخواست»
// while it is `requested`); a new request only without one and while the wallet allows it
// (`walletAccess`; the form is its own chunk, loaded on «درخواست برداشت جدید»), else why; then
// every request, filtered by status and ordered, in the URL. A ledger row's link brings its
// request forward (`focus`). Shown while the `wallet` switch is on, or while there is a request
// on record (the page decides): its list and an open one's cancel, never a new request.

function Unavailable() {
  return (
    <p role="alert" className="text-base leading-7 text-danger">
      این بخش بارگذاری نشد؛ صفحه را دوباره باز کنید.
    </p>
  )
}

const LazyWithdrawalForm = dynamic<WithdrawalFormProps>(
  () =>
    import('./withdrawal-form').then((module) => module.WithdrawalForm).catch(() => Unavailable),
  { ssr: false },
)

const LazyCancelDialog = dynamic<CancelWithdrawalDialogProps>(
  () =>
    import('./cancel-withdrawal-dialog')
      .then((module) => module.CancelWithdrawalDialog)
      .catch(() => Unavailable),
  { ssr: false },
)

const CARD = 'flex flex-col gap-4 rounded-card bg-white p-4 shadow-card md:p-5'

export interface WithdrawalsProps {
  wallet: WalletBalance
  /** `GET wallet/` again (the form's refusals about the minimum). */
  refreshWallet?: RefreshWallet
}

export function Withdrawals({ wallet, refreshWallet }: WithdrawalsProps) {
  const url = useWalletUrl()
  const { params } = url
  const filters = params.withdrawals
  const client = useQueryClient()
  const access = walletAccess({
    wallet: useFeature('wallet'),
    onlinePayment: useFeature('online_payment'),
    balance: wallet,
  })
  const open = useOpenWithdrawal()
  const query = withdrawalsApiQuery(filters)
  const list = useWithdrawals(query)
  const [formShown, setFormShown] = useState(false)
  const [closedReason, setClosedReason] = useState<string | null>(null)
  const [cancelling, setCancelling] = useState<WithdrawalRequest | null>(null)
  const [cancelOpen, setCancelOpen] = useState(false)

  // The request a ledger row points at: focused once its page is read; said when not on it.
  const target = useRef<HTMLDivElement>(null)
  const page = list.isPlaceholderData ? undefined : list.data
  const targetShown = !!params.focus && !!page?.results.some((row) => row.uuid === params.focus)
  const focused = useRef(false)
  useEffect(() => {
    if (focused.current || !targetShown) return
    focused.current = true
    target.current?.focus()
    target.current?.scrollIntoView?.({ block: 'center' })
  }, [targetShown])
  const targetMissing = !!params.focus && !!page && !targetShown

  const go = (next: Partial<WithdrawalsParams>) =>
    url.replace({ ...params, focus: null, withdrawals: { ...filters, page: 1, ...next } })
  const openRequest = open.data ?? null
  const note = closedReason ?? access.withdrawalNote

  // The focus never falls to <body>: a request just filed takes it (the form went); a
  // cancellation leaves it on the list's heading («لغو درخواست» went with it).
  const listHeading = useRef<HTMLHeadingElement>(null)
  const openHeading = useRef<HTMLHeadingElement>(null)
  const cancelButton = useRef<HTMLButtonElement>(null)
  useFocusWhenGone(openRequest?.status === 'requested', listHeading)
  const filed = useRef(false)
  useEffect(() => {
    if (!filed.current || !openRequest) return
    filed.current = false
    openHeading.current?.focus()
  }, [openRequest])

  return (
    <div className="flex flex-col gap-4">
      {openRequest && (
        <OpenWithdrawal
          request={openRequest}
          headingRef={openHeading}
          cancelRef={cancelButton}
          processingDays={wallet.withdrawal_processing_days}
          onCancel={() => {
            setCancelling(openRequest)
            setCancelOpen(true)
          }}
        />
      )}
      {!openRequest && open.isSuccess && (
        <section aria-label="درخواست برداشت جدید" className={CARD}>
          {access.withdrawalForm && !closedReason ? (
            formShown ? (
              <>
                <h2 className="text-lg leading-8 font-bold text-ink-900">درخواست برداشت جدید</h2>
                <LazyWithdrawalForm
                  wallet={wallet}
                  refreshWallet={refreshWallet}
                  onFiled={(request) => {
                    client.setQueryData(OPEN_WITHDRAWAL_KEY, request)
                    setFormShown(false)
                    filed.current = true
                  }}
                  onPendingExists={() => setFormShown(false)}
                  onClosed={(reason) => {
                    setClosedReason(reason)
                    setFormShown(false)
                  }}
                />
              </>
            ) : (
              <Button
                variant="outline"
                className="self-start"
                iconStart={<Banknote aria-hidden />}
                onClick={() => setFormShown(true)}
              >
                درخواست برداشت جدید
              </Button>
            )
          ) : (
            note && <p className="text-base leading-7 text-ink-800">{note}</p>
          )}
        </section>
      )}
      <section aria-labelledby="wallet-withdrawals-heading" className={CARD}>
        <h2
          ref={listHeading}
          tabIndex={-1}
          id="wallet-withdrawals-heading"
          className="rounded-control text-lg leading-8 font-bold text-ink-900 outline-none focus-visible:ring-4 focus-visible:ring-(--focus)"
        >
          درخواست‌های برداشت
        </h2>
        {targetMissing && (
          <p
            role="status"
            className="flex items-start gap-2 rounded-card bg-info/10 px-4 py-3 text-base leading-7"
          >
            <Info aria-hidden className="mt-1 size-5 shrink-0 text-info" />
            این درخواست برداشت در این صفحه نیست؛ آن را در صفحه‌های دیگر فهرست پیدا کنید.
          </p>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          <FilterSelect
            label="وضعیت"
            value={filters.status}
            options={WITHDRAWAL_STATUSES}
            all="همه"
            onChange={(status) => go({ status })}
          />
          <FilterSelect
            label="مرتب‌سازی"
            value={filters.ordering}
            options={ORDERINGS}
            onChange={(ordering) => ordering && go({ ordering })}
          />
        </div>
        <WalletList
          label="درخواست‌های برداشت"
          query={list}
          page={filters.page}
          readFirst={() => {
            const first = withdrawalsApiQuery({ ...filters, page: 1 })
            return client.fetchQuery({
              queryKey: withdrawalsKey(first),
              queryFn: ({ signal }) => fetchWithdrawals(first, signal),
            })
          }}
          goTo={(page) => url.replace({ ...params, withdrawals: { ...filters, page } })}
          hrefFor={(page) => url.href({ ...params, withdrawals: { ...filters, page } })}
          onFollowPage={url.followPage}
          errorMessage="درخواست‌های برداشت بارگذاری نشد."
          rowKey={(row) => row.uuid}
          row={(row) => (
            <WithdrawalRow
              request={row}
              focusRef={row.uuid === params.focus ? target : undefined}
            />
          )}
          empty={
            <ListEmpty>
              {filters.status
                ? 'درخواستی با این وضعیت ندارید.'
                : 'هنوز درخواست برداشتی ثبت نکرده\u{200C}اید.'}
            </ListEmpty>
          }
        />
      </section>
      {cancelling && (
        <LazyCancelDialog
          key={cancelling.uuid}
          request={cancelling}
          open={cancelOpen}
          onOpenChange={setCancelOpen}
          onCloseAutoFocus={(event) =>
            focusInsteadOfGone(event, cancelButton.current, listHeading.current)
          }
        />
      )}
    </div>
  )
}
