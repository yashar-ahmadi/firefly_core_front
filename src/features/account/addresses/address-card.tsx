'use client'

import { BadgeCheck, MapPinCheck, Pencil, Star, Trash2 } from 'lucide-react'
import { useId } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { formatIranMobile, toPersianDigits } from '@/lib/format'
import type { Address } from '@/lib/api/types/address'

export interface AddressCardProps {
  address: Address
  /** A write for this address is on its way: its actions wait. */
  pending: boolean
  onEdit: () => void
  onDelete: () => void
  onSetDefault: () => void
  /** The pointer or the focus reached an action: its code can start loading. */
  onPreloadEdit?: () => void
  onPreloadDelete?: () => void
}

/** «پلاک ۱۲، واحد ۴», or nothing. */
function plaqueLine({ plaque, unit }: Address): string | null {
  const parts = [plaque && `پلاک ${plaque}`, unit && `واحد ${unit}`].filter(Boolean)
  return parts.length > 0 ? toPersianDigits(parts.join('، ')) : null
}

/**
 * One address of the book: its title (and «پیش‌فرض»), the receiver, the place, and its actions,
 * each named with the title after its visible words («ویرایش آدرس خانه»). The text is the visitor's own, rendered as
 * text. No map here (it would cost every visit): a line says when a pin is saved.
 */
export function AddressCard({
  address,
  pending,
  onEdit,
  onDelete,
  onSetDefault,
  onPreloadEdit,
  onPreloadDelete,
}: AddressCardProps) {
  const titleId = useId()
  const plaque = plaqueLine(address)
  const hasPin = address.latitude !== null && address.longitude !== null
  const guard = (action: () => void) => () => {
    if (!pending) action()
  }
  const wait = { 'aria-disabled': pending || undefined }
  return (
    <article
      data-address-id={address.id}
      tabIndex={-1}
      aria-labelledby={titleId}
      aria-busy={pending || undefined}
      className="flex flex-1 flex-col gap-3 rounded-card bg-white p-4 shadow-card outline-none focus-visible:ring-4 focus-visible:ring-(--focus) md:p-5"
    >
      <div className="flex min-h-8 flex-wrap items-center gap-x-3 gap-y-1">
        <h2 id={titleId} dir="auto" className="text-lg leading-8 font-bold text-ink-900">
          {address.title}
        </h2>
        {address.is_default && (
          <Badge tone="brand" size="sm">
            <BadgeCheck aria-hidden />
            پیش‌فرض
          </Badge>
        )}
        {pending && <Spinner size="sm" label="در حال ذخیره" className="text-brand-600" />}
      </div>
      <div className="flex flex-col gap-1 text-base leading-7 text-ink-700">
        <p>
          <span className="text-ink-600">گیرنده: </span>
          {address.receiver_full_name}
          {' · '}
          <span dir="ltr">{formatIranMobile(address.receiver_mobile)}</span>
        </p>
        <p>
          {address.province_name} — {address.city_name}
        </p>
        <p className="break-words whitespace-pre-line">{address.address}</p>
        {plaque && <p>{plaque}</p>}
        {address.postal_code && (
          <p>
            <span className="text-ink-600">کد پستی: </span>
            <span dir="ltr">{toPersianDigits(address.postal_code)}</span>
          </p>
        )}
        {hasPin && (
          <p className="flex items-center gap-1.5 text-sm text-success">
            <MapPinCheck aria-hidden className="size-4 shrink-0" />
            موقعیت روی نقشه ثبت شده
          </p>
        )}
      </div>
      <div className="mt-auto flex flex-wrap gap-2 border-t border-ink-100 pt-3">
        <Button
          variant="outline"
          size="sm"
          iconStart={<Pencil aria-hidden />}
          aria-haspopup="dialog"
          onPointerEnter={onPreloadEdit}
          onFocus={onPreloadEdit}
          onClick={guard(onEdit)}
          {...wait}
        >
          ویرایش <span className="sr-only">آدرس {address.title}</span>
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="text-danger"
          iconStart={<Trash2 aria-hidden />}
          aria-haspopup="dialog"
          onPointerEnter={onPreloadDelete}
          onFocus={onPreloadDelete}
          onClick={guard(onDelete)}
          {...wait}
        >
          حذف <span className="sr-only">آدرس {address.title}</span>
        </Button>
        {!address.is_default && (
          <Button
            variant="ghost"
            size="sm"
            iconStart={<Star aria-hidden />}
            onClick={guard(onSetDefault)}
            {...wait}
          >
            انتخاب به‌عنوان پیش‌فرض <span className="sr-only">(آدرس {address.title})</span>
          </Button>
        )}
      </div>
    </article>
  )
}
