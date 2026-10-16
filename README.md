# فروشگاه فایرفلای (Firefly Storefront)

فرانت‌اند فروشگاهی برای API «فایرفلای کور» (Firefly Core): فارسی، راست‌به‌چپ و فقط با تم روشن. هر
فروشگاه یک استقرار جداست؛ نام، لوگو، منوها، محتوا و ویژگی‌ها از پنل بک‌اند می‌آیند و ظاهر (نوع فروشگاه،
رنگ‌ها، فونت) از متغیرهای محیطی، همه در زمان اجرا.

فناوری‌ها: Next.js 16 (App Router)، React 19، TypeScript (strict)، Tailwind CSS v4، pnpm و Node.js 22.12 به
بالا. مرورگر هرگز مستقیم با API حرف نمی‌زند؛ همهٔ درخواست‌ها از سرور Next.js می‌گذرند و کلید API فقط سمت
سرور است.

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

## اسکریپت‌ها

| اسکریپت                 | کار                                                                                   |
| ----------------------- | ------------------------------------------------------------------------------------- |
| `pnpm dev`              | سرور توسعه                                                                            |
| `pnpm build`            | ساخت تولید (`output: 'standalone'`)                                                   |
| `pnpm start:standalone` | اجرای خروجی تولید مثل داخل Docker (`server.js` با `.next/static` و `public` کنارش)    |
| `pnpm start`            | اجرای ساخت با `next start` (فقط برای استفادهٔ محلی؛ با خروجی standalone هشدار می‌دهد) |
| `pnpm lint`             | ESLint                                                                                |
| `pnpm typecheck`        | `tsc --noEmit`                                                                        |
| `pnpm test`             | آزمون‌های واحد (Vitest، jsdom)                                                        |
| `pnpm test:watch`       | Vitest در حالت watch                                                                  |
| `pnpm test:e2e`         | Playwright روی موبایل، تبلت و دسکتاپ (با بک‌اند نمونه)                                |
| `pnpm format`           | قالب‌بندی با Prettier                                                                 |
| `pnpm format:check`     | بررسی قالب‌بندی                                                                       |

## آزمون‌ها

- آزمون‌های واحد در `tests/unit/**` هستند.
- آزمون‌های end-to-end در `tests/e2e/**`. Playwright خودش `pnpm build` و سپس `pnpm start:standalone` را با
  `FIREFLY_API_URL=http://localhost:8000` و `SITE_URL=http://localhost:3000` اجرا می‌کند، یعنی دقیقاً خروجی
  تولید را آزمایش می‌کند. اگر سروری روی پورت ۳۰۰۰ بالا باشد همان استفاده می‌شود (مطمئن شوید قدیمی نیست)؛
  `E2E_BASE_URL` آدرس دیگری می‌دهد و `PLAYWRIGHT_CHROMIUM_PATH` مسیر Chromium دلخواه.
- CI (GitHub Actions) روی هر push و pull request به `main` بررسی نوع، lint، قالب‌بندی، آزمون واحد و build
  را اجرا می‌کند. آزمون‌های end-to-end به بک‌اند نیاز دارند و پیش از push روی سیستم خودتان اجرا می‌شوند.

## مستندات

- [راهنمای استقرار](docs/DEPLOYMENT.md): Docker، متغیرها، nginx، تنظیمات بک‌اند، بررسی سلامت (`/healthz/`)، عیب‌یابی
- [راهنمای سفارشی‌سازی](docs/CUSTOMIZATION.md): نوع فروشگاه، رنگ و فونت، آنچه از پنل می‌آید، کلیدهای ترجمه
- [Architecture](docs/ARCHITECTURE.md) (انگلیسی): لایه‌ها، BFF، کوکی‌ها، کش، قواعد رندر، ساختار پوشه‌ها
- [مشکلات بک‌اند](docs/BACKEND-ISSUES.md)، [خلاصهٔ APIها](docs/backend-integration/)، [طراحی](docs/superpowers/specs/2026-10-15-storefront-design.md)
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
nginx (which owns compression; the app is built with `compress: false`). `/healthz/` is the
liveness probe and never calls the API. `pnpm test:e2e` runs Playwright (mobile, tablet, desktop) against the standalone production
server and a backend with sample data; CI runs typecheck, lint, format check, unit tests and build.

Docs: [DEPLOYMENT.md](docs/DEPLOYMENT.md) and [CUSTOMIZATION.md](docs/CUSTOMIZATION.md) (Persian),
[ARCHITECTURE.md](docs/ARCHITECTURE.md) (English).
