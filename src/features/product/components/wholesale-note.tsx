import { Phone } from 'lucide-react'
import { formatIranMobile, formatNumber } from '@/lib/format'

export interface WholesaleNoteProps {
  /** The variant's `major_min_order_limit`; null leaves the count out. */
  minOrder: number | null
  /** The shop's phone (E.164, from the settings); null leaves the link out. */
  phone: string | null
}

/**
 * For a product with wholesale on (`enable_major`): an invitation to call. Wholesale prices are
 * never shown, since checkout never charges them (spec ruling, product digest §5.4).
 */
export function WholesaleNote({ minOrder, phone }: WholesaleNoteProps) {
  const from = minOrder !== null && minOrder > 0 ? ` (از ${formatNumber(minOrder)} عدد)` : ''
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-control bg-info/10 px-3 py-2 text-base text-ink-800">
      <p>{`برای خرید عمده${from} با ما تماس بگیرید`}</p>
      {phone && (
        <a
          href={`tel:${phone}`}
          className="inline-flex min-h-11 items-center gap-1.5 font-bold text-info hover:underline"
        >
          <Phone aria-hidden className="size-4" />
          <span dir="ltr">{formatIranMobile(phone)}</span>
        </a>
      )}
    </div>
  )
}
