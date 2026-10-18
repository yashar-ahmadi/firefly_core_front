import type { WalletBalance } from '@/lib/api/types/payment'
import type { WithdrawalInput } from '@/lib/api/types/wallet'
import { formatToman } from '@/lib/format/number'
import { parseAmount } from './amount-input'
import { cardDigits, cardProblem, shebaDigits, shebaProblem } from './bank-account'
import type { WithdrawalErrors } from './withdrawal-refusal'

// The withdrawal form's values (order digest §2 `WithdrawalInput`, §7): checked here as the
// backend checks them (the bounds said in Persian digits), and sent in the API's names with
// Latin digits, the sheba as «IR» and its 24 digits, the card number left out when not given.
// Pure.

export const HOLDER_MAX = 120

export interface WithdrawalValues {
  /** As typed (any digits, grouped). */
  amount: string
  holder: string
  /** As shown: the 24 digits after «IR», grouped. */
  sheba: string
  card: string
}

export const EMPTY_WITHDRAWAL: WithdrawalValues = { amount: '', holder: '', sheba: '', card: '' }

export type WithdrawalLimits = Pick<WalletBalance, 'balance' | 'minimum_withdrawal_amount'>

/** «حداقل … و حداکثر … تومان (موجودی شما)». */
export const withdrawalHint = (wallet: WithdrawalLimits) =>
  `حداقل ${formatToman(wallet.minimum_withdrawal_amount)} و حداکثر ${formatToman(wallet.balance)} (موجودی شما).`

export const belowMinimum = (wallet: WithdrawalLimits) =>
  `حداقل مبلغ برداشت ${formatToman(wallet.minimum_withdrawal_amount)} است.`

export function amountProblem(text: string, wallet: WithdrawalLimits): string | null {
  const amount = parseAmount(text)
  if (amount === null || amount <= 0) return 'مبلغ برداشت را وارد کنید.'
  if (amount < wallet.minimum_withdrawal_amount) return belowMinimum(wallet)
  if (amount > wallet.balance)
    return `مبلغ برداشت بیشتر از موجودی شما (${formatToman(wallet.balance)}) است.`
  return null
}

export function holderProblem(holder: string): string | null {
  const name = holder.trim()
  if (name === '') return 'نام صاحب حساب را وارد کنید.'
  if (name.length > HOLDER_MAX) return 'نام صاحب حساب حداکثر ۱۲۰ نویسه است.'
  return null
}

/** Every field's problem (none: the form may be sent). */
export function withdrawalErrors(
  values: WithdrawalValues,
  wallet: WithdrawalLimits,
): WithdrawalErrors {
  const errors: WithdrawalErrors = {}
  const amount = amountProblem(values.amount, wallet)
  const holder = holderProblem(values.holder)
  const iban = shebaProblem(shebaDigits(values.sheba))
  const card = cardProblem(cardDigits(values.card))
  if (amount) errors.amount = amount
  if (holder) errors.holder = holder
  if (iban) errors.iban = iban
  if (card) errors.card = card
  return errors
}

export function withdrawalBody(values: WithdrawalValues): WithdrawalInput {
  const body: WithdrawalInput = {
    amount: parseAmount(values.amount) ?? 0,
    account_holder_name: values.holder.trim(),
    iban: `IR${shebaDigits(values.sheba)}`,
  }
  const card = cardDigits(values.card)
  if (card) body.card_number = card
  return body
}
