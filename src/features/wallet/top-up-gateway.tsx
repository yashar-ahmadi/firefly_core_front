'use client'

import dynamic from 'next/dynamic'
import { useId, useState } from 'react'
import { Button } from '@/components/ui/button'
import type { GatewayOption } from '@/lib/api/types/payment'

// The top-up's bank gateway when the shop lists more than one (order digest §3.2.2, §5.4 step 1):
// the chosen one named (the shop's default first), and Task 3's chooser one press away, its own
// chunk (its radio group would cost every wallet view about 11 KB of script on load). With one
// gateway there is nothing to choose.

export interface TopUpGatewayProps {
  gateways: GatewayOption[]
  chosen: GatewayOption | null
  onChoose: (code: string) => void
  disabled: boolean
}

interface ChooserProps {
  gateways: GatewayOption[]
  value: string | null
  onChange: (code: string) => void
  disabled: boolean
}

function ChooserUnavailable() {
  return (
    <p role="alert" className="text-sm leading-6 text-danger">
      فهرست درگاه‌ها بارگذاری نشد؛ با درگاه پیش‌فرض ادامه دهید یا صفحه را دوباره باز کنید.
    </p>
  )
}

const LazyChooser = dynamic<ChooserProps>(
  () =>
    import('@/features/checkout/gateway-chooser')
      .then((module) => module.GatewayChooser)
      .catch(() => ChooserUnavailable),
  { ssr: false },
)

export function TopUpGateway({ gateways, chosen, onChoose, disabled }: TopUpGatewayProps) {
  const [open, setOpen] = useState(false)
  const panelId = useId()
  if (gateways.length < 2 || !chosen) return null
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <p className="text-base leading-7 text-ink-800">
          {'درگاه پرداخت: '}
          <span dir="auto" className="font-medium text-ink-900">
            {chosen.title}
          </span>
        </p>
        <Button
          variant="link"
          size="sm"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen((current) => !current)}
        >
          تغییر درگاه
        </Button>
      </div>
      <div id={panelId} className="[&>div]:ms-0 [&>div]:border-t-0 [&>div]:pt-0">
        {open && (
          <LazyChooser
            gateways={gateways}
            value={chosen.code}
            onChange={onChoose}
            disabled={disabled}
          />
        )}
      </div>
    </div>
  )
}
