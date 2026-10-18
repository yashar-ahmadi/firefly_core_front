import type { GuestOrder } from '@/features/orders/guest-orders'
import { formatToman, toPersianDigits } from '@/lib/format'
import type { PlacedContext } from '../placed-order'

// What the thanks page says (spec §8.7; order digest §5.1–5.2, §5.8): only what the server said
// in this tab (the placement and the payment's answers, recorded on the placed order). A guest
// order found on this device, or nothing at all (another device, cleared storage), never gets a
// claim about its payment: the page shows the ways to find out. Pure.

export type ThanksTone = 'success' | 'pending' | 'warning' | 'info'

export interface ThanksCopy {
  tone: ThanksTone
  title: string
  body: string
  /** Offer «تأیید سفارش» again (a pay-on-delivery order whose confirmation failed). */
  confirm: boolean
  /** Show the payment link and deadline (something may still be owed). */
  payable: boolean
}

export function thanksCopy(
  code: string,
  ctx: PlacedContext | null,
  guestOrder: GuestOrder | null,
  signedIn: boolean,
): ThanksCopy {
  if (ctx) {
    switch (ctx.outcome) {
      case 'confirmed':
        return {
          tone: 'success',
          title: 'سفارش شما تأیید شد',
          body: ctx.free
            ? 'سفارش رایگان شما ثبت و تأیید شد و به\u{200C}زودی آماده\u{0654} ارسال می\u{200C}شود.'
            : `سفارش شما تأیید شد؛ مبلغ ${formatToman(ctx.D)} هنگام تحویل پرداخت می\u{200C}شود.`,
          confirm: false,
          payable: false,
        }
      case 'paid':
        return {
          tone: 'success',
          title: 'سفارش شما پرداخت شد',
          body: 'پرداخت با کیف پول انجام شد و سفارش شما در حال پردازش است.',
          confirm: false,
          payable: false,
        }
      case 'unconfirmed':
        return {
          tone: 'warning',
          title: 'سفارش ثبت شد اما هنوز تأیید نشده است',
          body: `${ctx.failure ? `${ctx.failure} ` : ''}تا پایان مهلت پرداخت می\u{200C}توانید سفارش را تأیید کنید؛ پس از تأیید، مبلغ هنگام تحویل پرداخت می\u{200C}شود.`,
          confirm: true,
          payable: true,
        }
      case 'settled':
        return {
          tone: 'info',
          title: `سفارش ${toPersianDigits(code)}`,
          body: ctx.failure ?? 'برای این سفارش مبلغ پرداخت\u{200C}نشده\u{200C}ای باقی نمانده است.',
          confirm: false,
          payable: false,
        }
      default:
        return {
          tone: 'pending',
          title: 'سفارش شما ثبت شد',
          body: 'این سفارش در انتظار پرداخت است؛ تا پایان مهلت پرداخت، آن را پرداخت کنید تا آماده\u{0654} ارسال شود.',
          confirm: false,
          payable: true,
        }
    }
  }
  if (guestOrder) {
    return {
      tone: 'info',
      title: `سفارش ${toPersianDigits(code)}`,
      body: 'این سفارش در این دستگاه ثبت شده است. برای پرداخت یا دیدن وضعیت آن از لینک پرداخت یا پیگیری سفارش استفاده کنید.',
      confirm: false,
      payable: true,
    }
  }
  return {
    tone: 'info',
    title: `سفارش ${toPersianDigits(code)}`,
    body: signedIn
      ? 'وضعیت این سفارش را در «سفارش\u{200C}های من» ببینید یا آن را با کد سفارش و شماره\u{0654} موبایل پیگیری کنید.'
      : 'جزئیات این سفارش در این مرورگر در دسترس نیست. وضعیت آن را با کد سفارش و شماره\u{0654} موبایل پیگیری کنید.',
    confirm: false,
    payable: false,
  }
}
