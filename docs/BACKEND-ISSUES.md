# گزارش یکپارچهٔ مشکلات backend فایرفلای (Firefly Core)

این گزارش مشکلات و ناهمخوانی‌هایی را که هنگام ساخت storefront (Next.js) برای backend فایرفلای (Django REST) پیدا شد در یک سند و بدون تکرار گرد آورده است. منبع آن هفت digest یکپارچه‌سازی در `docs/backend-integration/` است (`auth-settings.md`، `blog-faq-dashboard-notification.md`، `cart-address.md`، `content.md`، `order-payment.md`، `product.md`، `seo-cache-deploy.md`). هر digest بخشی با عنوان «Suspected backend bugs / inconsistencies» دارد و `order-payment.md` بخش «Open questions for the backend team» هم دارد. **storefront هیچ تغییری در کد backend نداده است.** همهٔ موارد زیر فقط گزارش‌اند و «راه‌حل» هر مورد کاری است که سمت storefront انجام می‌شود یا تصمیمی که به تیم backend/ops برمی‌گردد. موردی از خارج از digestها اضافه نشده است. هرجا digest نسبت به چیزی مطمئن نبوده (مثلاً فقط از روی مستندات یا فقط با خواندن کد)، همان نکته در متن آمده است. تاریخ راستی‌آزمایی‌های زنده: ۲۰۲۶-۱۰-۱۵ روی dev server (`http://localhost:8000`).

**شیوهٔ راستی‌آزمایی (در هر مورد)**
- **live**: روی dev server اجرا و مشاهده شده است.
- **code**: از روی سورس backend (فقط خواندن) تأیید شده است.
- **doc**: فقط در راهنمای backend آمده و بازتولید نشده است.
- **schema**: از روی OpenAPI (`schema.yaml`) است.

**معنای سطح‌ها**
- «بحرانی»: پول، امنیت، از دست رفتن داده، یا پرداختی که بی‌صدا شکست می‌خورد.
- «مهم»: رفتار نادرستی که مشتری می‌تواند به آن برخورد کند.
- «جزئی»: ناهمخوانی schema/مستندات، غلط تایپی، موارد ظاهری.
- «پیکربندی لازم برای استقرار» و «داده‌های نمونه (fixtures)» باگ نیستند و در شمارش باگ‌ها نیامده‌اند.

## خلاصه

| بخش | تعداد |
|---|---|
| بحرانی | 2 |
| مهم | 18 |
| جزئی | 32 |
| جمع باگ‌ها و ناهمخوانی‌ها | 52 |
| پیکربندی لازم برای استقرار (باگ نیست) | 9 |
| داده‌های نمونه (fixtures) (باگ نیست) | 8 |
| پرسش‌های باز برای تیم backend | 8 |

شناسهٔ هر مورد (مثل `M-3`) برای ارجاع بین بخش‌هاست. مواردی که چند digest جداگانه گزارش کرده بودند در یک مورد ادغام شده و «بخش‌های متأثر» در همان مورد نوشته شده است.

---

## بحرانی

#### B-1. پرداختی که مرورگر مشتری از بانک برنمی‌گردد هرگز verify نمی‌شود
- **محل:** `gateways/services/reconciliation.py` (`reconcile_gateway_transactions`، `_rows_to_verify`، `_expire_unused_handoffs`)؛ `docs/deployment.txt:294`؛ endpoint بازگشت از بانک `/api/v1/payment/gateway/callback/{gateway}/{token}/`.
- **چه می‌شود:** cron مربوط به reconcile فقط ردیف‌های `VERIFIABLE_STATUSES` یعنی `RETURN_FROM_BANK` و `ERROR` را دوباره verify می‌کند. ردیف‌هایی که هنوز `REDIRECT_TO_BANK` هستند (مشتری پرداخت کرده و تب را بسته، 3-DS در مرورگر دیگری تمام شده، یا callback proxy در storefront خراب است) بعد از انقضای handoff پانزده‌دقیقه‌ای فقط به `EXPIRE_GATEWAY_TOKEN` تغییر می‌کنند (docstring: "No money moved"). متد `inquire()` آداپترها در هیچ جای کد فراخوانی نمی‌شود. بعد از آن attempt با `payment_attempt_expired` منقضی می‌شود و سفارش پرداخت‌نشده می‌ماند.
- **انتظار:** `docs/deployment.txt:294` و docstring همان ماژول («Finishing the payments whose customers never came back») می‌گویند cron این پرداخت‌ها را ثبت می‌کند.
- **نکتهٔ digest:** پرداخت‌یارهای ایرانی «معمولاً» capture تأییدنشده را خودکار برمی‌گردانند، پس مشتری از بانک پولش را پس می‌گیرد و سفارش unpaid می‌ماند. این برداشت digest است و در dev بررسی نشده.
- **راستی‌آزمایی:** code.
- **اثر روی storefront:** callback proxy (ر.ک. `K-5`) حیاتی است. اگر درخواست بازگشت از بانک به Django نرسد، پرداخت هرگز ثبت نمی‌شود، حتی اگر پول کسر شده باشد.
- **راه‌حل در storefront:** صفحهٔ نتیجه بعد از بازگشت گم‌شده باید بگوید: «اگر مبلغی کسر شده، بانک ظرف ۷۲ ساعت برمی‌گرداند؛ لطفاً دوباره پرداخت کنید». راه‌حل واقعی (reconcile با `inquire()`) سمت backend است.
- **منبع:** order-payment §11 #15 (و §0 #1).

#### B-2. احتمال فروش با قیمت صفر وقتی قیمت زیر مبلغ تخفیف زمان‌دار می‌افتد (تأییدنشده)
- **محل:** محاسبهٔ قیمت کاتالوگ (`final_price`، `discount_percent`) و شارژ سبد (`/api/v1/cart/*`).
- **چه می‌شود:** اگر قیمت محصول از مبلغ یک تخفیف زمان‌دارِ فعال کمتر شود، `final_price` برابر 0 و `discount_percent` برابر 100 می‌شود و سبد مبلغ 0 را شارژ می‌کند.
- **راستی‌آزمایی:** **فقط doc.** digest محصول صریحاً می‌گوید «در راهنمای کاتالوگ مستند است، دوباره آزمایش نشد». بازتولید روی dev هم ممکن نیست چون هیچ تخفیف فعالی وجود ندارد (ر.ک. `F-2`).
- **اثر روی storefront:** اگر درست باشد، می‌توان کالا را با ۰ تومان سفارش داد.
- **راه‌حل در storefront:** در digest نیامده. نیاز به تأیید و رفع سمت backend دارد.
- **منبع:** product §11 #16.

---

## مهم

### پرداخت و سفارش

#### M-1. top-up اصلاحیهٔ منقضی‌شده برای همیشه `is_payable: true` می‌ماند
- **محل:** `GET /api/v1/order/list/` و `GET /api/v1/order/<order_code>/` (فیلدهای `is_payable`، `is_fully_paid`، `amount_outstanding_online`)؛ `POST /api/v1/payment/order/<order_uuid>/intent/`؛ `GET /api/v1/order/pay/<token>/`.
- **چه می‌شود:** سفارش `7330195771` (کاربر j.abbasi) در وضعیت `processing` است با `is_payable: true` و `amount_outstanding_online: 3,814,182`. ولی intent پاسخ 409 `order_hold_expired` می‌دهد و لینک پاسخ 410. هیچ sweep روی سفارش‌های غیر از `awaiting_payment` اثر نمی‌گذارد و `is_payable` مهلت را نادیده می‌گیرد. هم‌زمان `is_fully_paid: true` است، در حالی که delta هنوز بدهکار است. list و detail مهلت پرداخت را منتشر نمی‌کنند؛ فقط `expires_at` صفحهٔ لینک و `payment_expires_at` در placement آن را نشان می‌دهند.
- **انتظار:** `is_payable` باید مهلت/پنجرهٔ اصلاحیه را رعایت کند و مهلت در list/detail هم بیاید (پرسش باز Q-1).
- **راستی‌آزمایی:** live.
- **اثر روی storefront:** دکمهٔ «پرداخت» برای مبلغی که دیگر قابل پرداخت نیست نمایش داده می‌شود.
- **راه‌حل در storefront:** کامل ندارد؛ فقط با `payment_expires_at`/`expires_at` (جایی که موجود است) می‌شود دکمه را پنهان کرد.
- **منبع:** order-payment §11 #6.

#### M-2. replay کردن intent پرداخت کارت‌به‌کارت، `destination_cards` را خالی برمی‌گرداند
- **محل:** `POST /api/v1/payment/order/<order_uuid>/intent/` و `POST /api/v1/payment/link/<token>/intent/` با `route: 'card_transfer'`؛ `payment/services/intent.py` (`_open_order_attempt` و `_replayed_attempt`).
- **چه می‌شود:** ارسال دوبارهٔ همان `Idempotency-Key` پاسخ 201 با همان پرداخت pending می‌دهد، اما `destination_cards: []` است (پاسخ اول دو کارت داشت). مسیر replay فقط `PaymentIntent(payment, status)` می‌سازد، بنابراین `destination_cards` و `delivery_collection` در هر replay خالی/null است (replay مسیر بانکی `handoff` را بازسازی می‌کند).
- **انتظار:** مستندات قول می‌دهند replay «همان attempt» را برگرداند (پرسش باز Q-2).
- **راستی‌آزمایی:** live.
- **اثر روی storefront:** با double-click یا retry شبکه، صفحهٔ پرداخت بدون شمارهٔ کارت مقصد نمایش داده می‌شود.
- **راه‌حل در storefront:** همیشه کارت‌ها را با `GET /api/v1/payment/<uuid>/card-transfer/` بخوانید.
- **منبع:** order-payment §11 #1 (و §0 #11).

#### M-3. مسیر `wallet` ردیف «دریافت در محل» (`delivery_collection`) را نمی‌سازد
- **محل:** `payment/services/intent.py` (`_open_wallet` در برابر `_open_delivery_collection`)؛ فیلد `delivery_collection` در پاسخ intent (`POST /api/v1/payment/order/<order_uuid>/intent/`) و سفارش.
- **چه می‌شود:** سفارش `0404614013` (COD با هزینهٔ ارسال آنلاین ۷۰,۰۰۰ که با wallet پرداخت شد) `delivery_collection: null` دارد و در history هم ردیف `delivery_collection` نیست. مسیرهای `bank_gateway`، `card_transfer` و `wallet_and_gateway` `_open_delivery_collection` را صدا می‌زنند ولی `_open_wallet` نه. مستندات API می‌گویند هر سفارشی که سهم «درب منزل» دارد این ردیف را دارد.
- **انتظار:** مثل بقیهٔ مسیرهای آنلاین ردیف ساخته شود (پرسش باز Q-3). اثر این موضوع بر ثبت وجه دریافتی در محل در سمت backend در digest بررسی نشده است.
- **راستی‌آزمایی:** live.
- **اثر روی storefront:** نمایش «مبلغ قابل دریافت در محل» از `delivery_collection` ناقص یا خالی می‌شود.
- **راه‌حل در storefront:** مبلغ درب منزل را از `money.amount_to_collect_on_delivery` نشان دهید، نه از `delivery_collection`.
- **منبع:** order-payment §11 #2.

#### M-4. فهرست درگاه‌ها (`gateway/list`) با درگاه‌های واقعاً قابل استفاده یکی نیست
- **محل:** `GET /api/v1/payment/gateway/list/` (فقط `is_active` را فیلتر می‌کند: `GatewayConfig.objects.usable()`) در برابر intent (نیاز به adapter + credentials قابل خواندن: `gateways/services/accounts.py::_is_usable`).
- **چه می‌شود:** درگاه `ZARINPAL` در فهرست هست، اما intent با `gateway_code: 'ZARINPAL'` پاسخ 400 `gateway_unknown` می‌دهد و بدون `gateway_code` پاسخ 503 `gateway_not_configured`.
- **انتظار:** فهرست باید از همان predicate `_is_usable` استفاده کند (پرسش باز Q-4).
- **راستی‌آزمایی:** live (dev).
- **اثر روی storefront:** ممکن است بانکی پیشنهاد شود که هرگز کار نمی‌کند.
- **راه‌حل در storefront:** در digest نیامده. حداقل دو کد `gateway_unknown` و `gateway_not_configured` باید جداگانه مدیریت شوند. (در dev علتش credentials غیرقابل‌رمزگشایی است، ر.ک. `K-2`.)
- **منبع:** order-payment §11 #3.

