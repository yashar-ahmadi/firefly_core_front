'use client'

import { Banknote } from 'lucide-react'
import dynamic from 'next/dynamic'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import type { WalletBalance } from '@/lib/api/types/payment'
import type { WithdrawalRequest } from '@/lib/api/types/wallet'
import type { RefreshWallet } from './use-withdrawal-request'
import type { WithdrawalFormProps } from './withdrawal-form'

// «درخواست برداشت جدید» (order digest §3.3.4, §7), shown by the withdrawals' tab only without an
// open request: while the wallet allows one (`walletAccess`), a button that loads the form (its
// own chunk); otherwise why, the shop closing withdrawals while the form is open included.

function Unavailable() {
  return (
    <p role="alert" className="text-base leading-7 text-danger">
      این بخش بارگذاری نشد؛ صفحه را دوباره باز کنید.
    </p>
  )
}

const LazyWithdrawalForm = dynamic<WithdrawalFormProps>(
  () =>
    import('./withdrawal-form').then((module) => module.WithdrawalForm).catch(() => Unavailable),
  { ssr: false },
)

export interface NewWithdrawalProps {
  wallet: WalletBalance
  refreshWallet?: RefreshWallet
  /** A new request is offered (`walletAccess`). */
  offered: boolean
  /** Why not, when it is not (`walletAccess`). */
  note: string | null
  /** 201: the request (the page shows it as the open one). */
  onFiled: (request: WithdrawalRequest) => void
}

export function NewWithdrawal({
  wallet,
  refreshWallet,
  offered,
  note,
  onFiled,
}: NewWithdrawalProps) {
  const [formShown, setFormShown] = useState(false)
  const [closedReason, setClosedReason] = useState<string | null>(null)
  const said = closedReason ?? note
  return (
    <section
      aria-label="درخواست برداشت جدید"
      className="flex flex-col gap-4 rounded-card bg-white p-4 shadow-card md:p-5"
    >
      {offered && !closedReason ? (
        formShown ? (
          <>
            <h2 className="text-lg leading-8 font-bold text-ink-900">درخواست برداشت جدید</h2>
            <LazyWithdrawalForm
              wallet={wallet}
              refreshWallet={refreshWallet}
              onFiled={(request) => {
                setFormShown(false)
                onFiled(request)
              }}
              onPendingExists={() => setFormShown(false)}
              onClosed={(reason) => {
                setClosedReason(reason)
                setFormShown(false)
              }}
            />
          </>
        ) : (
          <Button
            variant="outline"
            className="self-start"
            iconStart={<Banknote aria-hidden />}
            onClick={() => setFormShown(true)}
          >
            درخواست برداشت جدید
          </Button>
        )
      ) : (
        said && <p className="text-base leading-7 text-ink-800">{said}</p>
      )}
    </section>
  )
}
