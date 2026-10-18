import type { FeatureSwitch } from '@/features/settings/feature-context'
import type { WalletBalance } from '@/lib/api/types/payment'
import { balanceBelowMinimum } from './withdrawal-input'

// What the wallet page offers (order digest §1.5, §3.3.1, §7; Review Focus #5), from the
// feature switches and `GET wallet/` alone. The balance and the ledger are always readable (the
// `wallet` switch closes the money's movements, not their record); the payment history is not a
// wallet operation. Top-ups need the `wallet` and `online_payment` switches, the shop's top-ups on
// and a wallet that is not frozen. The withdrawals' tab needs the `wallet` switch, or a request on
// record (the switch off: its list, and an open one's cancel, which the backend still takes and
// which gives the money back; hiding it would strand the money the balance card says is held). A
// new request needs the switch, the shop's withdrawals on, a wallet that is not frozen and a
// balance that reaches the minimum (else no amount could pass the form); when one is not offered,
// why. Pure.

export interface WalletAccess {
  topUp: boolean
  /** The withdrawals' tab. */
  withdrawals: boolean
  /** A new withdrawal request; when not, why (null: nothing to say). */
  withdrawalForm: boolean
  withdrawalNote: string | null
}

/** Said only without an open request (one shown keeps its own «لغو درخواست»). */
export const FROZEN_NO_WITHDRAWAL = 'کیف پول شما مسدود است؛ درخواست برداشت تازه ممکن نیست.'
export const WITHDRAWAL_OFF = 'ثبت درخواست برداشت از کیف پول در حال حاضر ممکن نیست.'

export function walletAccess({
  wallet,
  onlinePayment,
  balance,
  hasWithdrawals = false,
}: {
  wallet: FeatureSwitch
  onlinePayment: FeatureSwitch
  balance: WalletBalance | undefined
  /** A withdrawal request on record (read while the switch is off). */
  hasWithdrawals?: boolean
}): WalletAccess {
  const usable = wallet.enabled && !!balance && !balance.is_frozen
  const enabled = usable && balance.is_withdrawal_enabled
  const withdrawalForm = enabled && balance.balance >= balance.minimum_withdrawal_amount
  return {
    topUp: usable && onlinePayment.enabled && balance.is_top_up_enabled,
    withdrawals: wallet.enabled || hasWithdrawals || (balance?.pending_withdrawal_amount ?? 0) > 0,
    withdrawalForm,
    withdrawalNote:
      withdrawalForm || !balance
        ? null
        : enabled
          ? balanceBelowMinimum(balance)
          : wallet.enabled && balance.is_frozen
            ? FROZEN_NO_WITHDRAWAL
            : WITHDRAWAL_OFF,
  }
}
