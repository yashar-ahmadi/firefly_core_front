'use client'

import { CircleAlert } from 'lucide-react'
import { useEffect, useId, useRef, useState } from 'react'
import { useSubmitWait } from '@/components/form/code-timers'
import { AuthForm } from '@/components/form/auth-form'
import { SubmitButton } from '@/components/form/submit-button'
import { Chip } from '@/components/ui/chip'
import { Field } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import type { PaymentCatalog } from '@/features/payment/catalog'
import { defaultGateway } from '@/features/payment/routes'
import { usePaymentCatalog } from '@/features/payment/use-payment-catalog'
import { useFeature } from '@/features/settings/feature-context'
import type { WalletBalance } from '@/lib/api/types/payment'
import { formatToman } from '@/lib/format/number'
import { amountText, parseAmount, regroup } from './amount-input'
import {
  boundsHint,
  closedForToday,
  dayClosed,
  gatewayOutOfRange,
  presetsWithin,
  topUpBounds,
  topUpGatewayCode,
  topUpProblem,
} from './top-up-bounds'
import { TopUpGateway } from './top-up-gateway'
import { LazyBankHandoff, TopUpClosed, TopUpSection } from './top-up-parts'
import { usableAt, useTopUp } from './use-top-up'
import { walletAccess } from './wallet-access'

// «افزایش موجودی» (order digest §3.3.1, §3.3.3, §5.12): only while the wallet takes top-ups
// (`walletAccess`: the switches, `is_top_up_enabled`, not frozen). Round amounts inside the
// bounds as chips, or an amount typed in any digits (grouped in Persian digits as typed); the
// bounds said and checked before anything is sent; a gateway chooser when more than one gateway
// is listed (Task 3's, its default chosen). The press goes to the bank (`useTopUp`); the screen
// on the way (Task 3's «در حال انتقال به …») loads then.

/** A press on an amount every gateway refused (`gateway_amount_not_supported`, `usableAt`). */
const NO_GATEWAY_AT_AMOUNT = 'هیچ درگاهی این مبلغ را نمی\u{200C}پذیرد؛ مبلغ دیگری وارد کنید.'

export interface TopUpFormProps {
  wallet: WalletBalance
  catalog: PaymentCatalog
  supportPhone: string | null
  /** `GET wallet/` again (after a refusal about the limits or the wallet's state). */
  refreshWallet?: () => Promise<WalletBalance | undefined>
}

export function TopUpForm(props: TopUpFormProps) {
  const access = walletAccess({
    wallet: useFeature('wallet'),
    onlinePayment: useFeature('online_payment'),
    balance: props.wallet,
  })
  if (!access.topUp) return null
  return <TopUpBox {...props} />
}

