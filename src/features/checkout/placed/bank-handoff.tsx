'use client'

import { ArrowLeft, TriangleAlert } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Countdown } from '@/components/ui/countdown'
import { Spinner } from '@/components/ui/spinner'
import type { RedirectPayload } from '@/lib/api/types/payment'

// On the way to the bank (order digest §5.4 step 3): «در حال انتقال به {gateway}…», and a
// manual «انتقال به درگاه» for a browser that did not follow (or a redirect whose code could not
// load). The handoff lives until `expires_at` (15 minutes): after it the bank refuses it, and
// the shopper pays again from the order.

export interface BankHandoffProps {
  handoff: RedirectPayload
  loadFailed: boolean
  onGo: () => void
  onExpired: () => void
}

export function BankHandoff({ handoff, loadFailed, onGo, onExpired }: BankHandoffProps) {
  const [expired, setExpired] = useState(false)
  return (
    <div className="flex flex-col items-center gap-4 rounded-card bg-white p-6 text-center shadow-card md:p-10">
      {loadFailed ? (
        <p role="alert" className="flex items-start gap-2 text-base leading-7 text-ink-800">
          <TriangleAlert aria-hidden className="mt-1 size-5 shrink-0 text-warning" />
          انتقال خودکار به درگاه انجام نشد؛ دکمهٔ «انتقال به درگاه» را بزنید.
        </p>
      ) : (
        <p
          role="status"
          className="flex items-center gap-3 text-lg leading-8 font-bold text-ink-900"
        >
          <Spinner aria-hidden />
          {`در حال انتقال به ${handoff.gateway_title}…`}
        </p>
      )}
      <p className="text-base leading-7 text-ink-700">
        اگر صفحهٔ بانک باز نشد، دکمهٔ زیر را بزنید.
      </p>
      <Button size="lg" iconEnd={<ArrowLeft aria-hidden />} disabled={expired} onClick={onGo}>
        انتقال به درگاه
      </Button>
      {handoff.expires_at && !expired && (
        <p className="text-sm leading-6 text-ink-600">
          {'مهلت انتقال: '}
          <Countdown
            endsAt={handoff.expires_at}
            className="tabular-nums"
            onEnd={() => {
              setExpired(true)
              onExpired()
            }}
          />
        </p>
      )}
    </div>
  )
}