#### M-5. لینک پرداخت سفارشِ پرداخت‌شده بعد از ۷۲ ساعت «منقضی شده، با پشتیبانی تماس بگیرید» می‌گوید
- **محل:** `GET /api/v1/order/pay/<token>/` (`resolve_payment_link`).
- **چه می‌شود:** برای سفارش تحویل‌شدهٔ `6270624849` پاسخ 410 `order_payment_link_expired` با متن «…برای پرداخت با پشتیبانی تماس بگیرید» می‌آید. `resolve_payment_link` مهلت را قبل از `order_already_settled` بررسی می‌کند، پس بعد از ۷۲ ساعت هر لینک SMS قدیمیِ یک سفارش *پرداخت‌شده* این پیام گمراه‌کننده را نشان می‌دهد. در ۷۲ ساعت اول همان لینک `order_already_settled` می‌گوید (live: `7573331679`).
- **انتظار:** ترتیب باید «settled قبل از expired» باشد (پرسش باز Q-5).
- **راستی‌آزمایی:** live.
- **اثر روی storefront:** مشتریِ پرداخت‌کرده پیام «برای پرداخت با پشتیبانی تماس بگیرید» می‌بیند.
- **راه‌حل در storefront:** در digest نیامده.
- **منبع:** order-payment §11 #4.

#### M-6. `order_already_settled` برای سفارشی که هنوز مبلغ درب منزل دارد
- **محل:** `GET /api/v1/order/pay/<token>/`.
- **چه می‌شود:** سفارش `0404614013`: سهم آنلاین پرداخت شده ولی ۲۸۹,۰۰۰ هنوز درب منزل بدهکار است؛ لینک می‌گوید «برای این سفارش مبلغ پرداخت‌نشده‌ای باقی نمانده است». رفع CHK-19 فقط حالت A==0 را پوشش می‌دهد.
- **انتظار:** متن جداگانه برای حالتی که D>0 است (پرسش باز Q-5).
- **راستی‌آزمایی:** live.
- **اثر روی storefront:** پیام ناقص/گمراه‌کننده در صفحهٔ لینک پرداخت.
- **راه‌حل در storefront:** وقتی D>0 است متن خودتان را نشان دهید.
- **منبع:** order-payment §11 #5.

#### M-7. با ورود به حساب، دسترسی به وضعیت پرداخت کمتر می‌شود
- **محل:** `GET /api/v1/payment/<uuid>/status/` (`payment/services/access.py`).
- **چه می‌شود:** برای پرداختِ حساب دیگر، با Bearer پاسخ 403 `payment_forbidden` می‌آید ولی بدون احراز هویت 200. چون مسیرهای غیر wallet اجازه می‌دهند هر کاربر واردشده سفارش دیگری را با لینکش پرداخت کند، صفحهٔ نتیجهٔ همان پرداخت‌کننده با token خودش 403 می‌گیرد.
- **انتظار:** نامشخص؛ digest می‌پرسد آیا این عدم تقارن عمدی است (پرسش باز Q-6).
- **راستی‌آزمایی:** live.
- **اثر روی storefront:** polling صفحهٔ نتیجه برای کاربر واردشده‌ای که سفارش کس دیگری را پرداخت کرده خطا می‌دهد.
- **راه‌حل در storefront:** روی 403 یک بار بدون `Authorization` تکرار کنید.
- **منبع:** order-payment §11 #7.

#### M-8. دو سقف مستقل برای COD، و سقف `card_transfer` با کل مبلغ مقایسه می‌شود
- **محل:** `cart/services/checkout.py:122` (سقف `cod_max_amount` روش ارسال) و `payment/services/intent.py` گام ۵ (`max_amount` مسیر `pay_on_delivery` در `PaymentMethodSetting`؛ در fixtureها ۲۰,۰۰۰,۰۰۰).
- **چه می‌شود:** سبد COD را تا `cod_max_amount` روش ارسال می‌پذیرد، ولی `max_amount` مسیر `pay_on_delivery` فقط هنگام تأیید بررسی می‌شود. اگر اپراتور سقف مسیر را کمتر از `cod_max_amount` یک روش بگذارد، سفارش COD خالص ثبت می‌شود اما هرگز تأیید نمی‌شود (409 `payment_method_amount_exceeded`) و بعد از ۷۲ ساعت خودکار لغو می‌شود. همچنین `max_amount` مسیر `card_transfer` با کل `amount_charged_online` سفارش مقایسه می‌شود، نه با مبلغ باقی‌مانده؛ پس مثلاً delta کوچک اصلاحیه روی سفارش بزرگ رد می‌شود.
- **راستی‌آزمایی:** code.
- **اثر روی storefront:** سفارشی که مشتری ثبت کرده بی‌خبر لغو می‌شود؛ پرداخت delta کوچک رد می‌شود.
- **راه‌حل در storefront:** در digest نیامده. خطای 409 `payment_method_amount_exceeded` را نمایش دهید. (مرتبط: `J-28`.)
- **منبع:** order-payment §11 #10.

### سبد خرید و آدرس

#### M-9. `PUT` بی‌تغییر روی سبد، انتخاب ارسال را پاک می‌کند
- **محل:** `PUT /api/v1/cart/item/{id}/` (مثال: `/cart/item/10123/`).
- **چه می‌شود:** راهنما PUT را «مطلق و بی‌خطر برای تکرار» می‌خواند. اما در عمل `PUT /cart/item/10123/ {quantity:2}` روی خطی که از قبل ۲ بود، `shipping.is_selected` را false کرد و `cash_on_delivery` را حذف کرد (با GET تأیید شد).
- **انتظار:** PUT با مقدار تکراری نباید انتخاب ارسال را تغییر دهد.
- **راستی‌آزمایی:** live.
- **اثر روی storefront:** stepper که همان مقدار را دوباره می‌فرستد یا retry شبکه، انتخاب ارسال را بی‌صدا لغو می‌کند.
- **راه‌حل در storefront:** وقتی تعداد تغییر نکرده PUT نفرستید و قبل از پرداخت همیشه `shipping.is_selected` را دوباره بررسی کنید.
- **منبع:** cart-address §13 #1.

#### M-10. merge سبد، مقصد (destination) سبد مهمان را دور می‌ریزد حتی وقتی سبد کاربر مقصد ندارد
- **محل:** `POST /api/v1/cart/merge/` (و merge ضمنی با token مهمان بعد از login).
- **چه می‌شود:** با کاربر kamran: سبد مهمان مقصد اصفهان/اصفهان داشت، سبد کاربر `destination: null`؛ بعد از merge مقصد `null` شد. راهنماها در جدول invalidation و بخش merge فقط coupon و shipping را ذکر می‌کنند و مقصد را نه (این رفتار مستند نیست).
- **انتظار:** حداقل وقتی سبد کاربر مقصد ندارد، مقصد سبد مهمان حفظ شود (یا رفتار مستند شود).
- **راستی‌آزمایی:** live.
- **اثر روی storefront:** مشتری بعد از ورود باید مقصد را دوباره انتخاب کند و ممکن است متوجه نشود.
- **راه‌حل در storefront:** بعد از login و merge، مرحلهٔ انتخاب مقصد را دوباره اجرا کنید.
- **منبع:** cart-address §13 #2 و §3.11.

### احراز هویت

#### M-11. `register/resend-otp` مقدار `otp_method` ناسازگار را می‌پذیرد و ذخیره می‌کند
- **محل:** `POST /api/v1/account/auth/register/resend-otp/` (`account/services/registration.py::resend_registration_otp`).
- **چه می‌شود:** `pending.otp_channel` قبل از ارسال و بدون بررسی سازگاری (که `register/start` انجام می‌دهد) بازنویسی می‌شود.
  - `email` روی ثبت‌نام با تلفن: `send_mail_now(to=None)` مقدار 0 برمی‌گرداند بدون خطا؛ نتیجه 200 «کد دوباره ارسال شد» است ولی هیچ چیزی ارسال نشده و کد قبلی هم باطل شده.
  - `sms` یا `telegram` روی ثبت‌نام با ایمیل: یا با `auth_otp_channel_unavailable`/`auth_otp_send_failed` شکست می‌خورد یا به تلفن null می‌فرستد. در هر دو حالت کانال بد ذخیره می‌ماند و resendهای بعدی بدون `otp_method` هم شکست می‌خورند.
- **انتظار:** 400 `validation_error` روی `otp_method`، مثل `register/start`.
- **راستی‌آزمایی:** code (خود راهنما هم این را تأیید می‌کند).
- **اثر روی storefront:** ثبت‌نام می‌تواند گیر کند.
- **راه‌حل در storefront:** فقط کانال‌های سازگار را به کاربر پیشنهاد دهید.
- **منبع:** auth-settings §13 #1.

### SEO، ساختار URL و محتوا

#### M-12. JSON-LD و لینک SMS «بازگشت موجودی» با `https://{SITE_DOMAIN}` ساخته می‌شوند، نه `STOREFRONT_URL`
- **محل:** `product/services/structured_data.py:20-21`، `blog/services/structured_data.py:14-15`، `utils/absolute_urls.py`، `product/services/notifications.py:135`؛ در برابر sitemap (`utils/sitemaps.py::StorefrontSitemap`)، لینک پرداخت، callback بانک، خط `Sitemap:` در robots، short link و linker که همه از `STOREFRONT_URL` ساخته می‌شوند. مثال‌های `GET /api/v1/product/detail/apple-iphone-15/` و `GET /api/v1/blog/post/…`.
- **چه می‌شود:**
  - در dev: `offers.url` در JSON-LD برابر `https://localhost/product/samsung-galaxy-s25-ultra/` است ولی `<loc>` در sitemap برابر `http://localhost:3000/product/samsung-galaxy-s25-ultra/`. برای blog: `@id` برابر `https://localhost/blog/best-phones-under-30m/` در برابر `http://localhost:3000/blog/best-phones-under-30m/`.
  - scheme در کد blog ثابت `https` است. breadcrumb ریشه هم `https://{SITE_DOMAIN}/` است.
  - `image` و `logo` ناشر در JSON-LD برابر `https://{SITE_DOMAIN}/media/...` است، در حالی که بقیهٔ فیلدهای تصویر API روی host درخواست هستند (`http://localhost:8000/media/...`). پس دامنهٔ `SITE_DOMAIN` باید `/media/` و `/static/` را سرو کند، که در هیچ‌جا به‌عنوان نیاز storefront مستند نشده.
  - راهنمای settings می‌گوید URLهای sitemap «همان مسیرهایی است که structured data به آن اشاره می‌کند». مسیرها یکی‌اند، اما host و scheme هر وقت `STOREFRONT_URL` برابر `https://SITE_DOMAIN` نباشد فرق می‌کنند. docstring فایل `utils/sitemaps.py` فرض می‌کند این دو برابرند.
- **انتظار:** URLهای JSON-LD، لینک SMS و sitemap همه از یک origin ساخته شوند.
- **راستی‌آزمایی:** live + code.
- **بخش‌های متأثر:** auth-settings (sitemap/JSON-LD)، blog (JSON-LD و تصاویر)، product (JSON-LD، breadcrumb و SMS)، seo (کل ماجرا).
- **اثر روی storefront:** canonical/JSON-LD برگرفته از API ممکن است به origin دیگری از sitemap اشاره کند؛ SMS «بازگشت موجودی» به origin اشتباه می‌رود؛ تصاویر JSON-LD اگر `/media/` روی `SITE_DOMAIN` سرو نشود 404 می‌دهند. اگر `SITE_DOMAIN` برابر host API باشد، URL صفحه‌ها اشتباه است؛ اگر برابر دامنهٔ storefront باشد، تصاویر بدون proxy خراب می‌شوند.
- **راه‌حل در storefront:** canonical را از `STOREFRONT_URL + path` بسازید؛ قبل از embed کردن JSON-LD origin آدرس صفحه‌ها را بازنویسی کنید؛ `/media/` و `/static/` را در دامنه proxy کنید. راه‌حل اصلی پیکربندی است (ر.ک. `K-3`).
- **منبع:** auth-settings §13 #4، blog §7 #1، product §11 #2، seo §14 #1-#2.

#### M-13. meta tagهایی که پنل ثبت می‌کند برای محصول/دسته/برند/لیست/blog هرگز منتشر نمی‌شوند
- **محل:** `SeoAdminMixin.inlines = (MetadataAdminInline,)` که به Category، ProductList، Product، Brand (`product/admin.py:315,363,666,2889`)، Category و Post در blog (`blog/admin.py:71,141`) و Page وصل است؛ ولی فقط `pages/serializers.py` و `homepage/serializers.py` فیلد `meta_tags` را سریال می‌کنند.
- **چه می‌شود:** پاسخ product/category/brand/list-page/blog کلید `meta_tags` ندارد. اپراتور می‌تواند og/twitter/custom وارد کند که storefront هیچ‌وقت نمی‌تواند نشان دهد. در هیچ‌جای دیگر هم noindex/og/twitter/hreflang وجود ندارد.
- **انتظار:** هرچه پنل پیشنهاد می‌دهد در API هم منتشر شود.
- **راستی‌آزمایی:** live (کلیدها) + code.
- **بخش‌های متأثر:** product، blog، seo.
- **اثر روی storefront:** OG tagهای اپراتور بی‌صدا نادیده گرفته می‌شوند.
- **راه‌حل در storefront:** og/twitter/noindex/hreflang را خودتان از فیلدهای موجود synthesize کنید.
- **منبع:** product §11 #3، seo §14 #3 و §0 #10.

