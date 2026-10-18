'use client'

import { Truck } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { cn } from '@/components/ui/cn'
import { RadioGroupItem } from '@/components/ui/radio-group'
import type { ShippingOption } from '@/lib/api/types/shipping'
import { formatToman } from '@/lib/format'
import {
  COLLECT_AT_DOOR,
  collectedAtDoor,
  costLabel,
  etaLabel,
  prepaymentNote,
} from './shipping-labels'

// One shipping option of the radio group (cart digest §6.7): its title (the API sends no carrier
// logo: a truck stands in), «پس‌کرایه» for a fare collected at the door, its cost from `total`,
// the delivery time, the prepayment note, an unavailable option's reason (and no price), and on
// the chosen one the COD box when the method and the shop offer it.

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
          {option.supports_cash_on_delivery && <span>امکان پرداخت در محل</span>}
        </>
      ) : (
        option.reason && <span className="font-medium text-warning">{option.reason}</span>
      )}
    </span>
  )
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
  const showCod = chosen && option.is_available && option.supports_cash_on_delivery && codOffered
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
          description={
            option.cod_max_amount === null
              ? 'مبلغ کالاها هنگام تحویل پرداخت می\u{200C}شود.'
              : `مبلغ کالاها هنگام تحویل پرداخت می\u{200C}شود؛ تا سقف ${formatToman(option.cod_max_amount)}.`
          }
          checked={cashOnDelivery}
          disabled={busy}
          onCheckedChange={(checked) => onCashOnDelivery(checked === true)}
        />
      )}
    </div>
  )
}