function TopUpBox({
  wallet,
  catalog: served,
  supportPhone,
  refreshWallet = async () => undefined,
}: TopUpFormProps) {
  const catalog = usePaymentCatalog(served)
  const top = useTopUp({ catalog, refreshWallet })
  const [text, setText] = useState('')
  const [chosenCode, setChosenCode] = useState<string | null>(null)
  const field = useRef<HTMLInputElement>(null)
  const lock = useSubmitWait(top.wait)
  const presetsId = useId()

  const { gateways } = catalog
  const amount = parseAmount(text)
  // A gateway that refused this very amount is not offered for it (another amount: again).
  const usable = usableAt(catalog, amount)
  const chosen = usable.find((gateway) => gateway.code === chosenCode) ?? defaultGateway(usable)
  const bounds = topUpBounds(wallet, chosen)
  const [checked, setChecked] = useState<string | null>(null)
  const fieldError = checked ?? top.issue?.field ?? null
  // The API refused the amount: its bound is said under the field, which takes the focus.
  const refusedAmount = top.issue?.field
  useEffect(() => {
    if (refusedAmount) field.current?.focus()
  }, [refusedAmount])

  if (top.phase.kind === 'redirecting') {
    return (
      <TopUpSection>
        {/* Task 3's screen is a card of its own: inside this one, without its frame. */}
        <div className="[&>div]:p-0 [&>div]:shadow-none md:[&>div]:p-0">
          <LazyBankHandoff
            handoff={top.phase.handoff}
            loadFailed={top.phase.loadFailed}
            onGo={top.goAgain}
            onExpired={top.expired}
          />
        </div>
      </TopUpSection>
    )
  }

  const closed =
    top.issue?.closed ??
    (gateways.length === 0
      ? catalog.gatewaysFailed
        ? 'درگاه\u{200C}های پرداخت خوانده نشد؛ کمی بعد دوباره تلاش کنید.'
        : 'شارژ کیف پول با درگاه بانکی اکنون ممکن نیست؛ با پشتیبانی تماس بگیرید.'
      : dayClosed(wallet)
        ? closedForToday(wallet)
        : !bounds.open && gateways.length < 2 && chosen
          ? gatewayOutOfRange(wallet, chosen, false)
          : null)
  if (closed) {
    const support = top.issue?.support || gateways.length === 0
    return (
      <TopUpSection>
        <TopUpClosed reason={closed} supportPhone={support ? supportPhone : null} />
      </TopUpSection>
    )
  }

  const change = (next: string) => {
    setText(next)
    setChecked(null)
    top.clearField()
  }
  const send = () => {
    // A 429's wait still runs: the button says so, nothing is sent.
    if (lock.locked) return
    // Every gateway refused this amount: said under it (its bound was, until the amount changed),
    // and another amount first.
    if (!chosen) {
      setChecked(NO_GATEWAY_AT_AMOUNT)
      return field.current?.focus()
    }
    const problem = topUpProblem(amount, bounds)
    setChecked(problem)
    if (problem) {
      field.current?.focus()
      return
    }
    top.submit({
      amount: amount!,
      gatewayCode: topUpGatewayCode(usable, chosen),
      gateway: chosen,
    })
  }
  const presets = presetsWithin(bounds)
  const busy = top.phase.kind === 'sending'
  const gateway = (
    <TopUpGateway
      gateways={usable}
      chosen={chosen}
      onChoose={(code) => {
        setChosenCode(code)
        setChecked(null)
        top.clearField()
      }}
      disabled={busy}
    />
  )

  // The chosen gateway's range misses the wallet's (the day is open): why, and another gateway.
  if (!bounds.open && chosen) {
    return (
      <TopUpSection>
        <p role="status" className="text-base leading-7 text-ink-800">
          {gatewayOutOfRange(wallet, chosen, true)}
        </p>
        {gateway}
      </TopUpSection>
    )
  }

  return (
    <TopUpSection>
      <AuthForm onSubmit={send} className="gap-4">
        {top.issue?.alert && (
          <p
            role="alert"
            className="flex items-start gap-2 rounded-card bg-danger/10 px-4 py-3 text-base leading-7 text-ink-900"
          >
            <CircleAlert aria-hidden className="mt-1 size-5 shrink-0 text-danger" />
            <span>{top.issue.alert}</span>
          </p>
        )}
        {presets.length > 0 && (
          <div role="group" aria-labelledby={presetsId} className="flex flex-col gap-2">
            <p id={presetsId} className="text-base font-medium text-ink-800">
              {'مبلغ\u{200C}های پیشنهادی'}
            </p>
            <div className="flex flex-wrap gap-2">
              {presets.map((preset) => (
                <Chip
                  key={preset}
                  selected={amount === preset}
                  onClick={() => change(amountText(preset))}
                >
                  {formatToman(preset)}
                </Chip>
              ))}
            </div>
          </div>
        )}
        <Field label="مبلغ شارژ" hint={`${boundsHint(bounds)}.`} error={fieldError} required>
          <Input
            ref={field}
            name="top-up-amount"
            inputMode="numeric"
            autoComplete="off"
            value={text}
            endAdornment={<span className="text-sm">تومان</span>}
            onChange={(event) => {
              const input = event.currentTarget
              const next = regroup(input.value, input.selectionStart ?? input.value.length)
              change(next.text)
              requestAnimationFrame(() => {
                if (document.activeElement === input)
                  input.setSelectionRange(next.caret, next.caret)
              })
            }}
          />
        </Field>
        {gateway}
        <SubmitButton busy={busy} lock={lock}>
          {busy ? 'در حال آماده\u{200C}سازی پرداخت…' : 'افزایش موجودی'}
        </SubmitButton>
      </AuthForm>
    </TopUpSection>
  )
}