#### M-14. جریان «خبرم کن» (notify) با موجودی هر variant جور نیست
- **محل:** `POST /api/v1/product/detail/<slug>/notify/` (سطح product، نه variant).
- **چه می‌شود:** نمونه‌کد راهنما (§17.2) فرم notify را وقتی `!variant.in_stock` نشان می‌دهد، ولی endpoint در سطح product است و هر وقت *هر* variant قابل خرید باشد پاسخ 400 `stock_notification_already_in_stock` می‌دهد (روی S25 Ultra که variant شمارهٔ 10004 ناموجود است آزمایش شد). امکان اشتراک برای یک variant مشخص وجود ندارد.
- **انتظار:** اشتراک برای variant ناموجود ممکن باشد، یا راهنما اصلاح شود.
- **راستی‌آزمایی:** live.
- **اثر روی storefront:** مشتری روی variant ناموجود نمی‌تواند برای بازگشت موجودی اشتراک بگیرد.
- **راه‌حل در storefront:** در digest نیامده. (استنباط از رفتار سرور: فرم را فقط وقتی هیچ variant قابل خریدی نیست نشان دهید.)
- **منبع:** product §11 #5.

#### M-15. slug رزروشده برای مدل‌های کاتالوگ/blog وجود ندارد (مثلاً `list` و `category`)
- **محل:** `pages/models.py:16` (`RESERVED_PAGE_SLUGS = {'list'}`)؛ `pages/tests/test_models.py` (صریحاً می‌پذیرد که Product/Category/Brand/ProductList مقدار `list` را قبول می‌کنند)؛ `seo.AbstractBaseSeoModel` (`SlugField(allow_unicode=True, unique=True)` بدون مقدار رزرو). مسیرهای `category/list/`، `brand/list/`، `list-page/list/`، `post/list/` قبل از `<slug>/` match می‌شوند.
- **چه می‌شود:**
  - API: دسته/برند/صفحهٔ لیست/دستهٔ blog/پست blog با slug برابر `list` هرگز با endpoint جزئیات قابل دریافت نیست (به‌جای آن endpoint فهرست جواب می‌دهد).
  - storefront: محصولی با slug `list` با مسیر عمومی `/product/list/` برخورد می‌کند و `get_absolute_url`/sitemap آن `/product/list/` می‌شود؛ پستی با slug `category` با `/blog/category/` برخورد می‌کند. هر دو در router Next.js که segment ثابت برنده است ناقابل‌دسترس می‌شوند.
- **انتظار:** رزرو `list` برای محصول/دسته/برند/صفحهٔ لیست و `category` برای پست‌ها، مثل رزرو `list` در صفحات.
- **راستی‌آزمایی:** code (ردیفی با این slug ساخته نشد). digest blog آن را «حالت لبه‌ای» می‌داند و می‌گوید پنل slugها را رزرو نمی‌کند، تا جایی که دیده.
- **بخش‌های متأثر:** product، blog، content، seo.
- **اثر روی storefront:** در صورت ثبت چنین slugی، آن محتوا ناقابل‌دسترس می‌شود.
- **راه‌حل در storefront:** بدون تغییر backend ممکن نیست.
- **منبع:** product §11 #4، blog §7 #14، content §14 #10، seo §14 #10.

#### M-16. تصویر منبعِ ازدست‌رفته: اولین پاسخ placeholder و پاسخ‌های بعدی URL مرده
- **محل:** `utils/images.py`؛ مثلاً `GET /api/v1/blog/category/list/`، thumbnail پست‌ها و `banner`.
- **چه می‌شود:** برای تصویری که فایل منبعش نیست، اولین پاسخ `/static/defaults/default.png` می‌دهد، اما پاسخ دوم URLهایی مثل `http://localhost:8000/media/CACHE/images/categories/.../*.jpg` می‌دهد که 404 هستند (با curl تأیید شد). `banner` (بدون thumbnail) از اول 404 است. این با وعدهٔ `utils/images.py` و راهنما («تصویر هرگز خراب نیست؛ در نبود فایل placeholder برمی‌گردد») ناسازگار است.
- **راستی‌آزمایی:** live. (در dev فایل‌های منبع media وجود ندارند، ر.ک. `F-6`؛ digest نمی‌گوید در production با فایل‌های موجود هم رخ می‌دهد.)
- **اثر روی storefront:** تصویر خراب برای دسته‌ها/پست‌ها.
- **راه‌حل در storefront:** fallback با `onError` برای همهٔ تصاویر.
- **منبع:** blog §7 #4. مرتبط: `J-23`.

#### M-17. sitemap برای slugهای فارسی percent-encode نمی‌شود
- **محل:** `GET /sitemap.xml` (`utils/sitemaps.py`).
- **چه می‌شود:** slug فارسی مثل «کفش-زمستانی» به `<loc>http://localhost:3000/product/کفش-زمستانی/</loc>` تبدیل می‌شود، در حالی که sitemaps.org URL با escape طبق RFC 3986 را لازم دارد. با داده‌های نمونهٔ ASCII دیده نمی‌شود.
- **انتظار:** `<loc>` درصدی‌کدگذاری‌شده.
- **راستی‌آزمایی:** با یک `ProductSitemap` در حافظه تأیید شد (نه روی داده/endpoint زنده؛ code).
- **اثر روی storefront:** sitemap در مصرف‌کننده‌های سخت‌گیر ممکن است نامعتبر باشد (slugها اجازهٔ Unicode دارند).
- **راه‌حل در storefront:** در digest نیامده.
- **منبع:** seo §14 #9.

#### M-18. HTML پاسخ FAQ (`answer`) نه absolute می‌شود و نه sanitize
- **محل:** `GET /api/v1/faq/category/list/`.
- **چه می‌شود:** برخلاف rich text در blog و product، URLهای نسبی داخل `answer` به absolute تبدیل نمی‌شوند و HTML پاک‌سازی (sanitize) هم نمی‌شود. این مورد مستند است ولی ناهمگونی‌ای است که هر کلاینت باید دور بزند.
- **راستی‌آزمایی:** doc + مشاهدهٔ digest blog.
- **اثر روی storefront:** رندر مستقیم، لینک/تصویر نسبی را خراب می‌کند و HTML پاک‌نشده را مستقیم وارد صفحه می‌کند. (digest auth-settings همین الگو را برای چند فیلد HTML در `/global/*` مثل `footer` و `announcement` هم ذکر می‌کند.)
- **راه‌حل در storefront:** URLهای نسبی را با origin API absolute کنید و HTML را قبل از رندر sanitize کنید.
- **منبع:** blog §7 #13.

---

## جزئی

### OpenAPI و قرارداد داده

#### J-1. قیدهای OpenAPI با اعتبارسنجی واقعی سرور نمی‌خوانند
- **محل:** `schema.yaml`: `otp_code` و `totp_code`، `CartReorderRequest.order_code`، `AddressWriteRequest.postal_code`، `OrderReceiverRequest.postal_code`، `q` در `search/` و `search/suggest/`، توضیح `limit` در فهرست‌های `transportation`.
- **چه می‌شود در برابر انتظار:**
  - `otp_code`/`totp_code`: schema `pattern: [0-9]{6}` و `maxLength: 6` دارد، ولی سرور رقم فارسی/عربی را می‌پذیرد و فاصله‌های اطراف را حذف می‌کند (live: OTP با ارقام فارسی از اعتبارسنجی قالب گذشت و به `auth_token_invalid` رسید).
  - `CartReorderRequest.order_code`: `pattern: [0-9]{10}`، ولی `"۹۲۴۶۸۶۸۵۰۲"` پاسخ 200 گرفت (live).
  - `postal_code` در آدرس و گیرندهٔ سفارش: `maxLength: 10`، ولی سرور شکل چاپی `12345-67890` (۱۱ کاراکتر) را می‌پذیرد (201 و ذخیره به‌صورت `1234567890`؛ live). توضیح خود schema سفارش هم می‌گوید شکل خط‌دار پذیرفته است. در digest auth-settings نیز schema برای `postal_code` می‌گوید «دقیقاً ده رقم»، ولی راهنما می‌گوید اعمال نمی‌شود و باید متن آزاد فرض شود (schema + doc؛ با نوشتن آزموده نشد).
  - `search/` و `search/suggest/`: schema `minLength: 1, maxLength: 200` دارد، ولی حداقل مؤثر بعد از normalize برابر ۲ کاراکتر است (`?q=س` → 400 `min_length`) و حداکثر مؤثر ۱۰۰ (`'a'*150` → 400 `max_length` «…بیش از ۱۰۰…»؛ live).
  - توضیح `limit` در فهرست‌های transportation می‌گوید سقف ۱۰۰ است ولی سقف واقعی ۱۵۰۰ است (`page_size:1500`؛ live؛ خود راهنما هم می‌پذیرد).
- **راستی‌آزمایی:** live برای ارقام فارسی، `order_code`، `postal_code` خط‌دار، `q` و `page_size`؛ schema. مورد `postal_code` در auth: schema + doc و با نوشتن آزموده نشده است.
- **اثر روی storefront:** validatorهای تولیدشده از schema (مثلاً zod از OpenAPI) ورودی معتبر را رد می‌کنند.
- **راه‌حل در storefront:** ارقام را قبل از اعتبارسنجی به لاتین normalize کنید؛ خط‌تیره را از `postal_code` حذف کنید؛ برای `limit` به `page_size` پاسخ اعتماد کنید؛ حداقل ۲ و حداکثر ۱۰۰ را برای `q` رعایت کنید؛ به schema به‌تنهایی اعتماد نکنید.
- **منبع:** auth-settings §13 #2، cart-address §13 #4-#6، content §14 #2.

#### J-2. نوع‌ها، `required` و nullable در OpenAPI جاهایی غلط یا ناقص است
- **محل:** `schema.yaml`.
- **جزئیات:**
  - `EnabledLanguage.language_name`: schema رشتهٔ non-null؛ مدل null را می‌پذیرد (`null=True, default=''`) (schema + code).
  - `VersionCheck.changes`: schema `Record<string, string>`؛ چون `release_note` nullable است مقدارها می‌توانند null باشند (schema + code).
  - `ExtraSnippet.type`: در schema اختیاری، ولی همیشه موجود است (live).
  - `logout`، `logout-all`، `totp/enable`، `totp/disable` و `password-reset/confirm`: نوع `Record<string, any>`؛ مقدار واقعی `{}` است.
  - enumهای خطا برای هر status یک union سراسری‌اند، نه برای هر endpoint (schema).
  - `LinkerSocialLink.icon`: `string | null` ولی هیچ‌وقت null نمی‌آید (۲۶ پلتفرم همه آیکن دارند و پلتفرم ناشناخته حذف می‌شود).
  - `Address` (خواندن): `plaque`، `unit`، `postal_code` و `is_default` در `required` نیستند ولی همیشه هستند (live)؛ `latitude`/`longitude` را `readOnly` علامت زده.
  - Product: بسیاری از فیلدهای همیشه‌حاضر `required` نیستند (`is_special_product`، `is_collection`، `enable_major`، `extra_detail`، `canonical_link` روی کارت و detail؛ `sku`، `variant_name`، `order_limit_*`، `packing_factor`، ابعاد و `major_*` روی Variant؛ همهٔ فیلدهای `ProductSettings`؛ `default_sorting`؛ `show_category_filter`؛ `title`، `rating`، `is_user_admin` و `is_verified_buyer` روی ProductComment). `ProductComment.positive_points`/`negative_points` و `structured_data`/`breadcrumb_structured_data` اصلاً نوع ندارند. enum `default_sorting` مقدار `""` دارد و `ProductComment.rating` یک enum به‌شکل `[1..5, null]` است.
  - پرداخت: `failure_reason` در schema nullable است ولی همیشه `""` است؛ `icon`/لوگوها (`logo`، `logo_thumbnail`، `bank_logo_thumbnail`، `image_thumbnail`) nullable‌اند ولی همیشه URL می‌آیند (placeholder).
  - `GET /cart/` و فهرست گزینه‌ها پاسخ‌های 400/404 را اعلام می‌کنند که هیچ‌وقت برنمی‌گردند (حتی با token نادرست 200 می‌آید).
- **راستی‌آزمایی:** هرکدام به‌شکلی که در پرانتز آمده (schema، code یا live)؛ بقیه live.
- **اثر روی storefront:** typeهای تولیدشده (codegen) نادرست یا optional‌تر از واقعیت می‌شوند؛ بخش «پاسخ‌های اعلام‌شده ولی ناموجود» فقط نویز است.
- **راه‌حل در storefront:** typeها را دستی بنویسید (interfaceهای digestها) یا typeهای تولیدشده را override کنید.
- **منبع:** auth-settings §13 #2، cart-address §13 #7 و #9، content §14 #1، product §11 #6، order-payment §11 #12-#13.

