import type { FaqCategory, FaqItem } from '@/lib/api/types/faq'

// The help centre as the dev backend answers it (blog-faq digest §2.1: four categories, plain-text
// answers), plus the shapes the digest warns about: an empty category, CKEditor HTML with a
// relative `/media` picture and a script.

const DATE = '2026-01-06T15:00:00+03:30'

export function faqItem(id: number, question: string, answer: string): FaqItem {
  return { id, question, answer, created: DATE, updated: DATE }
}

export function faqCategory(id: number, name: string, items: FaqItem[]): FaqCategory {
  return { id, name, items, created: DATE, updated: DATE }
}

/** Server order: by id. The names would sort differently (پرداخت before سفارش). */
export const FAQ_CATEGORIES: FaqCategory[] = [
  faqCategory(10001, 'سفارش و خرید', [
    faqItem(10001, 'چطور سفارش خود را ثبت کنم؟', 'کالا را به سبد خرید اضافه کنید.'),
    faqItem(10002, 'آیا می توانم بدون ثبت نام خرید کنم؟', 'بله، خرید مهمان فعال است.'),
  ]),
  faqCategory(10002, 'ارسال و تحویل', [
    faqItem(10004, 'سفارش من چند روزه می رسد؟', 'ارسال در تهران ۱ تا ۲ روز کاری است.'),
    faqItem(10005, 'هزینه ارسال چطور محاسبه می شود؟', 'بر اساس وزن مرسوله محاسبه می شود.'),
  ]),
  // A visible category whose questions are all hidden: still listed, with no items.
  faqCategory(10005, 'دسته\u{200C}ای بی\u{200C}پرسش', []),
  faqCategory(10003, 'پرداخت و بازگشت وجه', [
    faqItem(
      10007,
      'چه روش\u{200C}های پرداختی دارید؟',
      '<p>درگاه بانکی و <a href="/page/terms/">کیف پول</a>.</p>' +
        '<img src="/media/uploads/faq/gateways.png" onerror="alert(1)">' +
        '<script>alert("x")</script><a href="javascript:alert(2)">بیشتر</a>',
    ),
  ]),
]
