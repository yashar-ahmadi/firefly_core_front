import type { FeatureSwitch } from '@/features/settings/feature-context'
import type { WalletBalance } from '@/lib/api/types/payment'

// What the wallet page offers (order digest §1.5, §3.3.1, §7; Review Focus #5), from the
// feature switches and `GET wallet/` alone. The balance and the ledger are always readable (the
// `wallet` switch closes the money's movements, not their record); the payment history is not a
// wallet operation. Top-ups need the `wallet` and `online_payment` switches, the shop's top-ups on
// and a wallet that is not frozen; withdrawals need the `wallet` switch (the tab, with its record
// of requests), and a new request the shop's withdrawals on and a wallet that is not frozen.
// Pure.

export interface WalletAccess {
  topUp: boolean
  /** The withdrawals' tab. */
  withdrawals: boolean
  /** A new withdrawal request; when not, why (null: nothing to say). */
  withdrawalForm: boolean
  withdrawalNote: string | null
}

export const FROZEN_NO_WITHDRAWAL =
  'کیف پول شما مسدود است؛ درخواست برداشت تازه ممکن نیست. برای درخواستی که در انتظار بررسی است لغو همچنان ممکن است.'
export const WITHDRAWAL_OFF = 'ثبت درخواست برداشت از کیف پول در حال حاضر ممکن نیست.'

export function walletAccess({
  wallet,
  onlinePayment,
  balance,
}: {
  wallet: FeatureSwitch
  onlinePayment: FeatureSwitch
  balance: WalletBalance | undefined
}): WalletAccess {
  const usable = wallet.enabled && !!balance && !balance.is_frozen
  const withdrawalForm = usable && balance.is_withdrawal_enabled
  return {
    topUp: usable && onlinePayment.enabled && balance.is_top_up_enabled,
    withdrawals: wallet.enabled,
    withdrawalForm,
    withdrawalNote:
      withdrawalForm || !balance || !wallet.enabled
        ? null
        : balance.is_frozen
          ? FROZEN_NO_WITHDRAWAL
          : WITHDRAWAL_OFF,
  }
}
