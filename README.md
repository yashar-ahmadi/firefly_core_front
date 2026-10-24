# فروشگاه فایرفلای (Firefly Storefront)

فرانت‌اند فروشگاهی برای API «فایرفلای کور» (Firefly Core): فارسی، راست‌به‌چپ و فقط با تم روشن. هر
فروشگاه یک استقرار جداست؛ نام، لوگو، منوها، محتوا و ویژگی‌ها از پنل بک‌اند می‌آیند و ظاهر (نوع فروشگاه،
رنگ‌ها، فونت) از متغیرهای محیطی، همه در زمان اجرا.

فناوری‌ها: Next.js 16 (App Router)، React 19، TypeScript (strict)، Tailwind CSS v4، pnpm و Node.js 22.12 به
بالا. مرورگر هرگز مستقیم با API حرف نمی‌زند؛ همهٔ درخواست‌ها از سرور Next.js می‌گذرند و کلید API فقط سمت
سرور است.

آنچه فروشگاه دارد:

- **کاتالوگ:** صفحهٔ اصلی از بخش‌های پنل، دسته‌بندی‌ها، برندها، فهرست‌های ویژه و جستجو با فیلتر و مرتب‌سازی،
  صفحهٔ محصول با گونه‌ها، دیدگاه‌ها و پرسش‌ها، مقایسه، نمایش سریع و بازدیدهای اخیر.
- **خرید:** سبد خرید (مهمان و کاربر)، تسویه‌حساب چندمرحله‌ای با آدرس، روش ارسال، پرداخت بانکی، کارت‌به‌کارت،
  کیف پول و پرداخت در محل، لینک پرداخت پیامکی، صفحهٔ نتیجهٔ پرداخت و پیگیری سفارش.
- **حساب کاربری:** ورود با رمز، کد یک‌بارمصرف، گوگل و ورود دومرحله‌ای؛ ثبت‌نام، پیشخوان، سفارش‌ها،
  دیدگاه‌ها، علاقه‌مندی‌ها، آدرس‌ها، کیف پول، اعلان‌ها و فهرست خواندنی.
- **محتوا:** وبلاگ، صفحه‌های محتوا، پرسش‌های متداول، تماس با ما، صفحهٔ «لینک در بیو» و جای پیام‌های پنل.
- **سئو و دسترسی‌پذیری:** canonical و دادهٔ ساختاریافته، sitemap و robots از API، WCAG 2.1 AA؛ PWA با حالت
  آفلاین و پیشنهاد نصب، و اعلان وب با Firebase.

## شروع سریع (توسعه)

پیش‌نیاز: بک‌اند فایرفلای با دادهٔ نمونه روی `http://localhost:8000` (در حالت توسعه کلید API لازم نیست).

```bash
nvm install          # Node از روی .nvmrc (۲۲.۱۲ یا بالاتر)
corepack enable      # pnpm با نسخهٔ ثابت‌شده در package.json
pnpm install
cp .env.example .env # اختیاری: در توسعه آدرس‌ها پیش‌فرض localhost دارند
pnpm dev             # http://localhost:3000
```

بدون `.env` هم کار می‌کند: در حالت توسعه `FIREFLY_API_URL` پیش‌فرض `http://localhost:8000` و `SITE_URL`
پیش‌فرض `http://localhost:3000` است. برای امتحان نوع دیگری از فروشگاه مثلاً `STORE_PRESET=carpet` را در
`.env` بگذارید. `pnpm build` به بک‌اند نیاز ندارد. نمایش اجزای رابط کاربری در حالت توسعه:
`http://localhost:3000/dev/ui/`.

## شروع سریع (تولید)

```bash
docker build --build-arg FIREFLY_API_URL=https://api.shop.ir -t firefly-front .
cp .env.example .env   # FIREFLY_API_URL، FIREFLY_API_KEY، SITE_URL و ظاهر فروشگاه
docker run -d --env-file .env -p 127.0.0.1:3000:3000 --restart unless-stopped firefly-front
curl -i http://127.0.0.1:3000/healthz/   # ۲۰۰ وقتی متغیرها درست‌اند
```

جلوی کانتینر nginx با TLS بگذارید ([`deploy/nginx.conf.example`](deploy/nginx.conf.example)). جزئیات، تنظیمات
بک‌اند و چک‌لیست راه‌اندازی در [DEPLOYMENT.md](docs/DEPLOYMENT.md).