#### J-3. `DELETE /api/v1/devices/unregister/` در OpenAPI `requestBody` ندارد
- **محل:** `schema.yaml` (`requestBody: null`، کامپوننت `PushDeviceUnregisterRequest` وجود ندارد).
- **چه می‌شود:** endpoint یک body به شکل `{registration_id}` را الزامی می‌داند، ولی schema هیچ body‌ای اعلام نمی‌کند.
- **راستی‌آزمایی:** schema + نیاز endpoint (blog §7 #5).
- **اثر روی storefront:** کلاینت تولیدشده body را نمی‌فرستد.
- **راه‌حل در storefront:** این یک فراخوانی را دستی بنویسید.
- **منبع:** blog §7 #5.

#### J-4. URLهای نسبی و absolute در پاسخ‌ها یکدست نیستند
- **محل:** `GET /api/v1/global/languages/` (`language.icon.url`، مثل `/media/languages/fa.png`)؛ فیلدهای payment method `icon`، gateway `logo`/`logo_thumbnail`، card `bank_logo_thumbnail`، receipt `image_thumbnail`.
- **چه می‌شود:** هر فیلد فایل دیگرِ `/global/*` absolute است اما `languages[].icon` نسبی است (schema آن را «Flag image URL» می‌نامد؛ در dev آیکن‌ها null‌اند پس مشاهده نشد؛ code + doc). در پرداخت: تصویر خط‌های سفارش/preview/awaiting-product absolute است، ولی `icon` روش پرداخت، لوگوهای gateway، `bank_logo_thumbnail` کارت و `image_thumbnail` رسید نسبی‌اند (live). همچنین فیلدهای تصویر سبد و لینک‌های `next/previous` pagination از host درخواست ساخته می‌شوند (ر.ک. `K-6`).
- **راستی‌آزمایی:** code + doc برای `languages[].icon` (در dev آیکن‌ها null‌اند و مشاهده نشد)؛ live برای فیلدهای پرداخت.
- **اثر روی storefront:** تصویری که نسبی بیاید روی دامنهٔ storefront 404 می‌شود.
- **راه‌حل در storefront:** همهٔ URLهای تصویر را از یک تابع (`absUrl()`) عبور دهید.
- **منبع:** auth-settings §13 #3، order-payment §11 #12 و §0 #14.

### پیام‌ها و قالب خطا

#### J-5. متن‌های فارسی: غلط تایپی «توهی» و ارقام ناهمگون
- **محل:** پیام اعتبارسنجی `null` در `variant`، `quantity`، `code`، `order_code`، `postal_code` (cart) و `POST /api/v1/contact-us/message/submit/` با `"name": null`؛ پیام `throttled`؛ متن‌های رد درخواست در wallet.
- **چه می‌شود:** پیام `"این مقدار نباید توهی باشد."` غلط تایپی است («توهی» باید «تهی» باشد؛ live). فقط در خطاهای برنامه‌نویسی دیده می‌شود. جزئیات `throttled` ارقام لاتین دارد («…در 1 ثانیه در دسترس باشد.»)، در حالی که راهنمای auth می‌گوید ارقام فارسی نمایش داده می‌شوند (live). متن‌های رد درخواست پرداخت دو سبک رقم را قاطی می‌کنند: حداقل top-up به‌صورت «50000» لاتین و حداقل برداشت «۲۰۰٬۰۰۰» فارسی.
- **راستی‌آزمایی:** live.
- **اثر روی storefront:** ظاهری.
- **راه‌حل در storefront:** پیام خام `توهی` را به کاربر نشان ندهید؛ متن `throttled` را هرگز parse نکنید و از `retry_after` استفاده کنید.
- **منبع:** cart-address §13 #8، content §14 #3، auth-settings §13 #10، order-payment §11 #13.

#### J-6. قالب خطا در چند حالت از قاعدهٔ «خطای فیلد = `attr` دارد» پیروی نمی‌کند
- **محل:** `register/start` و سایر endpointهای auth؛ `POST /api/v1/contact-us/message/submit/`.
- **چه می‌شود:**
  - `auth_identifier_invalid` با `type: client_error` و `attr: null` می‌آید، در حالی که راهنما می‌گوید خطای فیلد `attr` دارد و باید زیر فیلد شناسه نشان داده شود (live).
  - نبود شناسه در `register/start` کد `invalid` می‌دهد (با `attr: "email"` و متن «وارد کردن ایمیل الزامی است.»)، نه `required` (live).
  - سه کد مخصوص فرم تماس (`contact_subject_required`، `contact_subject_unavailable`، `contact_channel_required`) با `type: "client_error"` و `attr: null` می‌آیند، در حالی که بقیهٔ 400های همان endpoint (مثل `invalid_iranian_mobile` با attr `phone`) `validation_error` با attr هستند.
- **راستی‌آزمایی:** live.
- **اثر روی storefront:** نگاشت عمومی `attr` ← فیلد این خطاها را از دست می‌دهد.
- **راه‌حل در storefront:** این خطاها را بر اساس `code` به فیلد نگاشت کنید؛ برای شناسایی نبود شناسه به `required` تکیه نکنید.
- **منبع:** auth-settings §13 #6-#7، content §14 #5.

#### J-7. یک code با چند HTTP status متفاوت
- **محل:** `auth_token_invalid` (400 در ثبت‌نام/reset/logout و 401 در refresh؛ live)، `auth_google_token_invalid` (401 یا 503؛ code).
- **چه می‌شود:** یک code بسته به endpoint با status متفاوت می‌آید؛ مستند است ولی راحت از قلم می‌افتد.
- **راستی‌آزمایی:** live برای `auth_token_invalid`؛ code برای `auth_google_token_invalid`.
- **اثر روی storefront:** مستند شده ولی راحت از قلم می‌افتد.
- **راه‌حل در storefront:** هم بر اساس HTTP status و هم بر اساس code شاخه بزنید.
- **منبع:** auth-settings §13 #9.

#### J-8. حساسیت به حروف بزرگ/کوچک یکدست نیست
- **محل:** `GET /api/v1/global/languages/?platform=` (case-insensitive) در برابر `get-translation/<code>/` (case-sensitive؛ `FA` → 404؛ live).
- **چه می‌شود:** یکی از دو endpoint به حروف بزرگ/کوچک حساس است و دیگری نه.
- **راستی‌آزمایی:** live.
- **اثر روی storefront:** `get-translation/FA/` پاسخ 404 می‌دهد.
- **راه‌حل در storefront:** (پیشنهاد، نه از digest) کد زبان را همیشه با حروف کوچک بفرستید.
- **منبع:** auth-settings §13 #8.

#### J-9. هدر `Retry-After` از طریق CORS قابل خواندن نیست
- **محل:** همهٔ پاسخ‌های 429؛ تنظیم `CORS_EXPOSE_HEADERS` (فقط `X-Cart-Token` expose می‌شود).
- **چه می‌شود:** راهنمای auth در checklist می‌گوید «`data.retry_after` **یا** هدر `Retry-After` را بخوانید»، ولی در مرورگرِ cross-origin فقط مقدار body قابل خواندن است (live).
- **بخش‌های متأثر:** auth-settings، blog، cart.
- **راستی‌آزمایی:** live.
- **اثر روی storefront:** در مرورگرِ cross-origin فقط مقدار body قابل خواندن است.
- **راه‌حل در storefront:** همیشه `data.retry_after` را بخوانید.
- **منبع:** auth-settings §13 #12، blog §7 #7، cart-address §1.3.

#### J-10. اعتبارسنجی ورودی در چند جا سهل‌گیرانه یا ناهمگون است
- **محل و رفتار:**
  - pagination: `limit=0` و `limit=-5` روی `pages/list/` پاسخ 200 با `page_size: 20` می‌دهد، در حالی که `page=0`/`abc` پاسخ 404 است (live).
  - `?max_price=-5` پذیرفته می‌شود (200 با ۰ نتیجه).
  - `?comment_type=bogus` روی *فهرست* کامنت 400 `invalid_choice` می‌دهد، ولی راهنما این را فقط برای submit مستند کرده.
  - `weight_grams: 0` برای محصول مجازی منتشر می‌شود.
  - blog: `?author=1.5` پاسخ 200 با `count: 0` می‌دهد، نه 400 (فقط ورودی غیرعددی رد می‌شود).
- **راستی‌آزمایی:** live برای `limit` و موارد product؛ مورد `author=1.5` در بخش «فقط موارد تأییدشده» digest blog آمده و برچسب روش جدا ندارد.
- **اثر روی storefront:** کم؛ کلاینت نباید به رد شدن ورودی نامعتبر تکیه کند.
- **راه‌حل در storefront:** در digest نیامده.
- **منبع:** content §14 #7، product §11 #14، blog §7 #12.

#### J-11. ثبت دیدگاه/notify خطاها را در دو مرحله گزارش می‌کند
- **محل:** `POST /api/v1/product/detail/<slug>/comment/submit/` و `POST /api/v1/product/detail/<slug>/notify/`.
- **چه می‌شود:** مهمانی که هم `name` و هم `review` را خالی بگذارد اول فقط خطای `review` را می‌بیند و خطای name در submit بعدی می‌آید. notify نیز نبود `first_name` و `last_name` را یکی‌یکی گزارش می‌کند.
- **راستی‌آزمایی:** live.
- **اثر روی storefront:** کاربر ممکن است برای رفع همهٔ خطاها چند بار submit کند.
- **راه‌حل در storefront:** (پیشنهاد، نه از digest) همهٔ فیلدهای الزامی را قبل از ارسال سمت کلاینت بررسی کنید.
- **منبع:** product §11 #11.

### کاتالوگ و فهرست‌ها

#### J-12. `CategoryCard.product_count` در endpointهای مختلف معنی متفاوت دارد
- **محل:** `homepage/` (بخش `category_grid`)، فهرست دسته‌ها، گروه‌های `search/` (فقط مستقیم) در برابر `/product/filters/` (کل زیردرخت).
- **چه می‌شود:** در dev، دسته‌های والد `digital`، `fashion`، `beauty-health` و `grocery` همه `0` دارند در حالی که زیردرختشان محصول دارد. مستند شده است.
- **راستی‌آزمایی:** live (dev) + doc.
- **اثر روی storefront:** grid صفحهٔ اصلی (بخش dev با id 10003) اگر بی‌دقت رندر شود برای همهٔ دسته‌های والد «۰ محصول» نشان می‌دهد.
- **راه‌حل در storefront:** (پیشنهاد، نه از digest) شمارندهٔ دسته‌های والد را نشان ندهید یا از منبع دیگری حساب کنید.
- **منبع:** content §14 #6.

#### J-13. فیلترهای دسته به دسته‌های والد ارث نمی‌رسند
- **محل:** `GET /api/v1/product/filters/?category=digital`.
- **چه می‌شود:** `attributes: []` برمی‌گرداند، چون فقط attributeهایی که روی همان دسته filterable علامت خورده‌اند استفاده می‌شوند؛ دسته‌های والد facet ندارند مگر اینکه ادمین تنظیم را کپی کند. راهنما به آن اشاره دارد ولی راحت از قلم می‌افتد.
- **راستی‌آزمایی:** live.
- **اثر روی storefront:** panel فیلتر در صفحهٔ دستهٔ والد خالی است.
- **راه‌حل در storefront:** در digest نیامده. (فقط اگر ادمین تنظیم را روی والد هم تکرار کند facet پیدا می‌شود.)
- **منبع:** product §11 #12.

#### J-14. قوانین تطبیق «صفحهٔ لیست» و `?attribute_values=` فرق دارند
- **محل:** `list=` (ProductList) در برابر `?attribute_values=` روی فهرست محصولات.
- **چه می‌شود:** تعریف list-page همهٔ مقدارها (بین attributeها) را با OR ترکیب می‌کند و فقط مقدارهای **variant** را می‌بیند؛ فیلتر facet مقدارها را به‌ازای هر attribute گروه می‌کند (AND بین attributeها) و مقدارهای spec-sheet را هم می‌پذیرد. محصولی که مقدار منطبقش فقط در spec-sheet است در `?attribute_values=` ظاهر می‌شود ولی در `?list=` نه.
- **راستی‌آزمایی:** code.
- **اثر روی storefront:** نتیجهٔ `?list=` و `?attribute_values=` برای یک محصول ممکن است یکسان نباشد.
- **راه‌حل در storefront:** در digest نیامده.
- **منبع:** product §11 #13.

#### J-15. fallback مقدار `consider_before_buying` غیرقطعی است
- **محل:** سریالایزر محصول (`consider_before_buying`).
- **چه می‌شود:** «اولین» دستهٔ محصول را از یک prefetch بدون ترتیب M2M می‌گیرد؛ وضعیت انتشار آن دسته و پرچم «نمایش در صفحهٔ دسته» را نادیده می‌گیرد. اگر محصول چند دسته با کارت داشته باشد نتیجه غیرقطعی است.
- **راستی‌آزمایی:** code.
- **اثر روی storefront:** محتوای وابسته به این fallback برای محصول چنددسته غیرقطعی است.
- **راه‌حل در storefront:** در digest نیامده.
- **منبع:** product §11 #15.

#### J-16. جزئیات صفحهٔ لیست (list-page) کم‌لینک‌تر از همتاهایش است
- **محل:** `GET /api/v1/product/list-page/<slug>/`.
- **چه می‌شود:** `product_category` فیلد `path` ندارد و آرایهٔ `breadcrumb` هم نیست (برخلاف detail دسته و محصول). برای لینک دادن به دسته باید درخت دسته‌ها را داشته باشید یا URLهای `breadcrumb_structured_data` (که روی `SITE_DOMAIN` هستند) را parse کنید.
- **راستی‌آزمایی:** live.
- **اثر روی storefront:** ساخت لینک به دستهٔ صفحهٔ لیست دشوارتر از detail محصول/دسته است.
- **راه‌حل در storefront:** درخت دسته‌ها یا parse کردن URLهای `breadcrumb_structured_data`.
- **منبع:** product §11 #7.

#### J-17. JSON-LD محصول: breadcrumb ناهمگون و `Review` بدون `reviewRating`
- **محل:** `breadcrumb_structured_data`، `structured_data`.
- **چه می‌شود:** breadcrumb محصول به عمیق‌ترین دسته ختم می‌شود و خود محصول را ندارد، در حالی که breadcrumb دسته/برند/صفحهٔ لیست با خود صفحه تمام می‌شود. ورودی‌های JSON-LD از نوع `Review` فیلد `reviewRating` ندارند؛ `aggregateRating` عمداً وجود ندارد (طبق راهنما) ولی باید منتظر هشدار Search Console بود.
- **راستی‌آزمایی:** live.
- **اثر روی storefront:** احتمال هشدار Search Console.
- **راه‌حل در storefront:** در digest نیامده.
- **منبع:** product §11 #8.

#### J-18. مرتب‌سازی برندها «بر اساس نام» با ترتیب code-point است، نه الفبای فارسی
- **محل:** فهرست برندها و برندهای فیلتر.
- **چه می‌شود:** حروف «پ»، «چ»، «ژ» و «گ» آخر فهرست می‌آیند.
- **راستی‌آزمایی:** live.
- **اثر روی storefront:** ترتیب برندها برای کاربر فارسی‌زبان الفبایی نیست.
- **راه‌حل در storefront:** در digest نیامده.
- **منبع:** product §11 #9.

#### J-19. محدودیت مشخصات تصویر UI را محدود می‌کند
- **محل:** پردازش تصویر (imagekit) در دسته/برند/محصول.
- **چه می‌شود:** `icon` دسته اجباراً JPEG می‌شود (PNG شفاف و SVG پس‌زمینهٔ یکدست می‌گیرند)؛ لوگوی برند برش 70×70 JPEG است (برای hero برند کوچک)؛ تصویر محصول و گالری برش 500×500 است و تصویر اصلی در دسترس نیست (zoom یا retina ممکن نیست).
- **راستی‌آزمایی:** code.
- **اثر روی storefront:** UI محدود می‌شود: آیکن دسته پس‌زمینهٔ یکدست می‌گیرد، لوگوی برند کوچک است و zoom/retina ممکن نیست.
- **راه‌حل در storefront:** در digest نیامده.
- **منبع:** product §11 #10.

### Blog، FAQ و JSON-LD

#### J-20. JSON-LD پست blog: `datePublished`، `articleBody` و `commentCount`
- **محل:** `blog/services/structured_data.py`؛ `GET /api/v1/blog/post/<slug>/`.
- **چه می‌شود:**
  - `datePublished` از `created` (شروع پیش‌نویس) می‌آید، نه `published_at`؛ در `upcoming-campaign-preview` مقدار `published_at` برابر 2026-09-19 است ولی `datePublished` برابر "2026-09-13". `lastmod` در sitemap همان پست (2026-09-13) هم زودتر از انتشار است. این با رفع API-21 که `published_at` را آورد ناسازگار است (راهنما این را مستند کرده).
  - `articleBody` خود HTML پست است (با تگ‌ها و URL نسبی media که absolute نمی‌شوند)، در حالی که schema.org متن ساده می‌خواهد.
  - `commentCount` فقط کامنت‌های سطح اول را می‌شمارد ولی آرایهٔ `comment[]` پاسخ‌ها و پرسش‌ها را هم دارد (live: `commentCount` برابر 2 با 3 ورودی).
- **اثر روی storefront:** validatorهای structured-data ممکن است هشدار بدهند.
- **راستی‌آزمایی:** live + code؛ بخشی مستند شده.
- **راه‌حل در storefront:** در digest نیامده. (digest فقط پیشنهاد می‌کند URLها/host در JSON-LD بازنویسی شوند، ر.ک. `M-12`.)
- **منبع:** blog §7 #2-#3.

#### J-21. دو ناسازگاری فقط برای ردیف‌های قدیمیِ «publish + زمان‌بندی آینده»
- **محل:** `CategoryListView` (شمارندهٔ `post_count`) و `PostDetailView.retrieve`.
- **چه می‌شود:** `post_count` دستهٔ blog شرط `schedule <= now` را اعمال نمی‌کند (برخلاف `Post.objects.published()` در API-21)، پس ردیف قدیمی «publish + schedule آینده» قبل از انتشار شمرده می‌شود. شمارندهٔ بازدید برای پیش‌نمایش staff از چنین پستی هم افزایش می‌یابد، در حالی که راهنما می‌گوید پیش‌نمایش هرگز نمی‌شمارد.
- **راستی‌آزمایی:** code؛ در fixtureها چنین ردیفی نیست، پس اثرش کم است.
- **نکتهٔ مرتبط (digest seo، بخش TL;DR):** هر `GET /api/v1/blog/post/<slug>/` (از جمله HEAD، revalidation ISR و fetch تکراری `generateMetadata`) `view_count` را زیاد می‌کند.
- **اثر روی storefront:** کم؛ فقط برای ردیف‌های قدیمی.
- **راه‌حل در storefront:** در digest نیامده.
- **منبع:** blog §7 #8-#9، seo §0 #9.

#### J-22. شمارهٔ فهرست مطالب (TOC) سوراخ دارد و `id` خالی تولید می‌شود
- **محل:** `blog/services/content.py`.
- **چه می‌شود:** شمارنده‌ها قبل از بررسی «متن خالی ⇒ رد کن» زیاد می‌شوند؛ پس یک `<hN>` خالی (مثلاً فقط حاوی تصویر) شمارش را می‌پرد. عنوانی که فقط علامت نگارشی دارد `id=""` می‌گیرد. عنوان‌های تکراری `id` تکراری می‌دهند (این یکی مستند است).
- **راستی‌آزمایی:** code.
- **اثر روی storefront:** در TOC پست‌هایی که heading خالی یا فقط‌علامت دارند شماره‌گذاری می‌پرد یا `id` خالی می‌ماند.
- **راه‌حل در storefront:** در digest نیامده.
- **منبع:** blog §7 #10.

#### J-23. thumbnail تنبل (lazy) گاهی placeholder برمی‌گرداند و ممکن است cache شود
- **محل:** `utils/images.py::thumbnail_url`؛ `GET /api/v1/search/suggest/`.
- **چه می‌شود:** یک تصویر محصول در یک فراخوانی `http://localhost:8000/static/defaults/default.png` و در فراخوانی بعدی `/media/CACHE/images/products/.../<hash>.jpg` بود (`samsung-galaxy-tab-a9` با `q=ab` و یک شارژر با `q=شارژر`؛ اندازهٔ پاسخ 565 در برابر 634 بایت). `thumbnail_url` استثناهای `FileNotFoundError/OSError` هنگام تولید on-first-access در imagekit را قورت می‌دهد و placeholder برمی‌گرداند. با cache سمت storefront (homepage 60 ثانیه، suggest 60 ثانیه) ممکن است placeholder cache شود. digest آن را «احتمالاً race در تولید تنبل» می‌داند (مشاهده در dev تحت بار هم‌زمان).
- **راستی‌آزمایی:** live (مشاهده) + code (علت احتمالی، نه قطعی).
- **اثر روی storefront:** ممکن است placeholder در cache سمت storefront بماند.
- **راه‌حل:** در production thumbnailها از پیش ساخته شوند یا پاسخ‌های حاوی placeholder cache نشوند. مرتبط: `M-16`.
- **منبع:** content §14 #4.

#### J-24. چند ادعای اشتباه در راهنمای blog و dashboard
- **محل:** راهنمای blog و dashboard (code-verified).
- **جزئیات:**
  - راهنمای blog یک‌جا درخت کامنت را «دو سطحی» و جای دیگر «عمق نامحدود» می‌گوید. کد (MPTT، هر parent قابل‌مشاهده) عمق نامحدود را اجازه می‌دهد.
  - راهنما می‌گوید throttle ثبت کامنت با «فرم کامنت محصول» مشترک است؛ ولی `CommentCreateViewMixin.throttle_scope='comment_submit'` برای کامنت **صفحه** (page) هم استفاده می‌شود، پس سهم بین سه فرم مشترک است.
  - راهنما می‌گوید `Author.full_name` می‌تواند رشتهٔ فقط‌فاصله باشد و نام کامنت‌دهندهٔ واردشده به username برمی‌گردد. کد (`User.get_display_name`) نام کامل یا «کاربر» را می‌دهد، هرگز فقط‌فاصله و هرگز username.
  - ردیف ۵ راهنمای dashboard می‌گوید «زیر `/api/v1/account/address/`»؛ مسیرهای واقعی `list/`، `create/`، `{id}/`، `{id}/update/`، `{id}/delete/` و `{id}/set-default/` هستند.
- **راستی‌آزمایی:** code.
- **اثر روی storefront:** پیاده‌سازی بر اساس راهنما ممکن است با رفتار واقعی نخواند.
- **راه‌حل در storefront:** (پیشنهاد، نه از digest) از رفتار کد (موارد بالا) پیروی کنید، نه متن راهنما.
- **منبع:** blog §7 #11.

#### J-25. FAQ structured data وجود دارد ولی از هیچ endpoint‌ی در دسترس نیست
- **محل:** `faqs/models.py:93` (`structured_data()`).
- **چه می‌شود:** JSON مربوط به FAQPage را (به‌صورت رشته) برمی‌گرداند، ولی هیچ serializer یا endpoint آن را منتشر نمی‌کند.
- **راستی‌آزمایی:** code.
- **اثر روی storefront:** داده‌ای که پنل/مدل برای FAQPage دارد در دسترس نیست.
- **راه‌حل در storefront:** در digest نیامده.
- **منبع:** seo §14 #11.

### پرداخت و ارسال (ناسازگاری با مستندات و UX)

#### J-26. چند رفتار پرداخت با مستندات فرق دارد
- **محل:** `POST /api/v1/payment/order/<order_uuid>/intent/`، `POST /api/v1/payment/<payment_uuid>/card-transfer/receipt/`، `gateways/services/checkout.py:107-110`.
- **جزئیات:**
  - **Idempotency:** replay یک کلید بعد از اینکه attemptش سفارش را settle کرده، 409 `order_already_settled` می‌دهد (چون بررسی payability قبل از جستجوی replay اجرا می‌شود)، نه `payment_idempotency_conflict` مستند (live: کلید wallet به نام `pay-w-1` برای shirin). هر دو را مدیریت کنید.
  - **رسید غیرتصویر:** بایت‌های غیرتصویری 400 `validation_error` با کد `invalid_image` (attr `image`، کد DRF) می‌دهد، نه `payment_receipt_image_invalid` مستند؛ آن کد فقط برای تصویر decodable ولی غیر JPEG/PNG/WEBP (مثل GIF) است (live).
  - **ترتیب بررسی result-URL:** مستندات می‌گویند `gateway_result_url_invalid` «قبل از هر چیز» رد می‌شود؛ کد ابتدا resolve شدن gateway و بازهٔ مبلغ را بررسی می‌کند (`gateways/services/checkout.py:107-110`)، پس در مغازهٔ بد-پیکربندی‌شده ممکن است `gateway_unknown`/`gateway_amount_not_supported` زودتر ظاهر شود (code؛ ظاهری).
- **راستی‌آزمایی:** live برای دو مورد اول؛ code برای مورد سوم.
- **اثر روی storefront:** کد/متن خطای مورد انتظار با واقعیت نمی‌خواند.
- **راه‌حل در storefront:** برای idempotency هر دو کد (`order_already_settled` و `payment_idempotency_conflict`) را مدیریت کنید؛ (پیشنهاد، نه از digest) برای رسید نامعتبر به هر دو کد `invalid_image` و `payment_receipt_image_invalid` واکنش نشان دهید؛ مورد سوم ظاهری است.
- **منبع:** order-payment §11 #8، #9، #14.

#### J-27. جزئیات متفرقهٔ API پرداخت
- **محل:** پاسخ‌های صفحه‌بندی‌شدهٔ API پرداخت (`next`, `previous`) و فیلدهای timestamp.
- **جزئیات:** timestampها گاهی microsecond دارند؛ لینک‌های `next/previous` در pagination URL absolute backend هستند.
- **راستی‌آزمایی:** live.
- **اثر روی storefront:** ظاهری؛ لینک‌های `next/previous` به backend اشاره می‌کنند.
- **راه‌حل در storefront:** در digest نیامده.
- **منبع:** order-payment §11 #13.

#### J-28. سقف COD در فهرست گزینه‌های ارسال اعمال نمی‌شود (شکاف UX، به‌قول digest «لزوماً باگ نیست»)
- **محل:** `GET /api/v1/cart/shipping/option/list/` (گزینه‌هایی مثل `peyk-tehran`) و `POST shipping/select/`.
- **چه می‌شود:** `peyk-tehran` حتی وقتی مبلغ درب منزل این سبد آشکارا از سقف بیشتر است، با `supports_cash_on_delivery:true` و `cod_max_amount:20000000` تبلیغ می‌شود و فقط select آن را رد می‌کند (با آیفون ۱۱۸ میلیونی تأیید شد). راهنما نمی‌گوید فهرست از قبل فیلتر می‌شود.
- **راستی‌آزمایی:** live.
- **اثر روی storefront:** گزینه‌ای تبلیغ می‌شود که select آن را رد می‌کند.
- **راه‌حل در storefront:** رد شدن select را در UI مدیریت کنید. مرتبط: `M-8`.
- **منبع:** cart-address §13 #10.

### استقرار، مستندات و پنل

#### J-29. «مشاهده در سایت» (View on site) پنل ادمین به host API می‌رود
- **محل:** `view_on_site=True` (پیش‌فرض) بدون `django.contrib.sites`؛ `contenttypes.views.shortcut`.
- **چه می‌شود:** `302 http://localhost:8000/product/samsung-galaxy-s25-ultra/` به‌جای `STOREFRONT_URL` (live، از طریق `shortcut()`). برای استقرار با دامنهٔ جدا 404 می‌شود.
- **راستی‌آزمایی:** live.
- **اثر روی storefront:** ندارد؛ فقط برای ادمین پنل در استقرار با دامنهٔ جدا.
- **راه‌حل در storefront:** در digest نیامده.
- **منبع:** seo §14 #4.

#### J-30. توضیحات/مستندات قدیمی یا متناقض دربارهٔ `STOREFRONT_URL`، cache و مسیر فهرست
- **محل:** `firefly_core/settings.py:93-99`، `.env.example:45-47`، راهنمای settings-api (§1 خط 244)، راهنمای storefront-seo.
- **جزئیات:**
  - کامنت `firefly_core/settings.py:93-99` («API دقیقاً یک URL بیرونی می‌سازد: صفحهٔ پرداخت با لینک») و `.env.example:45-47` («فقط URL پرداخت با لینک») غلط‌اند؛ `STOREFRONT_URL` sitemap، callback بانک، robots، short link و linker را هم می‌سازد (راهنمای استقرار فقط `.env.example` را علامت زده).
  - راهنمای settings-api (§1 خط 244) می‌گوید پاسخ‌های global سمت سرور cache نمی‌شوند و هر درخواست DB می‌خواند؛ ولی `site_cache` از `/global/settings/` (و ۱۱ مورد دیگر) تا ۳۰ دقیقه cache می‌کند (با نوشتن باطل می‌شود، پس تازگی قابل مشاهده یکسان است).
  - storefront-seo مسیر `/products/?has_discount=true` را هدف redirect مثال می‌زند ولی fixtureهای homepage/menu `/product/list/?has_discount=true` را دارند؛ هیچ‌کدام را کد تولید نمی‌کند ولی storefront باید یکی (یا هر دو) را پشتیبانی کند.
- **راستی‌آزمایی:** code + doc.
- **اثر روی storefront:** گمراه‌کنندگی برای تیم و ops؛ مسیر redirect هدف را باید خود storefront انتخاب کند.
- **راه‌حل در storefront:** یکی از `/products/` یا `/product/list/` را انتخاب کنید (یا هر دو را پشتیبانی کنید).
- **منبع:** product §11 #2 (بند آخر)، seo §14 #5، #14، #15، order-payment §11 #13.

#### J-31. قرارداد «همهٔ URLهای storefront با `/` تمام می‌شوند» برای دو URL نقض شده
- **محل:** `order/services/payment_link.py:127` (`payment_link_url` → `/order/pay/<token>`) و `short_url` → `/s/<code>`.
- **چه می‌شود:** راهنمای storefront-seo می‌گوید هر URL که backend می‌سازد با `/` تمام می‌شود، ولی این دو نمی‌شوند؛ با `trailingSlash: true` یک hop اضافهٔ 308 برای هر کلیک SMS ایجاد می‌شود (راهنما فقط مورد short-link را ذکر کرده).
- **راستی‌آزمایی:** code.
- **اثر روی storefront:** یک redirect 308 اضافه برای هر کلیک SMS.
- **راه‌حل در storefront:** هزینه‌اش یک redirect اضافه است؛ هر دو مسیر باید در storefront وجود داشته باشند.
- **منبع:** seo §14 #6، order-payment §0 #3.

#### J-32. قالب ایمیل `password_reset_link` مرده است
- **محل:** `email_center/models.py`.
- **چه می‌شود:** با متغیرهای `email` و `link` اعلام و در تولیدکنندهٔ راهنمای پنل مستند شده، ولی هیچ کدی آن را نمی‌فرستد (reset فقط با OTP است).
- **راستی‌آزمایی:** code.
- **اثر روی storefront:** ندارد (قالبی که هیچ کدی نمی‌فرستد).
- **راه‌حل در storefront:** لازم نیست.
- **منبع:** seo §14 #13.

---

## پیکربندی لازم برای استقرار

این بخش باگ نیست؛ تنظیماتی است که باید پیش از راه‌اندازی production (یا برای تست محلی) درست شود. هرجا همین موضوع در بخش باگ‌ها هم هست، به شناسهٔ آن ارجاع داده شده است.

#### K-1. `TRUSTED_PROXY_IPS` / `TRUSTED_PROXY_HOPS` و اندازهٔ throttleها (`THROTTLE_*`)
- **مسئله:** همهٔ ترافیک SSR/BFF (سرور Next.js) از یک IP می‌آید، پس سهمیه‌های مهمان برای کل فروشگاه مشترک می‌شوند: `anon` 2000/ساعت، `user` 5000/ساعت، `search_suggest` 1800/ساعت، `payment_status` 240/ساعت (payment/method/list، payment/gateway/list، وضعیت پرداخت، دستور کارت‌به‌کارت)، `comment_submit` 10/ساعت (مشترک بین کامنت blog، محصول و صفحه)، `contact_message_submit` 10/ساعت، `payment_attempt` 30/ساعت، `auth_attempt` 20/دقیقه، `auth_otp_request` 10/دقیقه، اعمال کوپن 20/دقیقه، `order_tracking` 20/دقیقه، `order_payment_link` 30/دقیقه، و reorder 10/دقیقه برای هر حساب.
- **مکانیزم backend** (code `utils/user_agent.py`): `X-Forwarded-For` فقط وقتی معتبر است که `REMOTE_ADDR` عضو `TRUSTED_PROXY_IPS` باشد (تطابق دقیق رشته، **بدون CIDR**). کلاینت برابر ورودی شمارهٔ `TRUSTED_PROXY_HOPS` (پیش‌فرض 1) از راست است. ورودی غیر-IP یعنی کلاینت ناشناخته.
- **کاری که باید شود:**
  - لبهٔ storefront `X-Real-IP` را بنویسد (overwrite؛ هرگز مقدار ارسالی مرورگر نباشد) و کد سرور فقط روی فراخوانی‌های `no-store` مقدار `X-Forwarded-For` را از آن بگذارد.
  - اگر سرور Next مستقیم به Django وصل است: IP سرور Next در `TRUSTED_PROXY_IPS` (با HOPS=1). IP کانتینر را ثابت (pin) کنید؛ تغییر IP اعتماد را بی‌صدا از بین می‌برد (`firefly.W003` فقط وقتی لیست خالی است هشدار می‌دهد).
  - اگر از پشت reverse proxy خود API می‌رود (حالت معمول): آن proxy باید `X-Forwarded-For` از host storefront را بپذیرد (nginx: `set_real_ip_from <storefront-ip>; real_ip_header X-Forwarded-For;`، Traefik: `forwardedHeaders.trustedIPs`) و Django به آن proxy اعتماد کند. اضافه کردن IP storefront به `TRUSTED_PROXY_IPS` به‌تنهایی پشت proxyِ appending کافی نیست.
  - در غیر این صورت از backend بخواهید `THROTTLE_ANON` (و `THROTTLE_SEARCH_SUGGEST`، `THROTTLE_PAYMENT_STATUS`) را به اندازهٔ کل فروشگاه بالا ببرد، پیش از راه‌اندازی و پیش از کمپین‌های SMS بزرگ (هر کلیک short link = یک فراخوانی API).
  - جایگزین: endpointهای auth/cart/comment از مرورگر صدا زده شوند (نیازمند `K-4`) یا با JWT مشتری (سهمیه به‌ازای هر کاربر).
- **نشانهٔ live در dev:** `auth_attempt` روی 127.0.0.1 مشترک است و یک بار 429 `throttled` (`retry_after: 1`) دیده شد.
- **راستی‌آزمایی:** code + doc.
- **منبع:** seo §0 #7 و §11، auth-settings §0 #11، blog §0.7، cart-address §1.4، content §0 #10، order-payment §0 #15، product §0 #20.

#### K-2. `GATEWAY_RESULT_URL_ALLOWED_HOSTS` و `GatewaySetting.result_url` (و credentials درگاه در dev)
- **مسئله:** آدرس صفحهٔ نتیجه از تنظیم ادمین `GatewaySetting.result_url` (پنل «تنظیمات درگاه پرداخت» ← «آدرس نتیجهٔ پرداخت») می‌آید و در لحظهٔ intent روی هر transaction ثبت می‌شود. host آن باید در `GATEWAY_RESULT_URL_ALLOWED_HOSTS` باشد (پیش‌فرض `[SITE_DOMAIN, host(STOREFRONT_URL)]`)، وگرنه **هر** intent پرداخت با 503 `gateway_result_url_invalid` شکست می‌خورد.
- **وضع dev (live):** مقدار fixture برابر `https://firefly-core.ir/payment/callback/` است (`fixtures/11_payment_config.json`) ولی `GATEWAY_RESULT_URL_ALLOWED_HOSTS = ['localhost']`، پس `result_url_is_allowed(...) == False` و callback به دامنهٔ production redirect می‌شود. علاوه بر آن credentialهای درگاه در dev رمزگشایی نمی‌شوند و هر intent بانکی `gateway_not_configured`/`gateway_unknown` می‌دهد؛ بعد از رفع credentials با `gateway_result_url_invalid` (code) شکست می‌خورد. برای E2E محلی: `result_url` را در ادمین روی `http://localhost:3000/payment/callback/` بگذارید و credentials را اصلاح کنید.
- **production:** `result_url` را روی `${STOREFRONT_URL}/payment/callback/` بگذارید و مطمئن شوید host مجاز است. storefront باید `/payment/callback/` را پیاده کند: query شامل `result=success|failed|pending`، `payment=<uuid>` و `code=<error code>`؛ هرگز از پارامترها نتیجه نگیرید و `GET /api/v1/payment/<uuid>/status/` را poll کنید.
- **پرسش باز:** مسیر نهایی production کدام است؟ `/payment/callback/` (seed) یا `/pay/result` (تست‌ها)؟ (Q-7)
- **راستی‌آزمایی:** live (dev) + code.
- **منبع:** order-payment §11 #11 و §0 #2 و §4، seo §14 #7 و §0 #4 و §8.

#### K-3. `SITE_DOMAIN` در برابر `STOREFRONT_URL`
- **مسئله:** `SITE_DOMAIN` (پیش‌فرض بی‌صدا `firefly-core.ir`) این‌ها را تعیین می‌کند: ALLOWED_HOSTS، origin‌های CORS و CSRF (http و https)، پیش‌فرض `STOREFRONT_URL`، پیش‌فرض allowlist مربوط به result-URL، URL صفحه و تصویر در JSON-LD، لینک SMS «بازگشت موجودی» و URL تصویر FCM. `STOREFRONT_URL` (بدون `/` انتهایی؛ پیش‌فرض `https://SITE_DOMAIN`) این‌ها را تعیین می‌کند: لینک پرداخت، `<loc>` در sitemap، URL callback بانک، خط `Sitemap:` در robots، پایهٔ short link و targetهای absolute در linker/shortener. `SHORT_LINK_BASE_URL` پیش‌فرض `STOREFRONT_URL/s/` است.
- **توصیه:** `SITE_DOMAIN` = دامنهٔ عمومی storefront؛ `STOREFRONT_URL` = `https://SITE_DOMAIN` (یا خالی)؛ و `/media/` و `/static/` روی `SITE_DOMAIN` در دسترس باشد (برای تصاویر JSON-LD). `SITE_DOMAIN` را روی host API نگذارید (آن‌وقت URL صفحه در JSON-LD و SMS به host API می‌رود و باید در storefront بازنویسی شود). در توپولوژی جداگانه: `EXTRA_ALLOWED_HOSTS=api.firefly-core.ir`.
- **بعد از تغییر:** `clear_site_cache` اجرا شود؛ تغییر env در fingerprint cache نیست و JSON-LD در پاسخ‌های cache‌شدهٔ محصول `SITE_DOMAIN` را embed دارد.
- **dev:** `SITE_DOMAIN=localhost` و `STOREFRONT_URL=http://localhost:3000`.
- **مرتبط:** باگ `M-12`.
- **راستی‌آزمایی:** code + live.
- **منبع:** seo §12.1، §12.3، §9، product §0 و §2، auth-settings §11.

#### K-4. فهرست origin‌های مجاز CORS/CSRF
- **مسئله:** `CORS_ALLOWED_ORIGINS` فقط `http://localhost:3000`، `http://127.0.0.1:3000`، `localhost:8000`، `127.0.0.1:8000` و `http(s)://{SITE_DOMAIN}` را دارد (`settings.py:170-195`). `STOREFRONT_URL` اضافه نمی‌شود، نسخهٔ `www.` ندارد و **هیچ متغیر env‌ای برای گسترش آن وجود ندارد.** preflight از `https://shop.example.com` هدر `Access-Control-Allow-Origin` نمی‌گیرد (live). هدرهای مجاز شامل `X-API-Key`، `X-Cart-Token`، `Idempotency-Key` و credentials است؛ فقط `X-Cart-Token` expose می‌شود.
- **اثر:** هر فراخوانی مستقیم مرورگر ← API (dashboard، reading list، notification، ثبت کامنت، cart) وقتی origin برنامه با `SITE_DOMAIN` فرق دارد خطا می‌دهد. اگر همهٔ فراخوانی‌ها سمت سرور باشند (توصیهٔ digest) بی‌اثر است.
- **راه‌حل:** storefront را روی `SITE_DOMAIN` مستقر کنید، یا `/api` را زیر origin خود proxy کنید، یا از backend بخواهید origin اضافه کند (امروز بدون تغییر کد ممکن نیست).
- **راستی‌آزمایی:** live (preflight) + code.
- **منبع:** blog §0.8 و §7 #7، seo §14 #12 و §12.1، cart-address §1.3، auth-settings §1.

#### K-5. reverse proxy برای callback بانک و مسیرهای لازم روی دامنهٔ storefront
- **مسئله:** URL بازگشت از بانک برابر `STOREFRONT_URL + /api/v1/payment/gateway/callback/<GATEWAY_CODE>/<callback_token>/` است (`payment/services/intent.py:332-338`).
- **الزامات:**
  - این مسیر دقیق باید با **GET و POST** (مثلاً ملت و BMI فقط POST با `application/x-www-form-urlencoded` می‌زنند)، بدنهٔ دست‌نخورده و **`/` انتهایی حفظ‌شده** به Django proxy شود (nginx یا rewrite از نوع `beforeFiles` در Next؛ middleware نباید بدنه را بخورد یا redirect بدهد).
  - بدون `/` انتهایی: روی GET پاسخ 301 و روی POST پاسخ **500** (live، در DEBUG)؛ در production `APPEND_SLASH` POST را به GET تبدیل می‌کند و فیلدهای فرم بانک از بین می‌رود (از سند order). هر proxyای که `/` را حذف کند POST بانک را می‌شکند.
  - بدون proxy، مشتری به 404 می‌رسد و پرداخت ثبت نمی‌شود (ر.ک. `B-1`).
  - صفحه‌های لازم در storefront: `/payment/callback/`، `/order/pay/<token>` (بدون `/` انتهایی در SMS)، `/s/<code>`، و `/sitemap.xml` (+ `?p=`) باید از API proxy شود (robots API خط `Sitemap: {STOREFRONT_URL}/sitemap.xml` را تبلیغ می‌کند). هفت الگوی sitemap همه با `/` انتهایی: `/product/<slug>/`، `/product-category/<path...>/`، `/product/list/<slug>/`، `/brand/<slug>/`، `/blog/<slug>/`، `/blog/category/<path...>/`، `/page/<slug>/`؛ و `trailingSlash: true` در next.config.
- **راستی‌آزمایی:** code + live + doc.
- **منبع:** order-payment §0 #1 و §4.1، seo §0 #1-#3 و §8، auth-settings §0 #12 و §9.

#### K-6. SSR باید origin عمومی API را صدا بزند (Host، `EXTRA_ALLOWED_HOSTS`، `USE_HTTPS`)
- **مسئله:** URLهای تصویر و pagination از `Host` درخواست ساخته می‌شوند (`request.build_absolute_uri`). `fetch` در Node هدر `Host` سفارشی را بی‌صدا نادیده می‌گیرد (روی Node 22 تأیید شد). اگر SSR از نام داخلی (مثل `http://web:8000`) صدا بزند: (الف) بدون ورود در `EXTRA_ALLOWED_HOSTS` پاسخ 400 `DisallowedHost` (HTML، نه JSON) می‌آید (live)؛ (ب) همهٔ URLهای تصویر `http://web:8000/media/...` می‌شوند (در cart با `Host: 127.0.0.1:8000` هم تأیید شد)؛ (ج) با `USE_HTTPS=True` فراخوانی HTTP ساده به https 301 می‌شود مگر `X-Forwarded-Proto: https` بفرستید؛ (د) cache backend به‌ازای هر host جدا می‌شود.
- **راه‌حل:** API را از origin **عمومی** صدا بزنید (یا توپولوژی تک‌origin با مسیر-محور). در `next/image` host API (یا storefront در تک‌origin) + `/media/**` را به `images.remotePatterns` اضافه کنید.
- **راستی‌آزمایی:** live + code.
- **منبع:** seo §0 #6 و §11.4، cart-address §1.4.

#### K-7. تنظیمات production: `DEBUG`، `USE_HTTPS`، API key، Redis، پورت، حد اندازهٔ body
- **جزئیات (seo §12):**
  - **`DEBUG=False` لازم است؛ پیش‌فرض `True` است.**
  - `USE_HTTPS=True` (redirect به SSL، کوکی امن، HSTS با پیش‌فرض 3600) لازم است.
  - سرویس web فقط `expose` 8000 دارد؛ هرگز publish نکنید، چون زیر `USE_HTTPS` هدر `X-Forwarded-Proto` از هر کسی پذیرفته می‌شود.
  - اجرای `python manage.py check --deploy` (W003 برای `TRUSTED_PROXY_IPS` خالی، W001/W070 برای Redis، E022 برای کلید gateway، …).
  - `REDIS_URL` و `SITE_CACHE_REDIS_URL` دو instance جدا باشند (در dev Redis نیست و site cache خاموش است).
  - در production هر درخواست `X-API-Key` می‌خواهد (`401 api_key_missing` / `api_key_invalid`، پیش از JWT بررسی می‌شود). کلید در پنل «تنظیمات › کلید های دسترسی API» (فقط superuser) ساخته می‌شود؛ برای هر کلاینت (web، Android، iOS) یک کلید؛ کلید حذف‌شده برگشت‌پذیر نیست؛ غیرفعال‌سازی تا ۶۰ ثانیه طول می‌کشد. کلید هرگز به مرورگر نرود (بدون `NEXT_PUBLIC_`).
  - حد body در proxy باید از بزرگ‌ترین multipart (تصویر 5MB) بیشتر باشد؛ حد JSON برابر 2.5MB است (413 `request_too_large`).
  - `DOCUMENTATION_REQUIRE_STAFF` برای دیده شدن `/api/v1/docs/` اختیاری است.
- **راستی‌آزمایی:** doc + code.
- **منبع:** seo §12.1 و §12.4.

#### K-8. سرو `/media/` و `/static/` در production
- **مسئله:** با `DEBUG=False` Django هرگز `/media/` را سرو نمی‌کند؛ proxy باید volume با نام `media_data` را سرو کند و این دو هدر را اضافه کند: `X-Content-Type-Options nosniff` و `Content-Security-Policy "default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; sandbox"` (چون SVG و آپلودهای ckeditor می‌توانند اسکریپت داشته باشند). کامنت docker-compose که می‌گوید WhiteNoise مدیا را سرو می‌کند غلط است. `/static/` با WhiteNoise سرو می‌شود.
- در توپولوژی تک‌origin (A) همه‌چیز (callback بانک، sitemap، تصاویر JSON-LD و FCM، «مشاهده در سایت») بدون rewrite اضافه کار می‌کند. در توپولوژی جدا (B) host storefront باید `/media/` و `/static/` را proxy کند (تصاویر JSON-LD/FCM روی `SITE_DOMAIN` هستند)؛ rewrite از `/static/*` در Next با پوشهٔ `public/static` تداخل دارد.
- **راستی‌آزمایی:** doc + code.
- **منبع:** seo §12.2-§12.4، product §0 و §2.

#### K-9. رفتارهای فقط-dev (`DEBUG=True`، دروازهٔ API key خاموش)
- **جزئیات:**
  - با `DEBUG=True`: مسیر ناشناختهٔ `/api/v1/...` پاسخ HTML 404 می‌دهد (`handler404` دور زده می‌شود)؛ POST بدون `/` انتهایی RuntimeError و HTML 500؛ مسیرهای بی‌روت مثل `DELETE /dashboard/comment/review/1/delete/` و `POST /notification/abc/read/`، یا `subject_type` اشتباه در path، و کلید menu غیر-slug مثل `/menu/a%20b/` همه HTML 404 صفحهٔ debug می‌دهند.
  - در production (`handler404 = utils.error_views.not_found`): JSON با `code: not_found` و متن «آدرس درخواستی یافت نشد.»، و برای `/` انتهایی نبودن 301 (`APPEND_SLASH`) که بدنهٔ POST را از بین می‌برد (production در digest بررسی نشد).
  - `DJANGO_DEVELOPMENT=True` یعنی دروازهٔ `X-API-Key` خاموش است: حتی کلید نامعتبر 200 می‌گیرد؛ پس مدیریت کلید با dev آزموده نمی‌شود.
- **راه‌حل در storefront:** همهٔ پاسخ‌ها را JSON فرض نکنید (`JSON.parse` را محافظت کنید)، همیشه `/` انتهایی بگذارید و منطق API key را جداگانه آزمایش کنید.
- **راستی‌آزمایی:** live.
- **منبع:** auth-settings §13 #11 و §11، blog §7 #6، content §14 #8، seo §0 و §12.

---

## داده‌های نمونه (fixtures)

مشکلات این بخش مربوط به داده‌های نمونه/dev است، نه کد backend. دو مورد دیگرِ مرتبط با fixture (مقدار seed برای `result_url` و credentialهای رمزگشایی‌نشدنی درگاه) در `K-2` آمده‌اند.

#### F-1. پاسخ‌های ادمین در کامنت‌های محصول هرگز نمایش داده نمی‌شوند (فیلدهای MPTT در fixture ناسازگار است)
- **محل:** `fixtures/06_product_reviews.json`؛ `CommentListViewMixin.replies_by_parent`.
- **چه می‌شود:** هر پاسخ ادمین (شناسه‌های 10027، 10029، 10031، 10033، 10036؛ همه `is_user_admin` و تأییدشده) `tree_id` برابر 1002 دارد (در DB برابر 1003) ولی هر والد درخت خودش را دارد (1014، 1012، 1009، …). `replies_by_parent` پاسخ‌ها را با `tree_id__in=<tree idهای ریشه‌ها>` می‌گیرد، پس این پاسخ‌ها بی‌صدا حذف می‌شوند. مثلاً پرسش 10026 روی S25 Ultra `replies: []` دارد در حالی که پاسخ تأییدشدهٔ 10027 وجود دارد. README ادعا می‌کند «۶ پرسش‌وپاسخ با جواب مدیر» موجود است.
- **راستی‌آزمایی:** live.
- **اثر:** UI در dev نمی‌تواند پاسخ ادمین را نشان دهد.
- **اصلاح پیشنهادی digest:** `ProductComment.objects.rebuild()` داده را درست می‌کند.
- **منبع:** product §11 #1.

#### F-2. هیچ تخفیف فعالی در داده‌ها نیست
- **چه می‌شود:** همهٔ بازه‌های تخفیف در fixture منقضی شده‌اند (شهریور ۲۰۲۶)؛ `has_discount` در API همه‌جا false است. پس `unit_discount`، `item_discount` و UI خط‌خورده (strike-through) بدون تغییر ادمین قابل آزمایش نیستند. لینک منوی `header` به `/product/list/?has_discount=true` هم نتیجه‌ای نشان نمی‌دهد. این یک مشاهدهٔ داده است، نه باگ کد.
- **ارتباط:** باگ `B-2` به همین دلیل روی dev بازتولید نمی‌شود.
- **منبع:** cart-address §13 #12، product §12.

#### F-3. روش ارسال `tipax` در داده‌های نمونه «پس‌کرایه» است و `shipping_cost: 0` می‌دهد
- **چه می‌شود:** `tipax` پرداخت-توسط-گیرنده است و کرایهٔ درون-سیستمی 0؛ پس `shipping_cost: 0` است و تنها مبلغ درب منزل بسته‌بندی (۱۵,۰۰۰) است. این با قوانین سازگار است، اما UI ساده‌انگارانه «ارسال رایگان» نشان می‌دهد.
- **راه‌حل در storefront:** برچسب «پس‌کرایه» برای روش‌های recipient-pays.
- **منبع:** cart-address §13 #11.

#### F-4. شناسه‌های نمونه در راهنماها با داده‌های این dataset نمی‌خوانند
- **چه می‌شود:**
  - راهنمای cart `"city_id": 315, "city_name": "تهران"` دارد؛ ولی 315 برابر **صباشهر** است و شهر تهران **301**.
  - راهنمای address می‌گوید province 1 = تهران، city 1 = ری، 2 = شهریار، 3 = کاشان و «اصفهان (2)». در عمل (live): province 1 = **آذربایجان شرقی**، 2 = آذربایجان غربی، تهران = 8، اصفهان = 4، شهریار = 313، کاشان = 188 و city 2 = اهر.
- **راه‌حل:** شناسه‌ها را هرگز از راهنما به seed/تست کپی نکنید.
- **منبع:** cart-address §13 #3.

#### F-5. نمونه‌های راهنما با dev DB یکی نیست (برای اطلاع)
- **چه می‌شود:** نمونهٔ راهنمای homepage/menu `footer` را با `items: []` و page idها/layout/توضیحات متفاوت نشان می‌دهد؛ dev یک footer پر دارد، همهٔ صفحات `layout: "default"` و `description: null` دارند و rich text بدون wrapper `<p>` است. نمونهٔ راهنمای محصول `paginator_number` را 12 و `related_items_number` را 4 یا 10 می‌گوید؛ در dev به‌ترتیب 24 و 8 است.
- **راه‌حل:** این مقدارها را hard-code نکنید.
- **منبع:** content §14 #11، product §11 #17.

#### F-6. فایل‌های منبع media در dev نیستند
- **چه می‌شود:** پوشهٔ `media/` در git نیست، پس همهٔ URLهای `/media/CACHE/...` در dev 404 می‌دهند؛ تنها `/static/defaults/default.png` بارگذاری می‌شود. تصویر واقعی دسته در dev وجود ندارد (همه placeholder).
- **ارتباط:** رفتار `M-16` و `J-23` در همین محیط دیده شد.
- **منبع:** blog (یادداشت‌های dev)، product §12 و §7.

#### F-7. `settings.support_link` در داده‌های demo به مسیری می‌رود که در storefront نیست
- **محل:** `GET /api/v1/global/settings/` (`support_link = https://firefly-core.ir/contact-us/`).
- **چه می‌شود:** صفحهٔ تماس منتشرشده `/page/contact-us/` است نه `/contact-us/` (live).
- **راه‌حل:** در storefront مسیر `/contact-us/` اضافه یا redirect شود، یا اپراتور لینک را عوض کند.
- **منبع:** auth-settings §13 #5.

#### F-8. SMTP و ورود با Google/SMS/Telegram در fixtureها تنظیم/روشن نیست
- **چه می‌شود:** Google، SMS و Telegram در dev همه خاموش‌اند؛ فقط OTP ایمیلی و ثبت‌نام با ایمیل فعال است (پس ثبت‌نام با تلفن، OTP تلفن، Telegram و Google قابل آزمایش نیستند). fixtureها هیچ ردیف SMTP ندارند، پس ارسال OTP ایمیلی در dev «به احتمال زیاد» 503 `auth_otp_send_failed` می‌دهد (code؛ آزموده نشد). toggleهای خاموشِ feature هم زنده آزموده نشدند.
- **راه‌حل:** در dev با ورود با رمز عبور و حساب‌های demo کار کنید.
- **منبع:** auth-settings (مقدمه و §11)، cart-address (مقدمه).

---

## پرسش‌های باز برای تیم backend

این هشت پرسش عیناً از بخش «Open questions for the backend team» در `order-payment.md` آمده‌اند (با ارجاع به موارد بالا).

1. **Q-1.** آیا `OrderList`/`OrderDetail` می‌توانند `payment_expires_at` را منتشر کنند، و آیا `is_payable` می‌تواند آن (و پنجرهٔ اصلاحیه‌ها) را رعایت کند؟ (مورد `M-1`)
2. **Q-2.** آیا replay مربوط به intent پرداخت کارت‌به‌کارت (و هر intent دیگر) باید `destination_cards` و `delivery_collection` را دوباره بسازد؟ (مورد `M-2`)
3. **Q-3.** آیا `_open_wallet` هم باید ردیف delivery-collection را مثل مسیرهای آنلاین دیگر باز کند؟ (مورد `M-3`)
4. **Q-4.** آیا `gateway/list` باید از همان predicate `_is_usable` که intentها استفاده می‌کنند استفاده کند؟ (مورد `M-4`)
5. **Q-5.** ترتیب رد کردن لینک: «settled» قبل از «expired»؟ و متن جداگانه وقتی D>0 است؟ (موارد `M-5` و `M-6`)
6. **Q-6.** آیا تقارن‌نداشتن «ناشناس 200 / واردشده 403» در `/payment/<uuid>/status/` عمدی است؟ (مورد `M-7`)
7. **Q-7.** production دقیقاً از کدام مسیر نتیجه استفاده می‌کند: `/payment/callback/` (seed) یا `/pay/result` (تست‌ها)؟ لطفاً یکی را ثابت کنید. (مورد `K-2`)
8. **Q-8.** آیا برنامه‌ای برای endpoint فاکتور/رسید PDF مشتری وجود دارد؟ (امروز ندارد.)

---

## تغییرات آزمایشی در دیتابیس توسعه

عوامل پژوهش هنگام راستی‌آزمایی روی dev server (`http://localhost:8000`) این ردپاها را در دیتابیس توسعه به جا گذاشته‌اند. برای پاک‌سازی از پنل ادمین (یا shell) استفاده کنید. بخش‌هایی که digest «ردپای صریح» گزارش نکرده، جدا و با برچسب «غیرصریح» آمده است.

**۱) ردپاهای گزارش‌شدهٔ صریح**

