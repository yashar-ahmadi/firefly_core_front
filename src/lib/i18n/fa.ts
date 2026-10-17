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
  recently_viewed: 'بازدیدهای اخیر',

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
  back: 'بازگشت',
  skip_to_content: 'رفتن به محتوای اصلی',
  back_to_top: 'بازگشت به بالا',
  main_navigation: 'منوی اصلی',
  bottom_navigation: 'منوی پایین',
  quick_links: 'دسترسی سریع',
  menu_all_products: 'همه\u{0654} محصولات {name}',
  menu_view: 'مشاهده\u{0654} {name}',
  categories_empty: 'هنوز دسته\u{200C}بندی\u{200C}ای ثبت نشده است.',
  subcategories_empty: 'این دسته زیردسته\u{200C}ای ندارد.',

  // Account
  login: 'ورود',
  login_register: 'ورود | ثبت\u{200C}نام',
  account: 'حساب من',
  account_of: 'حساب کاربری: {name}',
  account_dashboard: 'پیشخوان',
  account_orders: 'سفارش\u{200C}ها',
  account_wishlist: 'علاقه\u{200C}مندی\u{200C}ها',
  account_addresses: 'نشانی\u{200C}ها',
  account_notifications: 'اعلان\u{200C}ها',
  notifications_unread: 'اعلان خوانده\u{200C}نشده دارید',
  logout: 'خروج',
  cart_count: 'سبد خرید، {count} کالا',

  // Shell
  support: 'پشتیبانی',
  phone_support: 'پشتیبانی تلفنی',
  announcement: 'اطلاعیه',
  announcement_dismiss: 'بستن اطلاعیه',

  // Footer
  footer_navigation: 'پیوندهای پایین صفحه',
  useful_links: 'لینک\u{200C}های مفید',
  contact_us: 'ارتباط با ما',
  contact_phone: 'تلفن تماس',
  contact_email: 'ایمیل',
  contact_address: 'نشانی',
  postal_code: 'کد پستی: {code}',
  view_on_map: 'مشاهده روی نقشه',
  response_time: 'ساعات پاسخ\u{200C}گویی',
  support_chat: 'گفتگو با پشتیبانی',
  follow_us: 'ما را دنبال کنید',
  download_app: 'دریافت اپلیکیشن',
  app_get_from: 'دریافت از',
  app_direct_download: 'دانلود مستقیم',
  app_google_play: 'گوگل\u{200C}پلی',
  app_bazaar: 'بازار',
  app_myket: 'مایکت',
  app_app_store: 'اپ\u{200C}استور',
  app_sibapp: 'سیب\u{200C}اپ',
  app_sibche: 'سیبچه',
  app_anardoni: 'اناردونی',
  app_android: 'اندروید',
  app_ios: 'iOS',
  app_use: 'استفاده از',
  app_web: 'نسخه\u{0654} وب',
  trust_badges: 'نمادهای اعتماد',
  breadcrumb: 'مسیر صفحه',

  // System pages
  not_found_title: 'صفحه\u{200C}ای که دنبالش بودید پیدا نشد',
  not_found_meta_title: 'صفحه پیدا نشد',
  not_found_code: 'خطای ۴۰۴',
  not_found_text:
    'شاید نشانی را اشتباه وارد کرده\u{200C}اید یا این صفحه جابه\u{200C}جا یا حذف شده است. می\u{200C}توانید جستجو کنید یا از پیوندهای زیر به بخش دیگری بروید.',
  not_found_main_categories: 'دسته\u{200C}بندی\u{200C}های اصلی',
  home_page: 'صفحه\u{0654} اصلی',
  error_title: 'مشکلی پیش آمد',
  error_text:
    'متأسفیم، نمایش این صفحه با خطا روبه\u{200C}رو شد. دوباره تلاش کنید؛ اگر درست نشد، چند دقیقه بعد سر بزنید.',
  error_reference: 'کد پیگیری',
  retry: 'تلاش دوباره',
  loading: 'در حال بارگذاری\u{2026}',
}
