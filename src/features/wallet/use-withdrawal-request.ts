'use client'

import { useQueryClient } from '@tanstack/react-query'
import { useRef, useState } from 'react'
import { tell } from '@/components/ui/tell'
import { useMarkFeatureDisabled } from '@/features/settings/feature-context'
import type { WalletBalance } from '@/lib/api/types/payment'
import type { WithdrawalInput, WithdrawalRequest } from '@/lib/api/types/wallet'
import { NO_WAIT, restartWait, type Wait } from '@/lib/forms/waits'
import { formatToman } from '@/lib/format/number'
import { useSessionExpired } from '@/lib/session/use-session-expired'
import { OPEN_WITHDRAWAL_KEY, postWithdrawal } from './api'
import { belowMinimum } from './withdrawal-input'
import { withdrawalRefusal, type WithdrawalErrors } from './withdrawal-refusal'
import { walletChanged } from './wallet-queries'

// A withdrawal request's press (order digest §3.3.4, §8.5): one request however fast the
// presses (the API takes no Idempotency-Key here, so a lost answer is never sent again: the open
// request is read instead). 201: said, the money's reads again (it left the balance now), the
// request to the page. Each refusal lands where the form says it: on a field, for the form, or
// on the page (the open request shown, the form closed).

export interface WithdrawalOutcome {
  onFiled: (request: WithdrawalRequest) => void
  /** One open request already (409): the page reads it and shows it, with its cancel. */
  onPendingExists: () => void
  /** The shop stopped withdrawals (`wallet_withdrawal_disabled`): the form goes, with why. */
  onClosed: (reason: string) => void
}

export function useWithdrawalRequest(wallet: WalletBalance, outcome: WithdrawalOutcome) {
  const client = useQueryClient()
  const expire = useSessionExpired()
  const markFeatureDisabled = useMarkFeatureDisabled()
  const sending = useRef(false)
  const [busy, setBusy] = useState(false)
  const [errors, setErrors] = useState<WithdrawalErrors>({})
  const [wait, setWait] = useState<Wait>(NO_WAIT)
  /** Grows with every answer that put an error on a field (the form focuses the first). */
  const [refusals, setRefusals] = useState(0)

  async function send(body: WithdrawalInput) {
    if (sending.current) return
    sending.current = true
    setBusy(true)
    setErrors({})
    try {
      const request = await postWithdrawal(body)
      tell(
        `درخواست برداشت ${formatToman(request.amount)} ثبت شد؛ این مبلغ از موجودی کسر و تا بررسی کنار گذاشته شد.`,
      )
      walletChanged(client)
      outcome.onFiled(request)
    } catch (error) {
      const refusal = withdrawalRefusal(error)
      const onField = (next: WithdrawalErrors) => {
        setErrors(next)
        setRefusals((count) => count + 1)
      }
      switch (refusal.kind) {
        case 'session':
          return expire()
        case 'fields':
          return onField(refusal.errors)
        case 'below_minimum':
          return onField({ amount: belowMinimum(wallet) })
        case 'insufficient':
          walletChanged(client)
          return onField({ amount: refusal.message })
        case 'pending_exists':
          void client.invalidateQueries({ queryKey: OPEN_WITHDRAWAL_KEY })
          return outcome.onPendingExists()
        case 'disabled':
          walletChanged(client)
          return outcome.onClosed(refusal.message)
        case 'frozen':
          walletChanged(client)
          return setErrors({ form: refusal.message })
        case 'feature_off':
          markFeatureDisabled(refusal.feature, refusal.reason)
          return outcome.onClosed(refusal.reason)
        case 'throttled':
          return setWait((previous) => restartWait(previous, Date.now(), refusal.retryAfter))
        default:
          // It may have been filed all the same (an answer lost on the way): read the open one.
          void client.invalidateQueries({ queryKey: OPEN_WITHDRAWAL_KEY })
          return setErrors({ form: refusal.message })
      }
    } finally {
      sending.current = false
      setBusy(false)
    }
  }

  return {
    busy,
    errors,
    wait,
    refusals,
    send: (body: WithdrawalInput) => void send(body),
    /** A field changed: its server error goes. */
    clear: (field: keyof WithdrawalErrors) =>
      setErrors((current) => {
        if (!current[field]) return current
        const next = { ...current }
        delete next[field]
        return next
      }),
  }
}
