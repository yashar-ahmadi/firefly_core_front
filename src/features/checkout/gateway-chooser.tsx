'use client'

import { useId } from 'react'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { SmartImage } from '@/components/ui/smart-image'
import type { GatewayOption } from '@/lib/api/types/payment'
import { isPlaceholder } from './route-label'

// The bank gateways that take this amount (order digest §5.4 step 1), shown only when there is
// more than one: each with its logo and title, the shop's default chosen first. With one, there
// is nothing to choose and no `gateway_code` is sent (the server picks).

function Logo({ gateway }: { gateway: GatewayOption }) {
  const src = [gateway.logo_thumbnail, gateway.logo].find((url) => !isPlaceholder(url))
  if (!src) {
    return (
      <span
        aria-hidden
        className="grid size-8 place-items-center rounded-control bg-ink-100 font-bold text-ink-700"
      >
        {Array.from(gateway.title)[0]}
      </span>
    )
  }
  return <SmartImage src={src} alt="" width={32} height={32} className="size-8 object-contain" />
}

export function GatewayChooser({
  gateways,
  value,
  onChange,
  disabled,
}: {
  gateways: GatewayOption[]
  value: string | null
  onChange: (code: string) => void
  disabled: boolean
}) {
  const labelId = useId()
  if (gateways.length < 2) return null
  return (
    <div className="ms-9 mb-2 border-t border-brand-100 pt-2">
      <p id={labelId} className="text-sm leading-6 font-medium text-ink-700">
        درگاه بانکی را انتخاب کنید
      </p>
      <RadioGroup
        aria-labelledby={labelId}
        value={value ?? ''}
        onValueChange={onChange}
        disabled={disabled}
        className="mt-1 grid gap-1 sm:grid-cols-2"
      >
        {gateways.map((gateway) => (
          <RadioGroupItem
            key={gateway.code}
            value={gateway.code}
            label={
              <span className="flex items-center gap-2">
                <Logo gateway={gateway} />
                <span dir="auto">{gateway.title}</span>
              </span>
            }
          />
        ))}
      </RadioGroup>
    </div>
  )
}
