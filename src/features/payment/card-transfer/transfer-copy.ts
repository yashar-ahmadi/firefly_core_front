import type { ReceiptRejectionCode } from '@/lib/api/types/payment'
import { toPersianDigits } from '@/lib/format/digits'

// The card-transfer page's words (order digest §5.7, §3.2.6, §8.4). Pure.

/** Every view's heading carries it (the page's section is named by it). */
export const HEADING_ID = 'card-transfer-heading'

export const PAGE_TITLE = 'پرداخت کارت به کارت'
export const LEAD =
  'مبلغ را به یکی از کارت\u{200C}های فروشگاه واریز کنید، سپس تصویر رسید واریز را همین\u{200C}جا ثبت کنید.'
export const AMOUNT_LABEL = 'مبلغ قابل واریز'

/** The attempt's own cut-off (`open_attempt.expires_at`), when it can be read. */
export const DEADLINE_ATTEMPT = 'مهلت واریز و ثبت رسید:'
/** Only the order's deadline is known (`card-transfer.expires_at`): said as what it is. */
export const DEADLINE_ORDER = 'مهلت پرداخت سفارش:'
export const DEADLINE_ORDER_NOTE =
  'این پرداخت کارت به کارت ممکن است زودتر از مهلت سفارش بسته شود؛ رسید را هرچه زودتر ثبت کنید.'

export const CARDS_HEADING = 'کارت\u{200C}های فروشگاه'
export const NO_CARDS =
  'فروشگاه اکنون کارتی برای واریز ندارد؛ واریز نکنید و برای پرداخت با پشتیبانی تماس بگیرید یا از این پرداخت انصراف دهید و روش دیگری انتخاب کنید.'
export const FORM_HEADING = 'ثبت رسید واریز'
export const UPLOADING = 'در حال ارسال رسید…'
export const THROTTLED_RECEIPT =
  'ثبت رسید بیش از حد مجاز تلاش شده است؛ پس از پایان زمان زیر دوباره تلاش کنید.'

export const RECEIPT_SENT = 'رسید ثبت شد و در صف بررسی است'
export const ALREADY_SENT = 'رسید قبلاً ثبت شده است'
export const REVIEW_BODY =
  'کارشناس فروشگاه رسید را بررسی می\u{200C}کند و نتیجه با پیامک به شما اعلام می\u{200C}شود. تا پایان بررسی، این سفارش قابل پرداخت یا لغو نیست.'
export const REVIEW_AUTO =
  'این صفحه نتیجهٔ بررسی را خودکار می\u{200C}خواند؛ لازم نیست آن را تازه کنید.'
export const REVIEW_STOPPED =
  'نتیجهٔ بررسی هنوز اعلام نشده است؛ بعداً آن را در سفارش\u{200C}ها یا «پیگیری سفارش» ببینید.'

export const APPROVED_TITLE = 'رسید تأیید شد'
export const approvedBody = (code: string | null) =>
  code
    ? `پرداخت سفارش ${toPersianDigits(code)} ثبت شد و سفارش در حال انجام است.`
    : 'پرداخت این سفارش ثبت شد و سفارش در حال انجام است.'

export const REJECTED_TITLE = 'رسید پذیرفته نشد'
export const REJECTED_BODY =
  'رسید این پرداخت تأیید نشد و سفارش دوباره در انتظار پرداخت است. می\u{200C}توانید دوباره پرداخت کنید.'
export const REJECTED_REASON = 'دلیل رد رسید:'
export const REJECTED_GUEST =
  'دلیل رد رسید با پیامک برایتان فرستاده شده است. اگر پیامکی دریافت نکرده\u{200C}اید یا پرسشی دارید، با پشتیبانی تماس بگیرید.'
/** The rejection codes, in the shop's own words (the admin's labels). */
export const REJECTION_LABELS: Record<ReceiptRejectionCode, string> = {
  amount_mismatch: 'مغایرت مبلغ',
  image_unreadable: 'تصویر ناخوانا',
  not_in_statement: 'در صورت\u{200C}حساب بانکی یافت نشد',
  duplicate: 'رسید تکراری',
  other: 'سایر',
}

export const CLOSED_TITLE = 'این پرداخت بسته شده است'
export const CLOSED_BODY =
  'این پرداخت کارت به کارت دیگر باز نیست و رسیدی برای آن پذیرفته نمی\u{200C}شود. اگر هنوز واریز نکرده\u{200C}اید، پرداخت تازه\u{200C}ای آغاز کنید؛ اگر مبلغی واریز کرده\u{200C}اید، با پشتیبانی تماس بگیرید.'

export const CANCELLED_TITLE = 'پرداخت کارت به کارت لغو شد'
export const CANCELLED_BODY =
  'این پرداخت کارت به کارت بسته شد. برای پرداخت سفارش، پرداخت تازه\u{200C}ای آغاز کنید یا روش دیگری انتخاب کنید.'

/**
 * The shop gave the money back (`refunded`): nothing to pay again here. Who gave it back, never
 * where it went (a wallet or a bank account: not told) nor which page to open (the offers below
 * say that: the order's page for its confirmed owner, tracking for anyone else).
 */
export const REFUNDED_TITLE = 'مبلغ این پرداخت بازگردانده شد'
export const REFUNDED_BODY = 'مبلغ این پرداخت از سوی فروشگاه بازگردانده شده است.'
export const CANCEL_LABEL = 'انصراف از کارت به کارت'
export const CANCEL_TITLE = 'از پرداخت کارت به کارت انصراف می\u{200C}دهید؟'
export const CANCEL_PAID_NOTE =
  'اگر مبلغ را واریز کرده\u{200C}اید انصراف ندهید؛ رسید آن را ثبت کنید.'
export const UNDER_REVIEW_NO_CANCEL =
  'رسید این پرداخت ثبت شده و در حال بررسی است؛ امکان انصراف نیست.'

export const PAY_AGAIN = 'پرداخت دوباره'
export const OTHER_ROUTE = 'پرداخت با روش دیگر'
export const ATTEMPT_OPEN_OTHER =
  'پرداخت نیمه\u{200C}تمام دیگری برای این سفارش باز است؛ آن را از صفحهٔ پرداخت سفارش ادامه دهید یا از آن انصراف دهید.'