| مورد | جزئیات | وضعیت فعلی/پیشنهاد |
|---|---|---|
| ProductComment `10037` روی `samsung-galaxy-s25-ultra` | یک probe بدون honeypot ارسال شد: پرسش (`comment_type` question) با نام "a" و متن "x"، `status 0` (در انتظار تأیید). `tree_id`های MPTT را یکی جابه‌جا کرد (بی‌ضرر). | در storefront نمایش داده نمی‌شود؛ از صف moderation پنل حذف شود. (product.md §11، پایان بخش) |
| سفارش مهمان `5155098178` | کارت‌به‌کارت با رسید بارگذاری‌شده، در وضعیت «در انتظار بررسی رسید» | حذف/نادیده گرفتن (احتمالاً شامل فایل رسید بارگذاری‌شده) |
| سفارش مهمان `5381185545` و `7301204983` | لغوشده | حذف/نادیده گرفتن |
| سفارش shirin.tehrani `7573331679` | پرداخت‌شده با wallet، `processing` | حذف/نادیده گرفتن |
| سفارش shirin.tehrani `0404614013` | COD با هزینهٔ ارسال آنلاین ۷۰,۰۰۰ که با wallet پرداخت شد، `processing` | حذف/نادیده گرفتن |
| سفارش shirin.tehrani `5182812244` | لغوشده | حذف/نادیده گرفتن |
| یک درخواست برداشت (withdrawal request) | لغوشده | حذف/نادیده گرفتن |
| موجودی wallet کاربر shirin.tehrani | به‌خاطر دو سفارش پرداخت‌شده با wallet (`7573331679` و `0404614013`) مجموعاً **530,000** کم شده | اگر نیاز است موجودی را برگردانید (order-payment.md، ابتدای سند) |
| دیدگاه blog با id `10010` (حساب ali.karimi) | یک پرسش ثبت و سپس withdraw شد؛ فیلد `user_removed_at` روی آن پر است | رد حذف‌شدهٔ نرم؛ در صورت نیاز پاک شود |
| ردیف دستگاه FCM با `id 1` | token ساختگی `docs-digest-test-token:APA91b-web-sample-001`؛ از sara به ali منتقل (و type از web به android عوض) و سپس غیرفعال شد | حذف ردیف |
| اعلان broadcast با id `10001` | برای sara «خوانده‌شده» علامت خورد | در صورت نیاز به حالت خوانده‌نشده برگردانید |
| ردیف reading-list برای sara | اضافه و سپس حذف شد | اثری باقی نیست |
| ثبت honeypot در blog | رد شد، چیزی ذخیره نشد | اثری ندارد |

