'use client'

import { CircleAlert } from 'lucide-react'
import { useEffect, useEffectEvent, useRef, useState } from 'react'
import { useSubmitWait } from '@/components/form/code-timers'
import { Button } from '@/components/ui/button'
import { announce } from '@/components/ui/live-announcer'
import { RadioGroup } from '@/components/ui/radio-group'
import { Skeleton } from '@/components/ui/skeleton'
import { ListError, THROTTLED_MESSAGE, throttleWait } from '@/features/account/lists/list-error'
import { useFeature } from '@/features/settings/feature-context'
import { ApiError } from '@/lib/api/errors'
import type { ShippingOptionList } from '@/lib/api/types/shipping'
import { cheapestAvailable } from './shipping-labels'
import { ShippingOptionRow } from './shipping-option'
import type { Checkout } from './use-checkout'
import type { WriteOutcome } from './use-checkout-writes'
import { optionsSignature, useShippingOptions } from './use-shipping-options'

// «روش ارسال» (cart digest §6.7–6.8): the cart's options as a radio group; with nothing chosen,
// the cheapest available one is chosen for the shopper (never with COD; a refused one is not
// tried again for this cart). A choice and its COD box go to `cart/shipping/select/`; the
// refusals are handled by their code (use-checkout-writes): the reason shown, the list read
// again, COD dropped for the same method prepaid; a 429 waits out `retry_after`.

interface Failure {
  message: string
  error: unknown
  at: number
}

function OptionsSkeleton() {
  return (
    <div role="status" aria-label={'در حال بارگذاری روش\u{200C}های ارسال'} className="grid gap-3">
      {[0, 1, 2].map((index) => (
        <Skeleton key={index} className="h-20 rounded-card" />
      ))}
    </div>
  )
}

/**
 * Chooses the cheapest available option while none is chosen; one the API refused is not tried
 * again for this cart (no loop), the next cheapest is.
 */
function useAutoSelect(
  checkout: Checkout,
  list: ShippingOptionList | undefined,
  ready: boolean,
  choose: (code: string, cod: boolean, auto: boolean) => Promise<WriteOutcome>,
) {
  const tried = useRef({ cart: '', codes: new Set<string>() })
  const run = useEffectEvent(() => {
    const { cart } = checkout
    if (!cart || !list || !ready || cart.shipping.is_selected || !checkout.done.receiver) return
    const signature = optionsSignature(cart)
    if (tried.current.cart !== signature) tried.current = { cart: signature, codes: new Set() }
    const pick = cheapestAvailable(list.options, tried.current.codes)
    if (!pick) return
    // Only a refused option is kept out (a later clear of the choice tries it again).
    const { codes } = tried.current
    codes.add(pick.code)
    void choose(pick.code, false, true).then((outcome) => {
      if (outcome.status === 'done') codes.delete(pick.code)
    })
  })
  useEffect(() => run(), [checkout.cart, list, ready])
}

export function ShippingSection({ checkout }: { checkout: Checkout }) {
  const { cart } = checkout
  const cod = useFeature('pay_on_delivery')
  const options = useShippingOptions(cart, checkout.destinationReady)
  const [failure, setFailure] = useState<Failure | null>(null)
  const [pending, setPending] = useState<{ code: string; cod: boolean } | null>(null)
  const lock = useSubmitWait(throttleWait(failure?.error, failure?.at ?? 0))
  const busy = checkout.shippingPending || lock.locked
  const list = options.data

  const choose = async (code: string, cashOnDelivery: boolean, auto = false) => {
    // The shopper's own choice keeps the step open (the COD box of the chosen option, another
    // choice) until «ادامه با این روش ارسال»; the one made for them does not.
    if (!auto) checkout.edit('shipping')
    setPending({ code, cod: cashOnDelivery })
    const outcome: WriteOutcome = await checkout.selectShipping(code, cashOnDelivery)
    setPending(null)
    if (outcome.status === 'superseded') return outcome
    const title = list?.options.find((option) => option.code === code)?.title ?? ''
    if (outcome.status === 'done') {
      setFailure(outcome.codDropped && outcome.message ? fail(outcome.message, null) : null)
      announce(
        auto
          ? `روش ارسال «${title}»، ارزان\u{200C}ترین روش در دسترس، انتخاب شد.`
          : `روش ارسال «${title}» انتخاب شد.`,
      )
    } else if (outcome.message) {
      const throttled = outcome.error instanceof ApiError && outcome.error.status === 429
      setFailure(fail(throttled ? THROTTLED_MESSAGE : outcome.message, outcome.error))
    }
    return outcome
  }

  useAutoSelect(checkout, list, !options.isFetching && !busy && pending === null, choose)

  if (!cart) return null
  if (!list) {
    if (!options.isError) return <OptionsSkeleton />
    return (
      <ListError
        frame="inline"
        message={'روش\u{200C}های ارسال بارگذاری نشد.'}
        error={options.error}
        errorAt={options.errorUpdatedAt}
        onRetry={() => void options.refetch()}
        retrying={options.isFetching}
      />
    )
  }

  const { shipping } = cart
  const chosen = shipping.is_selected && shipping.is_available ? shipping.code : null
  const value = pending?.code ?? chosen ?? ''
  const cashOnDelivery = pending ? pending.cod : shipping.cash_on_delivery
  const stale = shipping.is_selected && !shipping.is_available
  return (
    <div className="flex flex-col gap-3">
      {stale && (
        <p className="rounded-card bg-warning/10 px-4 py-3 text-base leading-7 text-ink-800">
          {`روش ارسال «${shipping.title ?? ''}» دیگر در دسترس نیست${shipping.reason ? `: ${shipping.reason}` : '.'} روش دیگری انتخاب کنید.`}
        </p>
      )}
      {failure && (
        <p
          key={failure.at}
          role="alert"
          className="flex items-start gap-1.5 text-base leading-7 font-medium text-danger"
        >
          <CircleAlert aria-hidden className="mt-1.5 size-4 shrink-0" />
          <span>{failure.message}</span>
        </p>
      )}
      {list.options.every((option) => !option.is_available) && (
        <p className="text-base leading-7 text-ink-700">
          برای این سبد خرید و این مقصد روش ارسالی در دسترس نیست.
        </p>
      )}
      <RadioGroup
        aria-label={'روش\u{200C}های ارسال'}
        aria-busy={checkout.shippingPending || undefined}
        aria-describedby={lock.locked ? lock.noteId : undefined}
        value={value}
        disabled={lock.locked}
        onValueChange={(code) => {
          if (code !== value) void choose(code, false)
        }}
        className="gap-3"
      >
        {list.options.map((option) => (
          <ShippingOptionRow
            key={option.code}
            option={option}
            chosen={option.code === value}
            codOffered={cod.enabled}
            cashOnDelivery={option.code === value && cashOnDelivery}
            onCashOnDelivery={(next) => void choose(option.code, next)}
            busy={busy}
          />
        ))}
      </RadioGroup>
      {lock.note}
      {checkout.editing === 'shipping' && chosen && (
        <Button variant="outline" className="self-start" onClick={checkout.finishEditing}>
          ادامه با این روش ارسال
        </Button>
      )}
    </div>
  )
}

function fail(message: string, error: unknown): Failure {
  return { message, error, at: Date.now() }
}
