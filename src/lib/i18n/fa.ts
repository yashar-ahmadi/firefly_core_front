/**
 * The default interface dictionary: flat `snake_case` keys, Persian values. The operator's
 * overrides (`getTranslations()`) are merged over it by `createTranslator`. Later plans add keys.
 *
 * Invisible characters are written as escapes so no editor or tool can drop them:
 * `\u{200C}` is the zero-width non-joiner and `\u{0654}` the combining hamza (the izafe mark
 * written over a final heh).
 * Pure data: safe in Server and Client Components.
 */
export const fa: Record<string, string> = {
  // Commerce
  currency: 'تومان',
  add_to_cart: 'افزودن به سبد خرید',
  cart: 'سبد خرید',

  // Search and navigation
  search: 'جستجو',
  search_placeholder: 'جستجو در محصولات\u{2026}',
  home: 'خانه',
  categories: 'دسته\u{200C}بندی\u{200C}ها',
  categories_all: 'همه\u{0654} دسته\u{200C}بندی\u{200C}ها',
  see_all: 'مشاهده\u{0654} همه',
  menu: 'منو',
  open_menu: 'باز کردن منو',
  close: 'بستن',
  skip_to_content: 'رفتن به محتوای اصلی',
  back_to_top: 'بازگشت به بالا',

  // Account
  login_register: 'ورود | ثبت\u{200C}نام',
  account: 'حساب من',

  // Shell
  phone_support: 'پشتیبانی تلفنی',
  announcement_dismiss: 'بستن اطلاعیه',

  // Errors
  not_found_title: 'صفحه\u{200C}ای که دنبالش بودید پیدا نشد',
  retry: 'تلاش دوباره',
}