**۲) مواردی که digest صریحاً «ذخیره نشد» گفته**
- دیدگاه صفحه (pages) و پیام فرم تماس: فقط مسیرهای خطا و honeypot آزموده شد؛ «هیچ دیدگاه/پیام واقعی ذخیره نشد» (content.md §15).
- در product.md گفته شده بقیهٔ POSTها یا خطای اعتبارسنجی بودند، یا مسیر honeypot، یا رد «قبلاً موجود است»، و چیزی نمی‌نویسند. تنها نوشتن شناخته‌شده همان `10037` است.

**۳) غیرصریح: نوشتن‌هایی که digest انجامشان را گفته ولی شناسهٔ ردپا نداده**
- **cart-address:** سبدهای مهمان با token، اعمال/حذف کوپن، merge سبد برای `javad.abbasi` (سبد fixture او تغییر کرد: clamp از ۳ به ۲، پاک شدن انتخاب ارسال/COD، غیرفعال شدن سبد مهمان)، adoption سبد مهمان برای `kamran.yazdi`، و آزمایش CRUD دفترچه آدرس (ایجاد/ویرایش/حذف/تغییر پیش‌فرض) با اثر جانبی روی سبد. شناسهٔ آدرس‌ها/سبدهای ساخته‌شده در digest گزارش نشده.
- **content:** هر فراخوانی `GET /api/v1/search/` (با پرسش‌هایی مثل «سامسونگ»، «گوشی»، «ای»، `zzqx`) در گزارش جست‌وجوی اپراتور ثبت می‌شود (فقط واژه و شمارش‌ها؛ جست‌وجوی staff و `search/suggest/` ثبت نمی‌شود). ردپایی از آن‌ها در گزارش جست‌وجوی پنل باقی است.
- **شمارنده‌ها:** طبق digestها، `GET /api/v1/blog/post/<slug>/` مقدار `view_count` را بالا می‌برد و `redirects/resolve/` (`hit_count`) و `shortener/<code>/` (`visit_count`) هم شمارنده را زیاد می‌کنند. چون این endpointها روی dev صدا زده شده‌اند، شمارنده‌ها ممکن است کمی بالاتر از داده‌های اولیه باشند؛ digestها مقدار افزایش را گزارش نکرده‌اند.
- **ورود (login):** با حساب‌های `sara.ahmadi`، `ali.karimi`، `manager@firefly-core.ir`، `javad.abbasi`، `kamran.yazdi` و `shirin.tehrani` وارد شده‌اند؛ digestها اثر جانبی ورود (مثل ردیف session/token) را گزارش نکرده‌اند.
- **digest auth-settings:** می‌گوید تا جای ممکن بدون نوشتن در dev DB کار کرده (ارسال OTP، فعال‌سازی TOTP یا تغییر feature انجام نشده)؛ ردپایی گزارش نکرده.
