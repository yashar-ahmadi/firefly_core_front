'use client'

import { CalendarClock } from 'lucide-react'
import { Countdown } from '@/components/ui/countdown'
import { OrderCode } from '@/features/checkout/placed/order-code'
import type { CardTransferInstruction } from '@/lib/api/types/payment'
import { formatToman } from '@/lib/format'
import { formatJalaliDateTime } from '@/lib/format/date-time'
import { htmlToText } from '@/lib/html/to-text'
import { DestinationCard } from './destination-card'
import {
  AMOUNT_LABEL,
  CARDS_HEADING,
  DEADLINE_ATTEMPT,
  DEADLINE_ORDER,
  DEADLINE_ORDER_NOTE,
} from './transfer-copy'
import type { Cutoff } from './use-attempt-cutoff'

// What to transfer, where and by when (order digest §5.7 step 2): the amount (the payment's own,
// O, from the API), the order's code, the cut-off as far as it can truly be known (the attempt's
// own when the order's link could be read, else the order's deadline, said as such), the route's
// instruction and every active card of the shop. The instruction comes sanitised from the server
// (`instruction`: the payment step's catalog); when the server had none to give, the cards
// read's own text is shown as plain text, never as markup.

export interface TransferDetailsProps {
  data: CardTransferInstruction
  orderCode: string | null
  cutoff: Cutoff
  /** The server's sanitised instruction: null, nothing to show; undefined, not known there. */
  instruction: string | null | undefined
}

function Deadline({ cutoff }: { cutoff: NonNullable<Cutoff> }) {
  const attempt = cutoff.kind === 'attempt'
  return (
    <div className="flex flex-col gap-1">
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-base leading-7 text-ink-800">
        <CalendarClock aria-hidden className="size-5 shrink-0 text-ink-500" />
        <span>{attempt ? DEADLINE_ATTEMPT : DEADLINE_ORDER}</span>
        <time dateTime={cutoff.at} className="font-medium">
          {formatJalaliDateTime(cutoff.at)}
        </time>
        <span className="text-ink-600">
          (<Countdown endsAt={cutoff.at} className="tabular-nums" /> مانده)
        </span>
      </p>
      {!attempt && <p className="text-sm leading-6 text-ink-600">{DEADLINE_ORDER_NOTE}</p>}
    </div>
  )
}

export function TransferDetails({ data, orderCode, cutoff, instruction }: TransferDetailsProps) {
  const plain = instruction === undefined && data.instruction ? htmlToText(data.instruction) : ''
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-3 rounded-card bg-brand-50 p-4 md:p-5">
        <p className="flex flex-col gap-0.5">
          <span className="text-base leading-7 text-ink-700">{AMOUNT_LABEL}</span>
          <span className="text-2xl leading-10 font-bold text-ink-900 md:text-3xl">
            {formatToman(data.amount)}
          </span>
        </p>
        {orderCode && <OrderCode code={orderCode} />}
        {cutoff && <Deadline cutoff={cutoff} />}
      </div>
      {instruction ? (
        <div
          className="rich-content text-base leading-8 text-ink-800"
          dangerouslySetInnerHTML={{ __html: instruction }}
        />
      ) : (
        plain && <p className="text-base leading-8 text-ink-800">{plain}</p>
      )}
      <section aria-labelledby="transfer-cards-heading" className="flex flex-col gap-3">
        <h2 id="transfer-cards-heading" className="text-lg leading-8 font-bold text-ink-900">
          {CARDS_HEADING}
        </h2>
        <ul className="grid gap-3 lg:grid-cols-2">
          {data.destination_cards.map((card) => (
            <li key={card.id}>
              <DestinationCard card={card} />
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
