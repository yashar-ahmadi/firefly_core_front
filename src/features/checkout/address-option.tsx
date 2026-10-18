import { BadgeCheck } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import type { Address } from '@/lib/api/types/cart'
import { formatIranMobile, toPersianDigits } from '@/lib/format'

// One saved address as a radio of the checkout's address picker: its title (and «پیش‌فرض») as the
// label, the receiver, the whole address and the postal code as its description. The visitor's
// own text, rendered as text.

export function AddressLabel({ address }: { address: Address }) {
  return (
    <span className="flex flex-wrap items-center gap-2">
      <span dir="auto" className="font-bold text-ink-900">
        {address.title}
      </span>
      {address.is_default && (
        <Badge tone="brand" size="sm">
          <BadgeCheck aria-hidden />
          پیش‌فرض
        </Badge>
      )}
    </span>
  )
}

export function AddressDetails({ address }: { address: Address }) {
  return (
    <span className="flex flex-col">
      <span>
        {`گیرنده: ${address.receiver_full_name} · `}
        <span dir="ltr">{formatIranMobile(address.receiver_mobile)}</span>
      </span>
      <span className="break-words">{address.full_address}</span>
      {address.postal_code && <span>{`کد پستی: ${toPersianDigits(address.postal_code)}`}</span>}
    </span>
  )
}
