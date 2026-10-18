'use client'

import { useQueryClient } from '@tanstack/react-query'
import { RefreshCw } from 'lucide-react'
import Link from 'next/link'
import { useEffect, useMemo, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { announce } from '@/components/ui/live-announcer'
import { Spinner } from '@/components/ui/spinner'
import { useHydrated, usePrefersReducedMotion } from '@/components/ui/use-media-query'
import { OrderCode } from '@/features/checkout/placed/order-code'
import { formatToman } from '@/lib/format'
import { useSession } from '@/lib/session/session-context'
import { SUMMARY_KEY, WALLET_KEY } from '@/lib/session/viewer-queries'
import { getPending, removePending } from './pending-payments'
import { ResultActions, type SupportLine } from './result-actions'
import { CHECKING, INVALID_RETURN, resultCopy, STOPPED, UNREADABLE } from './result-copy'
import type { ResultCopy } from './result-copy'
import { ResultIcon } from './result-icon'
import { readReturn, rememberReturn, scrubbedPath, type PaymentReturn } from './result-return'
import { usePayAgain } from './use-pay-again'
import { usePaymentStatus, type PaymentStatusState } from './use-payment-status'
import { useWalletBalance } from './use-wallet'

// `/payment/callback/`, where the bank's return lands (order digest §4.2, §5.10–5.12), for an
// order's payment and a wallet top-up alike. The truth is the payment's status, read under the
// polling policy (usePaymentStatus); the return's `result` and `code` only choose the words
// (resultCopy), so nothing is claimed before the status says it (Review Focus #3). The payment's
// uuid is read from the address once the page runs, kept for this tab and taken out of the
// address bar (result-return.ts); nothing here logs it. The heading takes the focus on arrival;
// later changes are said once, politely. A payment that went through forgets its pending entry,
// reads the account's figures again and throws a little confetti (never under reduced motion).

export interface PaymentResultPageProps {
  support: SupportLine | null
}

function pickCopy(ret: PaymentReturn | null, status: PaymentStatusState): ResultCopy {
  if (ret === null) return CHECKING
  if (!ret.payment) return INVALID_RETURN
  if (status.unreadable) return UNREADABLE
  if (!status.info) return CHECKING
  const copy = resultCopy({ ...status.info, result: ret.result }, ret.code)
  return status.stopped && copy.tone === 'pending' ? STOPPED : copy
}

export function PaymentResultPage({ support }: PaymentResultPageProps) {
  const hydrated = useHydrated()
  // Read once the page runs in the browser (the server's HTML never holds the uuid).
  const ret = useMemo(() => (hydrated ? readReturn(window.location) : null), [hydrated])
  useEffect(() => {
    if (!ret?.payment) return
    rememberReturn(ret)
    // Out of the address bar and this tab's history; Next keeps its router in step (the native
    // History API). Once, right after hydration: no navigation of this page is under way yet.
    window.history.replaceState(null, '', scrubbedPath(ret))
  }, [ret])

  const { hasSession } = useSession()
  const client = useQueryClient()
  const reducedMotion = usePrefersReducedMotion()
  const uuid = ret?.payment ?? null
  const status = usePaymentStatus(uuid)
  const { info } = status
  const pending = useMemo(() => (uuid ? getPending(uuid) : null), [uuid])
  const copy = pickCopy(ret, status)
  const orderCode = info?.order_code ?? null
  const payAgain = usePayAgain({ orderCode, pending, hasSession })
  const topUpSettled = info?.status === 'settled' && info.applies_to === 'wallet_topup'
  const balance = useWalletBalance(topUpSettled)

  const heading = useRef<HTMLHeadingElement>(null)
  useEffect(() => heading.current?.focus(), [])
  // Said once per change; the first words are read with the heading's focus.
  const said = useRef<string | null>(null)
  const words = `${copy.title}. ${copy.body}`
  useEffect(() => {
    if (said.current !== null && said.current !== words) announce(words)
    said.current = words
  }, [words])

  const celebrated = useRef<string | null>(null)
  useEffect(() => {
    if (!uuid || info?.status !== 'settled' || celebrated.current === uuid) return
    celebrated.current = uuid
    removePending(uuid)
    void client.invalidateQueries({ queryKey: SUMMARY_KEY })
    if (info.applies_to === 'wallet_topup' || pending?.route === 'wallet_and_gateway')
      void client.invalidateQueries({ queryKey: WALLET_KEY })
    if (!reducedMotion)
      void import('./confetti').then((module) => module.burstConfetti()).catch(() => undefined)
  }, [uuid, info, pending, client, reducedMotion])

  return (
    <section
      aria-labelledby="payment-result-heading"
      aria-busy={copy === CHECKING || undefined}
      className="mx-auto flex w-full max-w-2xl flex-col items-center gap-5 rounded-card bg-white px-5 py-8 text-center shadow-card md:px-10 md:py-12"
    >
      <ResultIcon tone={copy.tone} />
      <div className="flex flex-col gap-2">
        <h1
          ref={heading}
          id="payment-result-heading"
          tabIndex={-1}
          className="text-xl leading-9 font-bold text-ink-900 outline-none md:text-2xl md:leading-10"
        >
          {copy.title}
        </h1>
        <p className="text-base leading-8 text-ink-800 md:text-lg">{copy.body}</p>
        {copy.tone === 'pending' && ret?.payment && (
          <p className="text-sm leading-6 text-ink-600">
            {'این صفحه نتیجه را خودکار دوباره بررسی می\u{200C}کند؛ لازم نیست آن را تازه کنید.'}
          </p>
        )}
      </div>
      {info && (
        <div className="flex flex-col items-center gap-2">
          {orderCode && <OrderCode code={orderCode} />}
          <p className="text-base leading-7 text-ink-700">
            {'مبلغ: '}
            <span className="font-bold text-ink-900">{formatToman(info.amount)}</span>
          </p>
          {topUpSettled && balance.data && (
            <p className="text-base leading-7 text-ink-700">
              {'موجودی کیف پول: '}
              <span className="font-bold text-ink-900">{formatToman(balance.data.balance)}</span>
            </p>
          )}
          {copy.reference && (
            <p className="flex flex-wrap items-center justify-center gap-x-2 text-sm leading-6 text-ink-700">
              <span>شناسهٔ پرداخت برای پشتیبانی:</span>
              <bdi dir="ltr" className="font-mono break-all text-ink-900 select-all">
                {info.uuid}
              </bdi>
            </p>
          )}
        </div>
      )}
      {copy === STOPPED && (
        <Button
          variant="outline"
          aria-disabled={status.reading || undefined}
          aria-busy={status.reading || undefined}
          iconStart={status.reading ? <Spinner /> : <RefreshCw aria-hidden />}
          onClick={status.check}
        >
          بررسی دوباره
        </Button>
      )}
      <ResultActions
        actions={copy.actions}
        orderCode={orderCode}
        hasSession={hasSession}
        linkToken={payAgain.linkToken}
        payAgain={payAgain}
        support={support}
      />
      <Link
        href="/"
        className="inline-flex min-h-11 items-center text-base font-medium text-brand-700 hover:underline"
      >
        بازگشت به فروشگاه
      </Link>
    </section>
  )
}
