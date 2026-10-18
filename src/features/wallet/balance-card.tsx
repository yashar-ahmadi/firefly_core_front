import { Lock, WalletMinimal } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import type { WalletBalance } from '@/lib/api/types/payment'
import { formatToman } from '@/lib/format/number'

// «موجودی» (order digest §3.3.1, §7): the balance as the API gives it, in large Persian digits;
// what waits for a withdrawal under review when there is some (already out of the balance, so
// it is said beside it, never added back); a frozen wallet's badge and the shop's message as
// plain text (no markup is rendered: it is text). No state: a server component as well.

const HEADING_ID = 'wallet-balance-heading'
const FROZEN_DEFAULT = 'کیف پول شما مسدود است.'

export function BalanceCard({ wallet }: { wallet: WalletBalance }) {
  const message = wallet.freeze_message?.trim() || FROZEN_DEFAULT
  return (
    <section
      aria-labelledby={HEADING_ID}
      className="flex flex-col gap-4 rounded-card bg-white p-4 shadow-card md:p-5"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2
          id={HEADING_ID}
          className="flex items-center gap-2 text-lg leading-8 font-bold text-ink-900"
        >
          <WalletMinimal aria-hidden className="size-5 text-brand-600" />
          موجودی
        </h2>
        {wallet.is_frozen && (
          <Badge tone="danger">
            <Lock aria-hidden />
            مسدود
          </Badge>
        )}
      </div>
      <p className="text-3xl leading-[1.4] font-bold text-ink-900 tabular-nums md:text-4xl">
        {formatToman(wallet.balance)}
      </p>
      {wallet.pending_withdrawal_amount > 0 && (
        <p className="text-base leading-7 text-ink-700">
          {'در انتظار برداشت: '}
          <span className="font-bold text-ink-900">
            {formatToman(wallet.pending_withdrawal_amount)}
          </span>
          <span className="block text-sm leading-6 text-ink-600">
            این مبلغ از موجودی کسر شده و تا بررسی درخواست برداشت کنار گذاشته شده است.
          </span>
        </p>
      )}
      {wallet.is_frozen && (
        <p className="flex items-start gap-2 rounded-card bg-danger/10 px-4 py-3 text-base leading-7 text-ink-900">
          <Lock aria-hidden className="mt-1 size-5 shrink-0 text-danger" />
          <span>{message}</span>
        </p>
      )}
    </section>
  )
}
