// The words of every comment form of the shop (a product's, a blog post's, a content page's), by
// what it writes. Pure: safe in any bundle.

/**
 * The shop's answer, written in the panel (`is_user_admin`): the same words on a post, on a page
 * and in «دیدگاه‌های من», which lists the replies to both (content digest §4.1).
 */
export const SHOP_ANSWER = 'پاسخ فروشگاه'

/** A root comment (a product's: rating, title and points allowed), a root question, or a reply (text only). */
export type CommentMode = 'comment' | 'question' | 'reply'

/** Each mode's words: the form's name, the text label, its missing-text error and the send button. */
export const COMMENT_COPY: Record<
  CommentMode,
  { title: string; text: string; missing: string; send: string }
> = {
  comment: {
    title: 'ثبت دیدگاه',
    text: 'متن دیدگاه',
    missing: 'متن دیدگاه را بنویسید.',
    send: 'ارسال دیدگاه',
  },
  question: {
    title: 'ثبت پرسش',
    text: 'متن پرسش',
    missing: 'متن پرسش را بنویسید.',
    send: 'ارسال پرسش',
  },
  reply: {
    title: 'ثبت پاسخ',
    text: 'متن پاسخ',
    missing: 'متن پاسخ را بنویسید.',
    send: 'ارسال پاسخ',
  },
}
