import { Headset } from 'lucide-react'
import { iconButtonClasses } from '@/components/ui/button-styles'
import { cn } from '@/components/ui/cn'
import { formatIranMobile } from '@/lib/format/phone'

export interface SupportPhoneProps {
  /** E.164 from the settings (`tel:` ready). */
  phone: string
  /** «پشتیبانی» */
  label: string
  /** «پشتیبانی تلفنی»: the icon variant's accessible name. */
  iconLabel: string
  /** `inline`: icon, label and number (the desktop row); `icon`: a round icon button (phones). */
  variant?: 'inline' | 'icon'
  className?: string
}

/** A `tel:` link to the shop's support line, shown as «۰۲۱ ۹۱۰۰ ۰۰۰۰» (left to right). */
export function SupportPhone({
  phone,
  label,
  iconLabel,
  variant = 'inline',
  className,
}: SupportPhoneProps) {
  const number = formatIranMobile(phone)
  if (variant === 'icon') {
    return (
      <a
        href={`tel:${phone}`}
        aria-label={`${iconLabel} ${number}`}
        className={cn(iconButtonClasses(), className)}
      >
        <Headset aria-hidden />
      </a>
    )
  }
  return (
    <a
      href={`tel:${phone}`}
      className={cn(
        'group flex h-12 shrink-0 items-center gap-2 rounded-control px-1 text-ink-700 transition-colors hover:text-brand-700 focus-visible:-outline-offset-2',
        className,
      )}
    >
      <Headset aria-hidden className="size-5 text-brand-600" />
      <span className="text-sm text-ink-500 group-hover:text-brand-700">{label}</span>
      <span dir="ltr" className="text-base font-bold tracking-wide">
        {number}
      </span>
    </a>
  )
}