## نوع فروشگاه (preset)

ظاهر هر فروشگاه از یک preset می‌آید که با `STORE_PRESET` در زمان اجرا انتخاب می‌شود (ساخت دوباره لازم
نیست)، و رنگ‌ها و گردی گوشه‌هایش را می‌توان با `THEME_PRIMARY`، `THEME_ACCENT` و `THEME_RADIUS` عوض کرد:

| preset      | مناسب برای               | رنگ‌ها             |
| ----------- | ------------------------ | ------------------ |
| `default`   | فروشگاه عمومی            | نیلی و کهربایی     |
| `digital`   | موبایل، لپ‌تاپ و گجت     | آبی و نارنجی       |
| `agro`      | بذر، کود و ابزار کشاورزی | سبز و قهوه‌ای خاکی |
| `boardgame` | بازی فکری و سرگرمی       | بنفش و زرد         |
| `carpet`    | فرش و گلیم               | زرشکی و طلایی      |
| `paint`     | رنگ و ابزار ساختمانی     | فیروزه‌ای و مرجانی |

تصویر هر preset روی گوشی و دسکتاپ، جدول کنتراست رنگ‌ها (WCAG AA) و راهنمای انتخاب در
[CUSTOMIZATION.md](docs/CUSTOMIZATION.md#نمایش-presetها) است.

## اسکریپت‌ها

| اسکریپت                  | کار                                                                                                 |
| ------------------------ | --------------------------------------------------------------------------------------------------- |
| `pnpm dev`               | سرور توسعه                                                                                          |
| `pnpm build`             | ساخت تولید (`output: 'standalone'`)                                                                 |
| `pnpm start:standalone`  | اجرای خروجی تولید مثل داخل Docker (`server.js` با `.next/static` و `public` کنارش)                  |
| `pnpm start`             | اجرای ساخت با `next start` (فقط برای استفادهٔ محلی؛ با خروجی standalone هشدار می‌دهد)               |
| `pnpm lint`              | ESLint                                                                                              |
| `pnpm typecheck`         | `tsc --noEmit`                                                                                      |
| `pnpm test`              | آزمون‌های واحد (Vitest، jsdom)                                                                      |
| `pnpm test:watch`        | Vitest در حالت watch                                                                                |
| `pnpm test:e2e`          | Playwright روی موبایل، تبلت و دسکتاپ، PWA، بودجهٔ فروشگاه با اعلان وب و journeyها (با بک‌اند نمونه) |
| `pnpm test:e2e:journeys` | فقط journeyهای خرید و حساب (پروژهٔ `journeys`، یکی‌یکی، بدون وابستگی‌ها)                            |
| `pnpm format`            | قالب‌بندی با Prettier                                                                               |
| `pnpm format:check`      | بررسی قالب‌بندی                                                                                     |

## آزمون‌ها

- آزمون‌های واحد در `tests/unit/**` هستند.
- آزمون‌های end-to-end در `tests/e2e/**`. Playwright خودش `pnpm build` و سپس `pnpm start:standalone` را با
  `FIREFLY_API_URL=http://localhost:8000` و `SITE_URL=http://localhost:3000` اجرا می‌کند، یعنی دقیقاً خروجی
  تولید را آزمایش می‌کند. اگر سروری روی پورت ۳۰۰۰ بالا باشد همان استفاده می‌شود (مطمئن شوید قدیمی نیست)؛
  `E2E_BASE_URL` آدرس دیگری می‌دهد و `PLAYWRIGHT_CHROMIUM_PATH` مسیر Chromium دلخواه. سرور دومی روی پورت
  ۳۰۰۱ (همان build با `FEATURE_PWA` روشن و `FIREBASE_*` ساختگی) پروژه‌های `pwa` و `budget-push` را
  می‌گرداند. بک‌اند نمونه فقط یک اجرای کامل در ساعت را جا می‌دهد؛ سهمیه‌ها، نوشتن‌ها در پایگاه دادهٔ نمونه و
  متغیرهای اختیاری `E2E_LIVE_*` در [DEPLOYMENT.md](docs/DEPLOYMENT.md#آزمون‌ها-و-ci) آمده‌اند.
- CI (GitHub Actions) روی هر push و pull request به `main` بررسی نوع، lint، قالب‌بندی، آزمون واحد و build
  را اجرا می‌کند. آزمون‌های end-to-end به بک‌اند نیاز دارند و پیش از push روی سیستم خودتان اجرا می‌شوند.
- دسترس‌پذیری: `tests/e2e/a11y.spec.ts` و `a11y-overlays.spec.ts` (بخشی از `pnpm test:e2e`) با axe-core هر
  نوع صفحه و هر منو و پنجره را روی موبایل و دسکتاپ می‌سنجند (WCAG 2.1 AA، هیچ خطای serious یا critical).
- Lighthouse بخشی از `pnpm test:e2e` نیست و دستی اجرا می‌شود: با سرور تولید بالا
  (`pnpm build && pnpm start:standalone`) دستور `node scripts/lighthouse.mjs [home category product post checkout]`
  هر صفحه را سه بار در حالت موبایل می‌سنجد، گزارش‌های JSON را در پوشهٔ موقت سیستم می‌گذارد و میانهٔ
  امتیازها را جدول می‌کند (`BASE_URL`، `RUNS` و `CHROME_PATH` را می‌پذیرد).

## مستندات

- [راهنمای استقرار](docs/DEPLOYMENT.md): Docker، متغیرها، nginx، تنظیمات بک‌اند، بررسی سلامت (`/healthz/`)، عیب‌یابی
- [راهنمای سفارشی‌سازی](docs/CUSTOMIZATION.md): نوع فروشگاه، رنگ و فونت، آنچه از پنل می‌آید، کلیدهای ترجمه
- [Architecture](docs/ARCHITECTURE.md) (انگلیسی): لایه‌ها، BFF، کوکی‌ها، کش، قواعد رندر، ساختار پوشه‌ها
- [مشکلات بک‌اند](docs/BACKEND-ISSUES.md): گزارش (فقط گزارش؛ کد بک‌اند تغییر نکرده) با سطح، محل و راه‌حل
  سمت فروشگاه، و ردپای آزمون‌ها در پایگاه دادهٔ توسعه
- [خلاصهٔ APIها](docs/backend-integration/)، [طراحی](docs/superpowers/specs/2026-10-15-storefront-design.md) و
  [برنامه‌های اجرا](docs/superpowers/plans/)
- نمونهٔ nginx: [`deploy/nginx.conf.example`](deploy/nginx.conf.example)

---

## English summary

Production storefront for the Firefly Core API: Persian only (`fa`, RTL), light theme only, one
deployment per shop. Stack: Next.js 16 (App Router), React 19, TypeScript (strict), Tailwind CSS
v4, pnpm, Node.js 22.12+. The browser never calls the Firefly API directly: Server Components and a
BFF route (`/api/bff/*`) call it server-side with the server-only API key, and session tokens live in
httpOnly cookies. All shop configuration is read at runtime; the only build input is
`FIREFLY_API_URL` for the `next/image` host allow-list, and `pnpm build` needs no backend.

Quick start: `corepack enable && pnpm install && pnpm dev` against a local backend on
`http://localhost:8000`. Production: `docker build --build-arg FIREFLY_API_URL=https://api.example.ir
-t firefly-front .`, then `docker run --env-file .env -p 127.0.0.1:3000:3000 firefly-front` behind
nginx (which strips `Accept-Encoding` and compresses once with brotli or gzip; the app gzips by
itself only when no proxy strips that header). The app sends its own clickjacking, nosniff and
referrer headers. `/healthz/` is the health probe: 200 with a valid environment, 503 without, and
never an API call. `pnpm test:e2e` runs Playwright (mobile, tablet, desktop, then the PWA, the
push-enabled shop's JS budget and the write journeys) against the standalone production server and
a backend with sample data, axe-core accessibility checks included; CI runs
typecheck, lint, format check, unit tests and build, and builds, starts and probes the Docker image.
`node scripts/lighthouse.mjs` runs Lighthouse (mobile, three runs a page, the median) by hand.

Six presets (`STORE_PRESET`: default, digital, agro, boardgame, carpet, paint) set the look at
runtime; CUSTOMIZATION shows each on a phone and a desktop with its WCAG AA contrast table.

Docs: [DEPLOYMENT.md](docs/DEPLOYMENT.md), [CUSTOMIZATION.md](docs/CUSTOMIZATION.md) and
[BACKEND-ISSUES.md](docs/BACKEND-ISSUES.md) (Persian), [ARCHITECTURE.md](docs/ARCHITECTURE.md)
(English).
