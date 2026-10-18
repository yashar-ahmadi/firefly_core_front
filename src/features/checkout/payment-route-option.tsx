'use client'

import { ArrowLeftRight, CreditCard, HandCoins, Wallet, WalletCards } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '@/components/ui/cn'
import { SmartImage } from '@/components/ui/smart-image'
import type { PaymentMethodView } from '@/features/payment/catalog'
import type { RouteChoice } from '@/features/payment/routes'
import type { PaymentRoute } from '@/lib/api/types/payment'
import { formatToman } from '@/lib/format'
import { isPlaceholder, routeLabel } from './route-label'
import { STEP_CONTROLS } from './step-controls'

const { RadioGroupItem } = STEP_CONTROLS

// One payment route of the radio group (order digest §5.3): its icon (the operator's, or one
// for the route while the API sends its placeholder), label and description (operator HTML,
// sanitised on the server), and under it what the shopper must know: a disabled route's reason
// (part of its description, so it is read out with it), the wallet's balance, the wallet and
// bank parts of a split payment, the chosen route's instruction.

const ICONS: Record<PaymentRoute, typeof Wallet> = {
  bank_gateway: CreditCard,
  wallet: Wallet,
  wallet_and_gateway: WalletCards,
  card_transfer: ArrowLeftRight,
  pay_on_delivery: HandCoins,
}

export function RouteIcon({ choice }: { choice: RouteChoice<PaymentMethodView> }) {
  const icon = choice.method?.icon
  if (icon && !isPlaceholder(icon)) {
    return <SmartImage src={icon} alt="" width={28} height={28} className="size-7 object-contain" />
  }
  const Icon = ICONS[choice.route]
  return <Icon aria-hidden className="size-6 shrink-0 text-brand-600" />
}

function Html({ html }: { html: string }) {
  // Sanitised on the server (src/features/payment/catalog.ts).
  return <span className="rich-content-inline" dangerouslySetInnerHTML={{ __html: html }} />
}

function Details({
  choice,
  chosen,
  balance,
}: {
  choice: RouteChoice<PaymentMethodView>
  chosen: boolean
  balance: number | null
}) {
  const { method, split } = choice
  const lines: ReactNode[] = []
  if (method?.description) lines.push(<Html key="description" html={method.description} />)
  if (!choice.enabled && choice.reason) {
    lines.push(
      <span key="reason" className="font-medium text-warning">
        {choice.reason}
      </span>,
    )
  }
  if (choice.enabled && choice.route === 'wallet' && balance !== null) {
    lines.push(<span key="balance">{`موجودی کیف پول: ${formatToman(balance)}`}</span>)
  }
  if (choice.enabled && split) {
    lines.push(
      <span key="split" className="flex flex-col font-medium text-ink-700">
        <span>{`از کیف پول: ${formatToman(split.wallet)} (تا تأیید بانک کنار گذاشته می\u{200C}شود)`}</span>
        <span>{`از درگاه بانکی: ${formatToman(split.gateway)}`}</span>
      </span>,
    )
  }
  if (chosen && choice.enabled && method?.instruction) {
    lines.push(<Html key="instruction" html={method.instruction} />)
  }
  return lines.length ? <span className="flex flex-col gap-0.5">{lines}</span> : null
}

export interface PaymentRouteOptionProps {
  choice: RouteChoice<PaymentMethodView>
  chosen: boolean
  balance: number | null
  /** A payment is on its way: nothing else can be chosen. */
  busy: boolean
  /** The gateway chooser, under the chosen bank route. */
  children?: ReactNode
}

export function PaymentRouteOption({
  choice,
  chosen,
  balance,
  busy,
  children,
}: PaymentRouteOptionProps) {
  return (
    <div
      data-route={choice.route}
      className={cn(
        'rounded-card border border-ink-500 bg-white px-4 py-2 transition-colors',
        'has-data-[state=checked]:border-brand has-data-[state=checked]:bg-brand-50 has-data-[state=checked]:ring-1 has-data-[state=checked]:ring-brand',
        !choice.enabled && 'border-ink-200 bg-ink-50',
      )}
    >
      <RadioGroupItem
        value={choice.route}
        disabled={!choice.enabled || (busy && !chosen)}
        label={
          <span className="flex items-center gap-2">
            <RouteIcon choice={choice} />
            <span dir="auto" className="font-bold text-ink-900">
              {routeLabel(choice)}
            </span>
          </span>
        }
        description={<Details choice={choice} chosen={chosen} balance={balance} />}
      />
      {children}
    </div>
  )
}
