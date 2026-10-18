'use client'

import { HandCoins, LogIn, TriangleAlert } from 'lucide-react'
import Link from 'next/link'
import type { ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { buttonClasses } from '@/components/ui/button-styles'
import { cn } from '@/components/ui/cn'
import type { PaymentCatalogState } from '@/features/payment/use-payment-catalog'
import type { RouteChoiceState } from '@/features/payment/use-route-choice'
import type { PaymentRoute } from '@/lib/api/types/payment'
import { formatToman } from '@/lib/format'
import { loginHref } from '@/lib/links/login'
import { GatewayChooser } from './gateway-chooser'
import { PaymentRouteOption } from './payment-route-option'
import { STEP_CONTROLS } from './step-controls'

const { RadioGroup } = STEP_CONTROLS

// «پرداخت» (order digest §5.3): the routes the rules allow for these amounts as a radio group
// (disabled ones with their reason), the bank's gateways under the chosen bank route when there
// is more than one, «ورود برای استفاده از کیف پول» for a guest; with nothing owed online, no
// chooser: the order is confirmed and paid at the door. Before placement for the cart, after it
// for the order (placed-order.tsx).

export interface PaymentSectionProps {
  choice: RouteChoiceState
  /** Nothing owed online: a confirmation, not a choice (D, at the door). */
  onDelivery: number
  /** The shop's lists (null methods: the server could not read them; «تلاش دوباره»). */
  catalog: Pick<PaymentCatalogState, 'methods' | 'retry' | 'retrying'>
  /** A payment is on its way. */
  busy?: boolean
  /** Said when the shopper chooses (the step stays open, say). */
  onChoose?: (route: PaymentRoute) => void
  /** After a login, back here. */
  loginNext?: string
  footer?: ReactNode
}

function Note({ tone, children }: { tone: 'info' | 'warning'; children: ReactNode }) {
  return (
    <p
      className={
        tone === 'warning'
          ? 'flex items-start gap-2 rounded-card bg-warning/10 px-4 py-3 text-base leading-7 text-ink-800'
          : 'flex items-start gap-2 rounded-card bg-brand-50 px-4 py-3 text-base leading-7 text-ink-800'
      }
    >
      {tone === 'warning' ? (
        <TriangleAlert aria-hidden className="mt-1 size-5 shrink-0 text-warning" />
      ) : (
        <HandCoins aria-hidden className="mt-1 size-5 shrink-0 text-brand-600" />
      )}
      <span>{children}</span>
    </p>
  )
}

export function PaymentSection({
  choice,
  onDelivery,
  catalog,
  busy = false,
  onChoose,
  loginNext = '/checkout/',
  footer,
}: PaymentSectionProps) {
  const { routes, chosen } = choice
  if (catalog.methods === null) {
    return (
      <div className="flex flex-col items-start gap-3">
        <Note tone="warning">{'روش\u{200C}های پرداخت بارگذاری نشد.'}</Note>
        <Button variant="outline" loading={catalog.retrying} onClick={() => void catalog.retry()}>
          تلاش دوباره
        </Button>
      </div>
    )
  }
  const only = routes.length === 1 && routes[0]!.route === 'pay_on_delivery' ? routes[0]! : null
  if (only) {
    return (
      <div className="flex flex-col gap-3">
        {only.enabled ? (
          <Note tone="info">
            {onDelivery > 0
              ? `پرداخت آنلاینی لازم نیست: سفارش پس از ثبت تأیید می\u{200C}شود و ${formatToman(onDelivery)} هنگام تحویل پرداخت می\u{200C}شود.`
              : 'این سفارش رایگان است: پس از ثبت تأیید می\u{200C}شود.'}
          </Note>
        ) : (
          <Note tone="warning">{only.reason}</Note>
        )}
        {footer}
      </div>
    )
  }
  return (
    <div className="flex flex-col gap-3">
      {routes.length === 0 && (
        <Note tone="warning">{'روشی برای پرداخت این مبلغ در دسترس نیست.'}</Note>
      )}
      {choice.stale && (
        <Note tone="warning">
          {'روش پرداخت انتخابی شما برای این مبلغ دیگر در دسترس نیست؛ روش دیگری انتخاب کنید.'}
        </Note>
      )}
      {routes.length > 0 && (
        <RadioGroup
          aria-label={'روش\u{200C}های پرداخت'}
          aria-busy={busy || undefined}
          value={chosen?.route ?? ''}
          onValueChange={(route) => {
            choice.choose(route as PaymentRoute)
            onChoose?.(route as PaymentRoute)
          }}
          className="gap-3"
        >
          {routes.map((route) => {
            const isChosen = route.route === chosen?.route
            return (
              <PaymentRouteOption
                key={route.route}
                choice={route}
                chosen={isChosen}
                balance={choice.balance}
                busy={busy}
              >
                {isChosen && (
                  <GatewayChooser
                    gateways={route.gateways}
                    value={choice.gateway}
                    onChange={choice.chooseGateway}
                    disabled={busy}
                  />
                )}
              </PaymentRouteOption>
            )
          })}
        </RadioGroup>
      )}
      {choice.walletLogin && (
        <Link
          href={loginHref(loginNext)}
          prefetch={false}
          className={cn(buttonClasses({ variant: 'outline', size: 'sm' }), 'self-start')}
        >
          <LogIn aria-hidden />
          ورود برای استفاده از کیف پول
        </Link>
      )}
      {footer}
    </div>
  )
}
