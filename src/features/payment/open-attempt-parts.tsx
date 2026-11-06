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

/**
 * The gateways the backend asks itself about a handoff the shopper never came back from: a
 * payment made there is booked on its own, while the attempt stays open (BACKEND-ISSUES B-1). The
 * others' handoffs are closed unasked, and their bank gives the money back.
 */
export const INQUIRING_GATEWAYS: ReadonlySet<string> = new Set(['ZARINPAL', 'ZIBAL', 'IDPAY'])

/** `expired` when the bank is one the backend asks: a payment made there is not lost. */
export const EXPIRED_INQUIRING =
  'اگر پرداخت را در درگاه بانک کامل کرده\u{200C}اید، فروشگاه نتیجه را خودش از بانک می\u{200C}پرسد و پرداخت تا بسته شدن این تلاش خودکار ثبت می\u{200C}شود؛ دوباره پرداخت نکنید. اگر پرداخت نکرده\u{200C}اید، از این تلاش انصراف دهید و دوباره پرداخت کنید.'

/** `expired` when the bank is one the backend does not ask: its money comes back from the bank. */
export const EXPIRED_UNASKED =
  'این تلاش پرداخت دیگر به درگاه نمی\u{200C}رود و به\u{200C}زودی بسته می\u{200C}شود. اگر مبلغی از حساب شما کسر شده، بانک حداکثر ظرف ۷۲ ساعت آن را برمی\u{200C}گرداند. برای پرداخت، از آن انصراف دهید و دوباره پرداخت کنید.'

/** What the `expired` row says, by the bank it went to (null: not known on this device). */
export function expiredText(gatewayCode: string | null): string {
  if (gatewayCode === null) return ROW_TEXTS.expired
  return INQUIRING_GATEWAYS.has(gatewayCode.toUpperCase()) ? EXPIRED_INQUIRING : EXPIRED_UNASKED
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
/** A handoff that leads to no bank's page: said as `gateway_unavailable` is (intent-messages.ts). */
export const BANK_UNAVAILABLE = 'درگاه بانک پاسخ نداد؛ کمی بعد دوباره تلاش کنید.'

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
