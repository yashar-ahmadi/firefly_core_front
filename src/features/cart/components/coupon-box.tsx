'use client'

import { CircleAlert, TicketPercent } from 'lucide-react'
import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { useSubmitWait } from '@/components/form/code-timers'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Spinner } from '@/components/ui/spinner'
import { THROTTLED_MESSAGE, throttleWait } from '@/features/account/lists/list-error'
import { useFeature } from '@/features/settings/feature-context'
import { ApiError } from '@/lib/api/errors'
import type { Cart, CouponBlock } from '@/lib/api/types/cart'
import { errorDetail } from '../cart-cache'
import { couponApplied } from '../coupon-messages'
import {
  COUPON_MAX_LENGTH,
  isCartGone,
  normaliseCouponCode,
  useApplyCoupon,
  useRemoveCoupon,
} from '../coupon-hooks'

const TITLE = 'کد تخفیف'
const FREE_SHIPPING_NOTE = 'ارسال رایگان پس از انتخاب روش ارسال اعمال می\u{200C}شود'
const EMPTY_CODE = 'کد تخفیف را وارد کنید.'

interface Failure {
  message: string
  /** A 429's wait counts from here (`retry_after`). */
  error: unknown
  at: number
}

function Frame({ children, className }: { children: ReactNode; className?: string }) {
  const headingId = useId()
  return (
    <section aria-labelledby={headingId} className={className}>
      <h2 id={headingId} className="flex items-center gap-2 text-base font-bold text-ink-900">
        <TicketPercent aria-hidden className="size-5 text-brand-600" />
        {TITLE}
      </h2>
      <div className="mt-3">{children}</div>
    </section>
  )
}

/** The coupon on the cart: its code and title, the free-shipping note, and «حذف کد تخفیف». */
function AppliedCoupon({
  coupon,
  focus,
  onRemoved,
}: {
  coupon: CouponBlock
  focus: boolean
  onRemoved: () => void
}) {
  const { remove, isPending } = useRemoveCoupon()
  const status = useRef<HTMLParagraphElement>(null)
  useEffect(() => {
    if (focus) status.current?.focus()
  }, [focus])
  return (
    <div className="flex flex-col gap-2">
      <p ref={status} tabIndex={-1} className="text-base text-ink-800 outline-none">
        {'کد '}
        <span dir="ltr" className="rounded-pill bg-sale/10 px-2 font-bold text-sale">
          {coupon.code}
        </span>
        {' روی سبد اعمال شد.'}
      </p>
      {coupon.title && <p className="text-sm leading-6 text-ink-600">{coupon.title}</p>}
      {coupon.discount_type === 'free_shipping' && (
        <p className="text-sm leading-6 font-medium text-success">{FREE_SHIPPING_NOTE}</p>
      )}
      <Button
        variant="outline"
        size="sm"
        className="self-start"
        aria-busy={isPending || undefined}
        iconStart={isPending ? <Spinner size="sm" /> : undefined}
        onClick={async () => {
          if (!isPending && (await remove())) onRemoved()
        }}
      >
        حذف کد تخفیف
      </Button>
    </div>
  )
}

interface CouponFormProps {
  focus: boolean
  onApplied: () => void
  /** `503 feature_disabled`: the operator's sentence takes the form's place. */
  onSwitchedOff: (detail: string) => void
}

/**
 * The code field and «اعمال کد». The code is sent as the API reads it (Latin digits, trimmed,
 * upper case). A refusal shows the API's detail under the field, the code kept for editing; a
 * 429 says calmly to wait, and «اعمال کد» waits out `retry_after` (focusable, inert, described
 * by the time left).
 */
function CouponForm({ focus, onApplied, onSwitchedOff }: CouponFormProps) {
  const fieldId = useId()
  const errorId = useId()
  const input = useRef<HTMLInputElement>(null)
  const [value, setValue] = useState('')
  const [failure, setFailure] = useState<Failure | null>(null)
  const { apply, isPending } = useApplyCoupon()
  const lock = useSubmitWait(throttleWait(failure?.error, failure?.at ?? 0))
  useEffect(() => {
    if (focus) input.current?.focus()
  }, [focus])

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (isPending || lock.locked) return
    const code = normaliseCouponCode(value)
    if (code === '') {
      setFailure({ message: EMPTY_CODE, error: null, at: Date.now() })
      input.current?.focus()
      return
    }
    try {
      await apply(code)
      onApplied()
    } catch (error) {
      if (error instanceof ApiError && error.isFeatureDisabled()) return onSwitchedOff(error.detail)
      // The cart is gone (read again: the page shows it empty); nothing to say here.
      if (isCartGone(error)) return setFailure(null)
      const throttled = error instanceof ApiError && error.status === 429
      setFailure({
        message: throttled ? THROTTLED_MESSAGE : errorDetail(error),
        error,
        at: Date.now(),
      })
      input.current?.focus()
    }
  }

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-1.5">
      <label htmlFor={fieldId} className="text-base font-medium text-ink-800">
        کد تخفیف دارید؟
      </label>
      <div className="flex items-start gap-2">
        <Input
          ref={input}
          id={fieldId}
          dir="ltr"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          enterKeyHint="send"
          maxLength={COUPON_MAX_LENGTH}
          aria-invalid={failure ? true : undefined}
          aria-describedby={failure ? errorId : undefined}
          className="min-w-0 flex-1"
        />
        <Button
          type="submit"
          variant="outline"
          className="h-12 shrink-0"
          aria-busy={isPending || undefined}
          aria-disabled={lock.locked || undefined}
          aria-describedby={lock.locked ? lock.noteId : undefined}
          iconStart={isPending ? <Spinner size="sm" /> : undefined}
        >
          اعمال کد
        </Button>
      </div>
      {failure && (
        <p
          id={errorId}
          role="alert"
          className="flex items-start gap-1.5 text-sm leading-6 font-medium text-danger"
        >
          <CircleAlert aria-hidden className="mt-1 size-4 shrink-0" />
          <span>{failure.message}</span>
        </p>
      )}
      {lock.note}
    </form>
  )
}

/**
 * The cart page's coupon box (cart digest §3.6–3.7). With a coupon on the cart: its code, title
 * and «حذف کد تخفیف» (removing stays open with the `coupons` switch off). Without one: the code
 * form, unless the switch is off. A `503 feature_disabled` on apply puts the operator's
 * sentence in the form's place. The focus follows: to the coupon once applied, to the field
 * once removed.
 */
export function CouponBox({ cart, className }: { cart: Cart; className?: string }) {
  const { enabled } = useFeature('coupons')
  const [switchedOff, setSwitchedOff] = useState<string | null>(null)
  // Where the focus goes after the shopper's own apply or remove (never after a coupon the API
  // took off by itself).
  const [moved, setMoved] = useState<'applied' | 'field' | null>(null)

  if (couponApplied(cart.coupon)) {
    return (
      <Frame className={className}>
        <AppliedCoupon
          coupon={cart.coupon}
          focus={moved === 'applied'}
          onRemoved={() => setMoved('field')}
        />
      </Frame>
    )
  }
  if (switchedOff !== null) {
    return (
      <Frame className={className}>
        <p role="status" className="text-sm leading-6 text-ink-600">
          {switchedOff}
        </p>
      </Frame>
    )
  }
  if (!enabled) return null
  return (
    <Frame className={className}>
      <CouponForm
        focus={moved === 'field'}
        onApplied={() => setMoved('applied')}
        onSwitchedOff={setSwitchedOff}
      />
    </Frame>
  )
}
