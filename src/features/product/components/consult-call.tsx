import { Headset } from 'lucide-react'
import type { PhoneLink } from '@/components/layout/contact-block'
import { cn } from '@/components/ui/cn'

export interface ConsultCallProps {
  /** The shop's sales lines (`sales_phone`, `sales_phone2`, each once); none renders nothing. */
  phones: PhoneLink[]
  className?: string
}

/**
 * «مشاوره پیش از خرید» in the buy box: the shop's sales and consultation numbers (settings
 * digest §3.3: apart from support, for a shopper who wants advice before buying) as `tel:`
 * links, the number left to right. Renders nothing while the operator set no sales line.
 */
export function ConsultCall({ phones, className }: ConsultCallProps) {
  if (phones.length === 0) return null
  return (
    <div
      className={cn(
        'flex items-center gap-3 rounded-control bg-brand-50 px-3 py-2 ring-1 ring-brand-100',
        className,
      )}
    >
      <span
        aria-hidden
        className="grid size-10 shrink-0 place-items-center rounded-full bg-white text-brand-700 shadow-sm [&_svg]:size-5"
      >
        <Headset />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm leading-6 text-ink-700">{'مشاوره پیش از خرید'}</p>
        <p className="flex flex-wrap items-center gap-x-3">
          {phones.map(({ label, tel }, index) => (
            <span key={label} className="flex items-center gap-x-3">
              {index > 0 && <span aria-hidden className="h-4 w-px bg-brand-200" />}
              <a
                href={`tel:${tel}`}
                dir="ltr"
                className="inline-flex min-h-11 items-center rounded-control text-base font-bold tracking-wide text-ink-900 transition-colors hover:text-brand-700"
              >
                {label}
              </a>
            </span>
          ))}
        </p>
      </div>
    </div>
  )
}
