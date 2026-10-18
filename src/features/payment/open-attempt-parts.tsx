import { CircleAlert, Info } from 'lucide-react'
import type { ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import type { AttemptRow } from './attempt-row'

// The open-attempt panel's words and small parts (order digest §5.9, §3.2.6). Pure.

export const ROW_TITLES: Record<AttemptRow, string> = {
  bank: 'یک پرداخت نیمه\u{200C}تمام دارید',
  expired: 'مهلت انتقال به درگاه تمام شده است',
  verifying: 'پرداخت قبلی در حال بررسی است',
  card: 'پرداخت کارت به کارت شما باز است',
  review: 'رسید در حال بررسی است',
}

export const ROW_TEXTS: Record<AttemptRow, string> = {
  bank: 'پرداخت این سفارش در درگاه بانک نیمه\u{200C}کاره مانده است؛ آن را ادامه دهید یا از آن انصراف دهید.',
  expired:
    'این تلاش پرداخت دیگر به درگاه نمی\u{200C}رود و به\u{200C}زودی بسته می\u{200C}شود. برای پرداخت، از آن انصراف دهید و دوباره پرداخت کنید.',
  verifying:
    'بانک به این پرداخت پاسخ داده و نتیجهٔ آن در حال ثبت است؛ تا روشن شدن نتیجه دوباره پرداخت نکنید.',
  card: 'برای این سفارش پرداخت کارت به کارت باز است؛ مبلغ را واریز کنید و رسید آن را ثبت کنید، یا از آن انصراف دهید.',
  review:
    'رسید کارت به کارت این سفارش ثبت شده و در صف بررسی است؛ نتیجه با پیامک اعلام می\u{200C}شود. تا آن زمان کاری لازم نیست.',
}

/** Abandoning an attempt the bank has not answered sends the shopper an SMS (digest §3.2.6). */
export const SMS_NOTE =
  'با انصراف، پیامک «پرداخت ناموفق» همراه لینک پرداخت این سفارش برایتان فرستاده می\u{200C}شود.'

/** Abandoning a verification: money the bank took is not returned by it (a parked capture). */
export const PARKED_NOTE =
  'انصراف فقط این تلاش را می\u{200C}بندد: اگر بانک مبلغی از حساب شما برداشته باشد، آن مبلغ خودبه\u{200C}خود برنمی\u{200C}گردد و فروشگاه آن را پیگیری می\u{200C}کند.'

/** Said politely as the panel changes (the visible text says it too). */
export const CANCELLED = 'پرداخت نیمه\u{200C}تمام لغو شد؛ روش پرداخت را انتخاب کنید.'
export const CANCELLED_REPAY = 'پرداخت نیمه\u{200C}تمام لغو شد؛ پرداخت دوباره آغاز می\u{200C}شود.'
export const ENDED = 'این پرداخت نیمه\u{200C}تمام دیگر باز نیست.'
export const UNDER_REVIEW = 'رسید این پرداخت در حال بررسی است؛ امکان انصراف نیست.'
export const HANDOFF_ENDED =
  'مهلت انتقال به درگاه تمام شد؛ برای پرداخت، از این تلاش انصراف دهید و دوباره پرداخت کنید.'

export const POLL_EXHAUSTED =
  'نتیجهٔ این پرداخت هنوز مشخص نیست؛ کمی بعد این صفحه را دوباره باز کنید.'
export const POLL_UNREADABLE =
  'وضعیت این پرداخت اینجا خوانده نشد؛ کمی بعد این صفحه را دوباره باز کنید.'
export const BANK_LOAD_FAILED = 'انتقال به درگاه انجام نشد؛ دوباره تلاش کنید.'

/**
 * A cancellation refused with 403 `payment_forbidden`: signed in, this attempt is another
 * account's (anyone with the link may pay a guest order); the API lets the same request through
 * without a session (digest §11 #7), so the way out is the link without signing in.
 */
export const CANCEL_FORBIDDEN =
  'این پرداخت از حساب کاربری دیگری آغاز شده است و با این حساب نمی\u{200C}توان از آن انصراف داد. برای انصراف، این لینک را بدون ورود به حساب کاربری (مثلاً در پنجره\u{0654} ناشناس مرورگر) باز کنید یا با پشتیبانی تماس بگیرید.'

export function AttemptNote({ children }: { children: ReactNode }) {
  return (
    <p className="flex items-start gap-2 text-sm leading-6 text-ink-700">
      <Info aria-hidden className="mt-0.5 size-4 shrink-0 text-ink-500" />
      <span>{children}</span>
    </p>
  )
}

export function AttemptError({ children }: { children: ReactNode }) {
  return (
    <p role="alert" className="flex items-start gap-2 text-base leading-7 text-ink-900">
      <CircleAlert aria-hidden className="mt-1 size-5 shrink-0 text-danger" />
      <span>{children}</span>
    </p>
  )
}

/**
 * A press that runs once at a time: busy, it stays focusable (`aria-disabled`), so the focus is
 * still there when the answer comes.
 */
export function AttemptButton({
  busy,
  variant = 'outline',
  onClick,
  children,
}: {
  busy: boolean
  variant?: 'primary' | 'outline'
  onClick: () => void
  children: ReactNode
}) {
  return (
    <Button
      variant={variant}
      aria-disabled={busy || undefined}
      aria-busy={busy || undefined}
      iconStart={busy ? <Spinner size="sm" /> : undefined}
      onClick={onClick}
    >
      {children}
    </Button>
  )
}
