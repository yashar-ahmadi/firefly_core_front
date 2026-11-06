'use client'

import { Truck } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/components/ui/cn'
import type { ShippingOption } from '@/lib/api/types/shipping'
import { formatToman } from '@/lib/format'
import {
  COLLECT_AT_DOOR,
  collectedAtDoor,
  costLabel,
  etaLabel,
  prepaymentNote,
} from './shipping-labels'
import { STEP_CONTROLS } from './step-controls'

const { Checkbox, RadioGroupItem } = STEP_CONTROLS

// One shipping option of the radio group (cart digest §6.7): its title (the API sends no carrier
// logo: a truck stands in), «پس‌کرایه» for a fare collected at the door, its cost from `total`,
// the delivery time, the prepayment note, an unavailable option's reason (and no price), and on
// the chosen one the COD box when the method and the shop offer it. Whether this cart may pay
// this option at the door is the API's verdict (`cash_on_delivery_available`, digest §3.9), never
// a comparison made here: refused for this cart (the door ceiling, nothing online with the shop's
// «پرداخت در محل» method off), the box stays, disabled, with why (the ceiling named).

export interface ShippingOptionRowProps {
  option: ShippingOption
  /** The chosen option: its COD box shows here. */
  chosen: boolean
  /** Pay on delivery is on for this shop (`pay_on_delivery`). */
  codOffered: boolean
  cashOnDelivery: boolean
  onCashOnDelivery: (cod: boolean) => void
  /** A choice is on its way, or a 429's wait runs: nothing is sent. */
  busy: boolean
}

function Details({ option }: { option: ShippingOption }) {
  const eta = etaLabel(option.delivery_min_days, option.delivery_max_days)
  const prepayment = prepaymentNote(option)
  return (
    <span className="flex flex-col gap-0.5">
      {option.description && <span>{option.description}</span>}
      {option.is_available ? (
        <>
          {eta && <span className="font-medium text-ink-700">{eta}</span>}
          {collectedAtDoor(option) && (
            <span>{'کرایه\u{0654} حمل هنگام تحویل از گیرنده دریافت می\u{200C}شود.'}</span>
          )}
          {prepayment && <span>{prepayment}</span>}
          {codAvailable(option) && <span>امکان پرداخت در محل</span>}
        </>
      ) : (
        option.reason && <span className="font-medium text-warning">{option.reason}</span>
      )}
    </span>
  )
}

/**
 * The API's verdict on this cart paying this option at the door; an API older than the verdict
 * sends none, and the method's own flag stands in (its select still refuses what it must).
 */
function codAvailable(option: ShippingOption): boolean {
  return option.cash_on_delivery_available ?? option.supports_cash_on_delivery
}

/** The COD box's sentence: what it means, or why this cart cannot have it with this option. */
function codNote(option: ShippingOption): string {
  const cap = option.cod_max_amount
  if (codAvailable(option)) {
    return cap === null
      ? 'مبلغ کالاها هنگام تحویل پرداخت می\u{200C}شود.'
      : `مبلغ کالاها هنگام تحویل پرداخت می\u{200C}شود؛ تا سقف ${formatToman(cap)}.`
  }
  if (option.cash_on_delivery_refusal === 'cart_cod_limit_exceeded' && cap !== null) {
    return `مبلغ پرداخت در محل این سفارش از سقف ${formatToman(cap)} بیشتر است؛ با پرداخت آنلاین ادامه دهید.`
  }
  if (option.cash_on_delivery_refusal === 'cart_cod_route_disabled') {
    return 'پرداخت کامل سفارش هنگام تحویل اکنون ممکن نیست؛ با پرداخت آنلاین ادامه دهید.'
  }
  return 'پرداخت در محل برای این سفارش با این روش ارسال ممکن نیست.'
}

export function ShippingOptionRow({
  option,
  chosen,
  codOffered,
  cashOnDelivery,
  onCashOnDelivery,
  busy,
}: ShippingOptionRowProps) {
  const cost = costLabel(option)
  // The method collects at the door and the shop offers it (a switch the list may know is off
  // before this page does): the box shows, ticked only where the API says this cart may.
  const showCod =
    chosen &&
    option.is_available &&
    option.supports_cash_on_delivery &&
    codOffered &&
    option.cash_on_delivery_refusal !== 'feature_disabled'
  // Refused for this cart: never ticked here (a tick on its way may still be taken back).
  const codLocked = busy || (!codAvailable(option) && !cashOnDelivery)
  return (
    <div
      data-option={option.code}
      className={cn(
        'rounded-card border border-ink-500 bg-white px-4 py-2 transition-colors',
        'has-data-[state=checked]:border-brand has-data-[state=checked]:bg-brand-50 has-data-[state=checked]:ring-1 has-data-[state=checked]:ring-brand',
        !option.is_available && 'border-ink-200 bg-ink-50',
      )}
    >
      <RadioGroupItem
        value={option.code}
        disabled={!option.is_available || (busy && !chosen)}
        label={
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <Truck aria-hidden className="size-5 shrink-0 text-brand-600" />
            <span dir="auto" className="font-bold text-ink-900">
              {option.title}
            </span>
            {collectedAtDoor(option) && (
              <Badge tone="info" size="sm">
                {COLLECT_AT_DOOR}
              </Badge>
            )}
            {/* At the row's end (under the title on a narrow phone): the description keeps the
                card's whole width. */}
            {cost && (
              <span className="ms-auto font-bold whitespace-nowrap text-ink-900 tabular-nums">
                {cost}
              </span>
            )}
          </span>
        }
        description={<Details option={option} />}
      />
      {showCod && (
        <Checkbox
          className="ms-9 border-t border-brand-100"
          label={`پرداخت در محل (هزینه\u{0654} ${formatToman(option.cod_fee)})`}
          description={codNote(option)}
          checked={cashOnDelivery}
          disabled={codLocked}
          onCheckedChange={(checked) => onCashOnDelivery(checked === true)}
        />
      )}
    </div>
  )
}
