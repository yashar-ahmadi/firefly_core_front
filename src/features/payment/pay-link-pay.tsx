'use client'

import { CircleAlert } from 'lucide-react'
import dynamic from 'next/dynamic'
import { SupportPhone } from '@/components/layout/support-phone'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { PaymentSection } from '@/features/checkout/lazy-steps'
import type { BankHandoffProps } from '@/features/checkout/placed/bank-handoff'
import { payLinkPath } from '@/features/orders/pay-link'
import { BANK_UNUSABLE, intentMessage } from './intent-messages'
import type { useLinkPayment } from './use-link-payment'
import type { PaymentCatalogState } from './use-payment-catalog'
import type { RouteChoiceState } from './use-route-choice'

// The payment link's routes (order digest §5.3 with the link's amounts: O owed online, D at the
// door): the same route rules and radio group as the checkout (`availableRoutes`,
// PaymentSection), «ورود برای استفاده از کیف پول» for a guest (back to this page after the
// login), and one press. Nothing owed online (a pure pay-on-delivery order awaiting its
// confirmation): no chooser, «تأیید سفارش» alone. A refusal is said over the routes (the bank
// unusable here: with the support line); a bank takes over the section while it loads.

// The radio group and the bank's screen stay out of the page's own entry, as on the checkout
// (the routes are the checkout's own lazy payment step: the same chunk): a radio group imported
// by a route entry regroups the shop's shared chunks (+0.4 KB on every catalog page, measured).
const BankHandoff = dynamic<BankHandoffProps>(() =>
  import('@/features/checkout/placed/bank-handoff')
    .then((module) => module.BankHandoff)
    .catch(() => HandoffUnavailable),
)

/** Its code could not load: the manual way to the bank all the same. */
function HandoffUnavailable({ onGo }: BankHandoffProps) {
  return (
    <div role="alert" className="flex flex-col items-start gap-3 text-base leading-7 text-ink-800">
      <span>انتقال خودکار به درگاه انجام نشد.</span>
      <Button onClick={onGo}>انتقال به درگاه</Button>
    </div>
  )
}

export interface PayLinkPayProps {
  token: string
  choice: RouteChoiceState
  catalog: PaymentCatalogState
  onDelivery: number
  payment: ReturnType<typeof useLinkPayment>
  supportPhone: string | null
}

export function PayLinkPay({
  token,
  choice,
  catalog,
  onDelivery,
  payment,
  supportPhone,
}: PayLinkPayProps) {
  const { state } = payment
  if (state.phase === 'redirecting' && state.handoff) {
    return (
      <BankHandoff
        handoff={state.handoff}
        loadFailed={state.bankLoadFailed}
        onGo={payment.goToBankAgain}
        onExpired={payment.reset}
      />
    )
  }
  const { error } = state
  const confirmOnly = choice.routes.length === 1 && choice.routes[0]!.route === 'pay_on_delivery'
  const bankGone =
    error?.problem === 'gateway_broken' ||
    (error?.problem === 'gateway_refresh' && catalog.gateways.length === 0)
  const busy = state.phase === 'paying'
  return (
    <div className="flex flex-col gap-4">
      {error && (
        <div role="alert" className="flex flex-col gap-2 rounded-card bg-danger/10 px-4 py-3">
          <p className="flex items-start gap-2 text-base leading-7 font-medium text-ink-900">
            <CircleAlert aria-hidden className="mt-1 size-5 shrink-0 text-danger" />
            <span>{bankGone ? BANK_UNUSABLE : intentMessage(error)}</span>
          </p>
          {bankGone && supportPhone && (
            <SupportPhone phone={supportPhone} label="پشتیبانی" iconLabel="تماس با پشتیبانی" />
          )}
        </div>
      )}
      <PaymentSection
        choice={choice}
        onDelivery={onDelivery}
        catalog={catalog}
        busy={busy}
        loginNext={payLinkPath(token)}
        placed
        footer={
          <Button
            size="lg"
            className="sm:self-start"
            disabled={!choice.chosen}
            aria-disabled={busy || undefined}
            aria-busy={busy || undefined}
            iconStart={busy ? <Spinner size="sm" /> : undefined}
            onClick={() => {
              if (choice.chosen) void payment.pay(choice.chosen.route, choice.gatewayCode)
            }}
          >
            {confirmOnly ? 'تأیید سفارش' : 'پرداخت سفارش'}
          </Button>
        }
      />
    </div>
  )
}
