import { Landmark } from 'lucide-react'
import { SmartImage } from '@/components/ui/smart-image'
import type { BankCard } from '@/lib/api/types/payment'
import { toPersianDigits } from '@/lib/format/digits'
import { CopyValue } from './copy-value'

// One of the shop's cards to transfer to (order digest §2 `BankCard`, §5.7 step 2): the bank's
// name and logo (a bank icon when the API sends its placeholder), the holder, then the card
// number in groups of four, the sheba and the account number, each left to right in Persian
// digits with its own copy button (copied as the bare value: the digits, `IR…`). The model lets
// the card number be blank when a sheba or an account number exists: no row for it then.

/** The API's placeholder for a missing picture (`/static/defaults/default.png`). */
const isPlaceholder = (url: string | null) => !url || url.includes('/static/defaults/')

/** «6104-3378-1234-5678» → «6104337812345678». */
export const cardDigits = (cardNumber: string) => cardNumber.replace(/\D/g, '')

/** The sheba as copied: no spaces, upper case. */
export const shebaOf = (card: BankCard) => card.sheba.replace(/\s+/g, '').toUpperCase()

/**
 * What tells this card apart in a list: the card number's last four, else (a card with none)
 * the sheba's, else the account number's.
 */
export function cardTail(card: BankCard): { kind: 'card' | 'sheba' | 'account'; last: string } {
  const digits = cardDigits(card.card_number)
  if (digits) return { kind: 'card', last: digits.slice(-4) }
  const sheba = shebaOf(card).replace(/\D/g, '')
  if (sheba) return { kind: 'sheba', last: sheba.slice(-4) }
  return { kind: 'account', last: cardDigits(card.account_number).slice(-4) }
}

/** In groups of four from the start: «IR62 0120 0000 …», «6104 3378 1234 5678». */
const grouped = (value: string) => value.match(/.{1,4}/g)?.join(' ') ?? value

function BankLogo({ src }: { src: string | null }) {
  if (isPlaceholder(src)) {
    return (
      <span
        aria-hidden
        className="grid size-11 shrink-0 place-items-center rounded-full bg-brand-50 text-brand-700"
      >
        <Landmark className="size-5" />
      </span>
    )
  }
  return (
    <SmartImage
      src={src}
      alt=""
      width={44}
      height={44}
      className="size-11 shrink-0 rounded-full object-contain"
    />
  )
}

export function DestinationCard({ card }: { card: BankCard }) {
  const digits = cardDigits(card.card_number)
  const sheba = shebaOf(card)
  const headingId = `bank-card-${card.id}`
  return (
    <article
      aria-labelledby={headingId}
      className="flex flex-col gap-3 rounded-card border border-ink-200 bg-white p-4 md:p-5"
    >
      <div className="flex items-center gap-3">
        <BankLogo src={card.bank_logo_thumbnail} />
        <div className="flex min-w-0 flex-col">
          <h3 id={headingId} className="text-base leading-7 font-bold text-ink-900">
            {card.bank_name}
          </h3>
          <p className="text-sm leading-6 text-ink-700">{`به نام ${card.holder_name}`}</p>
        </div>
      </div>
      <div className="flex flex-col gap-2.5">
        {digits && (
          <CopyValue label="شماره کارت" value={digits} what={`شماره کارت ${card.bank_name}`} large>
            {toPersianDigits(grouped(digits))}
          </CopyValue>
        )}
        {sheba && (
          <CopyValue label="شماره شبا" value={sheba} what={`شماره شبای ${card.bank_name}`}>
            {toPersianDigits(grouped(sheba))}
          </CopyValue>
        )}
        {card.account_number && (
          <CopyValue
            label="شماره حساب"
            value={card.account_number}
            what={`شماره حساب ${card.bank_name}`}
          >
            {toPersianDigits(card.account_number)}
          </CopyValue>
        )}
      </div>
    </article>
  )
}
