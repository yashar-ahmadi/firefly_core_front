'use client'

import dynamic from 'next/dynamic'
import type { ReactNode } from 'react'
import { SupportPhone } from '@/components/layout/support-phone'
import { Button } from '@/components/ui/button'
import type { BankHandoffProps } from '@/features/checkout/placed/bank-handoff'

// The top-up box's frame and its two other faces: on the way to the bank (Task 3's «در حال
// انتقال به …» screen, its own chunk, loaded with the bank's answer) and closed for this page
// (why, with the support line when the bank cannot be used).

export const TOP_UP_HEADING = 'افزایش موجودی'
const HEADING_ID = 'wallet-top-up-heading'

export function TopUpSection({ children }: { children: ReactNode }) {
  return (
    <section
      aria-labelledby={HEADING_ID}
      className="flex flex-col gap-4 rounded-card bg-white p-4 shadow-card md:p-5"
    >
      <h2 id={HEADING_ID} className="text-lg leading-8 font-bold text-ink-900">
        {TOP_UP_HEADING}
      </h2>
      {children}
    </section>
  )
}

/** Its code could not load: the manual way to the bank still works (the handoff is here). */
function HandoffUnavailable({ onGo }: BankHandoffProps) {
  return (
    <div className="flex flex-col items-start gap-3">
      <p role="alert" className="text-base leading-7 text-ink-800">
        انتقال خودکار به درگاه انجام نشد؛ دکمهٔ «انتقال به درگاه» را بزنید.
      </p>
      <Button onClick={onGo}>انتقال به درگاه</Button>
    </div>
  )
}

export const LazyBankHandoff = dynamic<BankHandoffProps>(
  () =>
    import('@/features/checkout/placed/bank-handoff')
      .then((module) => module.BankHandoff)
      .catch(() => HandoffUnavailable),
  { ssr: false },
)

export function TopUpClosed({
  reason,
  supportPhone,
}: {
  reason: string
  /** Shown when the bank is what cannot be used. */
  supportPhone: string | null
}) {
  return (
    <>
      <p role="status" className="text-base leading-7 text-ink-800">
        {reason}
      </p>
      {supportPhone && (
        <SupportPhone phone={supportPhone} label="پشتیبانی" iconLabel="تماس با پشتیبانی" />
      )}
    </>
  )
}
