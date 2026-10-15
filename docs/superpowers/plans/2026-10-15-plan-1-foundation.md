# Plan 1 — Foundation and Shell — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A running Next.js 16 storefront skeleton. It reads the shop's identity, menus, feature switches and theme at runtime, talks to the Firefly API only server-side (directly or through a BFF), and renders a polished, responsive RTL shell: header, mega-menu, mobile bottom navigation, footer, and error and not-found pages. It also handles robots, sitemap, redirects, short links, media forwarding and the bank callback.

**Architecture:** App Router with Server Components first. A typed API layer (`src/lib/api`) with one server transport (adds the API key) and one browser transport (calls `/api/bff/*`). Session tokens live in httpOnly cookies, managed by the BFF route handler and `proxy.ts`. Theme tokens are generated at runtime from env and preset into CSS variables, which Tailwind v4 maps to utilities.

**Tech Stack:** Next.js 16.4.x, React 19.x, TypeScript 5.9.x, Tailwind CSS 4.3.x, Radix UI, Embla, Motion, Sonner, Vaul, lucide-react, TanStack Query 5, Zustand 5, zod 4, react-hook-form 7, Vitest 5 + Testing Library + jsdom, Playwright 1.64, pnpm.

**Spec:** `docs/superpowers/specs/2026-10-15-storefront-design.md`. API contracts: `docs/backend-integration/*.md` (auth-settings, content, seo-cache-deploy are the ones this plan uses).

## Global Constraints

- Next.js **16** App Router; React 19; TypeScript `strict: true`; Tailwind CSS **v4**; package manager **pnpm**; Node **22**.
- `next.config.ts`: `trailingSlash: true`, `output: 'standalone'`, `poweredByHeader: false`.
- Persian only: `<html lang="fa" dir="rtl">`. **Light theme only.**
- The browser never calls the Firefly API directly. `FIREFLY_API_KEY` is server-only and never prefixed `NEXT_PUBLIC_`.
- Session cookies: `ff_at` (access), `ff_rt` (refresh), `ff_cart` (guest cart token). All are httpOnly, `SameSite=Lax`, and `Secure` when `SITE_URL` is https. `ff_auth=1` is a non-httpOnly flag that is present while a refresh cookie exists.
- No build-time dependency on the API. `pnpm build` must succeed with no backend running.
- Every Firefly API path ends with `/`.
- UI numbers use Persian digits, money is shown as «… تومان», and dates are Jalali (`fa-IR-u-ca-persian`, time zone `Asia/Tehran`).
- Font: Vazirmatn, self-hosted.
- Touch targets are at least 44 px and body text at least 16 px. Every interactive element shows a visible focus ring. Motion respects `prefers-reduced-motion`.
- Server Components by default; `"use client"` only at interactive leaves. Named exports. Imports use `@/`. Keep files under about 250 lines.
- Code, identifiers and comments are in English; all user-facing copy is Persian.
- Conventional commit messages in English (`feat:`, `fix:`, `test:`, `chore:`, `docs:`). Commit after each task.
- Local backend for tests: `http://localhost:8000`, with the API-key gate off in dev and sample data loaded. Demo login: `sara.ahmadi@example.com` / `Firefly@1234`.
- Next.js 16 docs ship in `node_modules/next/dist/docs/`. Read the relevant page before using an API you are unsure of: `proxy`, route handlers, metadata, `next/font`, caching without cache components.

## Review Focus

1. **The backend is down or slow.** The shell must still render, with the store name falling back to the preset label, empty menus and no crash, and the layout must never throw because of menus, snippets or feature status. Test: the settings, menu and feature loaders return safe defaults when `fetch` rejects (Task 8).
2. **Persian slugs or paths containing malformed percent-encoding** (`/page/abc%ZZ/`) must give a 404, not a 500. Test in Task 7 (`ruleSpelling` returns `null`, and the proxy lets the request through to the not-found page).
3. **An expired access token with a valid refresh token** on a full page load must be refreshed before render, with the new cookie set. If the refresh token is rejected, every session cookie is cleared. Test in Task 7.
4. **Tokens never reach browser JavaScript.** BFF responses to login, OTP verify, Google login, register complete and password change must not contain `tokens`. Test in Task 6.
5. **The API answers with a non-JSON body** (HTML 502 or 504 from a proxy). The transports must throw `ApiError` with `code: 'non_json_response'` and not crash on `JSON.parse`. Test in Task 4.

---

## File map (this plan)

```
package.json, pnpm-lock.yaml, next.config.ts, tsconfig.json, eslint.config.mjs, .prettierrc,
vitest.config.ts, vitest.setup.ts, playwright.config.ts, .env.example, .gitignore, .nvmrc, Dockerfile, .dockerignore
src/
  proxy.ts
  config/env.ts                    # zod runtime env
  config/presets/{index,default,digital,agro,boardgame,carpet,paint}.ts
  config/store-config.ts           # resolveStoreConfig, toPublicConfig
  lib/theme/color.ts               # OKLCH math, scale generation, contrast
  lib/theme/css.ts                 # buildThemeCss
  lib/format/{digits,number,date,phone}.ts
  lib/api/types/common.ts          # Envelope, Paginated, ApiErrorItem, FeatureKey …
  lib/api/types/settings.ts        # SiteSettings, MenuNode, Snippet, Social …
  lib/api/errors.ts                # ApiError
  lib/api/envelope.ts              # parseResponse()
  lib/api/server.ts                # apiFetch (server-only)
  lib/api/client.ts                # bffFetch (browser)
  lib/auth/cookies.ts              # cookie names and options
  lib/auth/jwt.ts                  # decodeJwtExp, isExpiring
  lib/auth/refresh.ts              # refreshAccess (server)
  lib/http/client-ip.ts            # getClientIp
  lib/bff/allowlist.ts
  lib/bff/handler.ts               # handleBff
  lib/edge/redirects.ts            # ruleSpelling, knownSources, resolveRedirect
  lib/edge/status-page.ts          # statusPage(status, title, message)
  lib/i18n/fa.ts                   # default dictionary
  lib/i18n/translator.ts           # createTranslator
  lib/snippets/parse.ts            # parseSnippet
  features/settings/api.ts         # getSiteSettings, getFeatureStatus, getMenu, getSocials, getSnippets, getTranslations, getCategoryTree
  features/settings/feature-context.tsx
  app/layout.tsx, app/providers.tsx, app/globals.css (imports styles), app/not-found.tsx, app/error.tsx, app/global-error.tsx
  app/(shop)/layout.tsx, app/(shop)/page.tsx (temporary home placeholder replaced in Plan 2)
  app/api/bff/[...path]/route.ts
  app/api/v1/payment/gateway/callback/[gateway]/[token]/route.ts
  app/robots.txt/route.ts
  app/s/[code]/route.ts
  app/dev/ui/page.tsx              # component showcase, 404 in production
  styles/globals.css, styles/rich-content.css
  assets/fonts/vazirmatn/Vazirmatn-wght.woff2 (+ OFL.txt)
  components/ui/*.tsx              # primitives (Tasks 9–10)
  components/layout/*.tsx          # shell (Tasks 12–13)
tests/unit/** , tests/e2e/**
docs/ARCHITECTURE.md, docs/CUSTOMIZATION.md, docs/DEPLOYMENT.md
```

---

### Task 1: Scaffold the project and tooling

**Files:**
- Create: `package.json`, `next.config.ts`, `tsconfig.json`, `eslint.config.mjs`, `.prettierrc`, `.prettierignore`, `vitest.config.ts`, `vitest.setup.ts`, `playwright.config.ts`, `.gitignore`, `.nvmrc`, `.editorconfig`, `src/app/layout.tsx` (minimal), `src/app/(shop)/page.tsx` (minimal), `README.md`
- Test: `tests/unit/smoke.test.ts`

**Interfaces:**
- Produces: the scripts `dev`, `build`, `start`, `lint`, `typecheck` (`tsc --noEmit`), `test` (`vitest run`), `test:watch`, `test:e2e` (`playwright test`), `format`, `format:check`. Path alias `@/*` → `src/*`.

- [ ] **Step 1:** Create the app with pnpm and pin the stack: `next@16.4`, `react@19`, `react-dom@19`, `typescript@~5.9.3`, `tailwindcss@4`, `@tailwindcss/postcss@4`, `eslint`, `eslint-config-next@16.4`, `prettier`, `prettier-plugin-tailwindcss`, `vitest@5`, `@vitejs/plugin-react`, `jsdom`, `@testing-library/react`, `@testing-library/user-event`, `@testing-library/jest-dom`, `@playwright/test@1.64`, plus runtime deps `zod@4`, `@tanstack/react-query@5`, `zustand@5`, `radix-ui`, `embla-carousel-react`, `motion`, `sonner`, `vaul`, `lucide-react`, `clsx`, `tailwind-merge`, `react-hook-form`, `@hookform/resolvers`, `server-only`. Use a `src/` directory and the App Router. Set `"packageManager"` and `engines.node >= 22`.
- [ ] **Step 2:** In `next.config.ts`, set `trailingSlash: true`, `output: 'standalone'`, `poweredByHeader: false` and `reactStrictMode: true`. Set `images.remotePatterns` as follows.
  - If `FIREFLY_API_URL` is set **at build time**, allow exactly its protocol and host, with paths `/media/**` and `/static/**`.
  - Otherwise allow `https://**` and `http://localhost` with those two path prefixes only, and log one warning.
  - Also add `images.formats: ['image/avif', 'image/webp']`.
- [ ] **Step 3:** Configure Vitest:
  - jsdom environment, `@/` alias, `vitest.setup.ts` importing `@testing-library/jest-dom/vitest`;
  - include `tests/unit/**/*.test.{ts,tsx}` and `src/**/*.test.{ts,tsx}`.
- [ ] **Step 4:** Configure Playwright:
  - `testDir: tests/e2e`; `baseURL` taken from `E2E_BASE_URL`, default `http://localhost:3000`;
  - projects `mobile` (Pixel 7), `tablet` (iPad gen 7 landscape) and `desktop` (1440×900 Chrome);
  - `webServer` runs `pnpm build && pnpm start` with `FIREFLY_API_URL=http://localhost:8000` and `SITE_URL=http://localhost:3000` (reused when already running);
  - Chromium executable path `/opt/pw-browsers/chromium` if `PLAYWRIGHT_CHROMIUM_PATH` is set.
- [ ] **Step 5:** Write `tests/unit/smoke.test.ts` asserting `1 + 1 === 2`. Run `pnpm test`; expect 1 passing. Run `pnpm typecheck && pnpm lint && pnpm build`; expect all to succeed.
- [ ] **Step 6:** Commit: `chore: scaffold Next.js 16 storefront with tooling`.

### Task 2: Runtime environment, presets and store config

**Files:**
- Create: `src/config/env.ts`, `src/config/presets/index.ts` and one file per preset, `src/config/store-config.ts`, `.env.example`
- Test: `tests/unit/config/env.test.ts`, `tests/unit/config/store-config.test.ts`

**Interfaces:**
- Produces:
  - `type PresetName = 'default' | 'digital' | 'agro' | 'boardgame' | 'carpet' | 'paint'`
  - `type RadiusScale = 'sm' | 'md' | 'lg' | 'xl'`
  - `interface Preset { name: PresetName; label: string /* Persian */; primary: string; accent: string; radius: RadiusScale; shadow: 'soft' | 'crisp'; motion: 'calm' | 'lively'; cardStyle: 'flat' | 'elevated' }`
  - `parseServerEnv(raw: Record<string, string | undefined>): ServerEnv` (pure, throws `Error` listing every invalid variable) and `getServerEnv(): ServerEnv` (memoized over `process.env`, `server-only`)
  - `interface ServerEnv { FIREFLY_API_URL: string /* no trailing slash */; FIREFLY_API_KEY: string; SITE_URL: string /* no trailing slash */; STORE_PRESET: PresetName; THEME_PRIMARY?: string; THEME_ACCENT?: string; THEME_RADIUS?: RadiusScale; THEME_FONT: 'vazirmatn' | 'custom'; NESHAN_MAP_KEY?: string; NESHAN_SERVICE_KEY?: string; FIREBASE?: FirebaseWebConfig; FEATURE_COMPARE: boolean; FEATURE_QUICK_VIEW: boolean; FEATURE_RECENTLY_VIEWED: boolean; FEATURE_PWA: boolean; CLIENT_IP_HEADER: string /* lower-case header name or 'none' */ }`
  - `interface FirebaseWebConfig { apiKey: string; projectId: string; messagingSenderId: string; appId: string; vapidKey: string }`. It is built only when all five `FIREBASE_*` variables (`FIREBASE_API_KEY`, `FIREBASE_PROJECT_ID`, `FIREBASE_MESSAGING_SENDER_ID`, `FIREBASE_APP_ID`, `FIREBASE_VAPID_KEY`) are set.
  - `resolveStoreConfig(env: ServerEnv): StoreConfig`
  - `interface StoreConfig { preset: PresetName; presetLabel: string; siteUrl: string; apiUrl: string; theme: ThemeConfig; features: { compare: boolean; quickView: boolean; recentlyViewed: boolean; pwa: boolean; webPush: boolean }; map: { provider: 'neshan' | 'osm'; neshanKey: string | null }; firebase: FirebaseWebConfig | null }`
  - `interface ThemeConfig { primary: string; accent: string; radius: RadiusScale; shadow: 'soft' | 'crisp'; font: 'vazirmatn' | 'custom'; motion: 'calm' | 'lively'; cardStyle: 'flat' | 'elevated' }`
  - `type PublicStoreConfig = Omit<StoreConfig, 'apiUrl'>`, produced by `toPublicConfig(c: StoreConfig): PublicStoreConfig`
  - `getStoreConfig(): StoreConfig` (memoized, `server-only`)

- [ ] **Step 1: Write failing tests.**
  - `parseServerEnv({ FIREFLY_API_URL: 'https://api.shop.ir/', SITE_URL: 'https://shop.ir/', FIREFLY_API_KEY: 'k' })` gives `FIREFLY_API_URL === 'https://api.shop.ir'`, `STORE_PRESET === 'default'`, `THEME_FONT === 'vazirmatn'`, `FEATURE_COMPARE === true` and `CLIENT_IP_HEADER === 'x-real-ip'`.
  - `THEME_PRIMARY: 'blue'` throws with a message containing `THEME_PRIMARY`.
  - Missing `FIREFLY_API_KEY` throws only when `NODE_ENV === 'production'`.
  - `FEATURE_COMPARE: 'false'` gives `false`.
  - `resolveStoreConfig` with `STORE_PRESET: 'carpet'` and no overrides gives `theme.primary === '#8B1E3F'` and `presetLabel === 'فرش'`.
  - Setting `THEME_PRIMARY: '#123456'` overrides the preset's primary.
  - `map.provider` is `'neshan'` only when `NESHAN_MAP_KEY` is set.
  - `features.webPush` is true only when the full Firebase config is present.
  - `toPublicConfig` has no `apiUrl` key.
- [ ] **Step 2:** Run `pnpm test tests/unit/config`; expect FAIL (module not found).
- [ ] **Step 3: Implement.** Preset values:

  | preset | label | primary | accent | radius | shadow | motion | card |
  |---|---|---|---|---|---|---|---|
  | default | فروشگاه | `#4F46E5` | `#F59E0B` | lg | soft | calm | elevated |
  | digital | کالای دیجیتال | `#2563EB` | `#F97316` | lg | crisp | calm | elevated |
  | agro | بذر و کود | `#15803D` | `#B45309` | xl | soft | calm | flat |
  | boardgame | بازی فکری | `#7C3AED` | `#FACC15` | xl | soft | lively | elevated |
  | carpet | فرش | `#8B1E3F` | `#C8A24A` | md | soft | calm | flat |
  | paint | رنگ ساختمانی | `#0E7490` | `#F43F5E` | lg | crisp | lively | elevated |

  Hex values are validated with `/^#[0-9a-fA-F]{6}$/`. Booleans accept `true`, `false`, `1` and `0`.
- [ ] **Step 4:** Run the tests; expect PASS. Write `.env.example` documenting every variable, with a Persian and an English one-line comment each.
- [ ] **Step 5:** Commit: `feat: runtime env schema, store presets and store config`.

### Task 3: Theme tokens, global styles and font

**Files:**
- Create: `src/lib/theme/color.ts`, `src/lib/theme/css.ts`, `src/styles/globals.css`, `src/styles/rich-content.css`, `src/assets/fonts/vazirmatn/Vazirmatn-wght.woff2`, `src/assets/fonts/vazirmatn/OFL.txt`, `src/lib/fonts.ts`
- Modify: `src/app/layout.tsx`
- Test: `tests/unit/theme/color.test.ts`, `tests/unit/theme/css.test.ts`

**Interfaces:**
- Produces:
  - `type Shade = 50 | 100 | 200 | 300 | 400 | 500 | 600 | 700 | 800 | 900 | 950`
  - `generateScale(hex: string): Record<Shade, string>`, returning `#rrggbb` strings
  - `contrastRatio(a: string, b: string): number` (WCAG 2.x)
  - `readableTextOn(hex: string): '#FFFFFF' | '#111827'`
  - `buildThemeCss(theme: ThemeConfig): string`, returning one `:root{…}` block
  - CSS variables: `--brand-{shade}`, `--brand`, `--brand-fg`, `--accent-{shade}`, `--accent`, `--accent-fg`, `--radius-control`, `--radius-card`, `--radius-pill`, `--shadow-card`, `--shadow-raised`
  - Tailwind utilities through `@theme inline`:
    - colours `brand-*`, `accent-*`, `brand`, `brand-fg`, `accent`, `accent-fg`, a fixed neutral `ink-*` scale (slate-like, 50–950), and `success`, `warning`, `danger`, `info`, `sale`;
    - radii `rounded-control`, `rounded-card`, `rounded-pill`;
    - shadows `shadow-card`, `shadow-raised`;
    - font `font-sans` (Vazirmatn variable `--font-vazirmatn`).
  - `vazirmatn` (next/font/local instance, `variable: '--font-vazirmatn'`, `display: 'swap'`, preload) exported from `src/lib/fonts.ts`.

- [ ] **Step 1: Write failing tests.**
  - `generateScale('#2563EB')` has 11 keys, all `#rrggbb`.
  - Relative luminance strictly decreases from 50 to 950.
  - Shade 600 is within ΔE (OKLab Euclidean) < 0.04 of the input.
  - `contrastRatio('#FFFFFF', '#000000')` ≈ 21.
  - `readableTextOn('#FACC15') === '#111827'` and `readableTextOn('#4F46E5') === '#FFFFFF'`.
  - `buildThemeCss` output contains `--brand-600:` and `--radius-card:` and, for `radius: 'xl'`, `--radius-card: 1.5rem`.
- [ ] **Step 2:** Run; expect FAIL.
- [ ] **Step 3: Implement the OKLCH math.** Use hex → sRGB → linear → OKLab → OKLCH. Set target lightness per shade: `{50:.975,100:.945,200:.89,300:.82,400:.73,500:.64,600:.56,700:.49,800:.41,900:.34,950:.26}`. Shade 600 uses the input's own lightness, and the curve is shifted so that 600 equals the input. Chroma is the input chroma × `{50:.12,100:.25,200:.45,300:.7,400:.9,500:1,600:1,700:.92,800:.8,900:.66,950:.5}`. Gamut-map by lowering chroma until the colour is inside sRGB.
- [ ] **Step 4:** Implement the radius map:

  | scale | control | card | pill |
  |---|---|---|---|
  | sm | .375rem | .5rem | 9999px |
  | md | .5rem | .75rem | 9999px |
  | lg | .75rem | 1rem | 9999px |
  | xl | 1rem | 1.5rem | 9999px |

  Shadows:
  - soft: card `0 1px 2px rgb(15 23 42/.04),0 4px 16px rgb(15 23 42/.06)`; raised `0 8px 30px rgb(15 23 42/.12)`;
  - crisp: card `0 1px 3px rgb(15 23 42/.1)`; raised `0 6px 20px rgb(15 23 42/.16)`.
- [ ] **Step 5: Font.** Convert the variable `Vazirmatn[wght].ttf` from npm `vazirmatn@33.0.3` (`fonts/variable/`) to woff2 using Python `fontTools` + `brotli` in a throwaway venv in the system temp directory. Commit the woff2 together with `OFL.txt`. Load it with `next/font/local` (`weight: '100 900'`).
- [ ] **Step 6: Global styles.**
  - `globals.css`:
    - `@import 'tailwindcss'`, the `@theme inline` block, and `@import './rich-content.css'`;
    - base `html { font-size: 16px }`, body `bg-ink-50 text-ink-900 antialiased`;
    - `:focus-visible` ring using `--brand-500`;
    - a `prefers-reduced-motion` block that zeroes animation and transition durations;
    - Persian line-height 1.8 for body text.
  - `rich-content.css` (`.rich-content`):
    - styles headings, paragraphs, lists, tables (horizontal scroll wrapper), images (max-width 100%, rounded), blockquote, `a` (brand colour, underline on hover);
    - bare text nodes after headings still get paragraph spacing.
  - The root layout injects `<style id="theme-vars">{buildThemeCss(getStoreConfig().theme)}</style>` in `<head>`.
- [ ] **Step 7:** Run unit tests, `pnpm build`. Expect PASS.
- [ ] **Step 8:** Commit: `feat: runtime theme tokens, Tailwind v4 theme and Vazirmatn font`.

### Task 4: Formatting utilities

**Files:**
- Create: `src/lib/format/digits.ts`, `number.ts`, `date.ts`, `phone.ts`, `index.ts`
- Test: `tests/unit/format/*.test.ts`

**Interfaces:**
- Produces:
  - `toPersianDigits(v: string | number): string`
  - `toLatinDigits(v: string): string` (Persian and Arabic-Indic → ASCII)
  - `formatNumber(n: number): string`
  - `formatToman(n: number, opts?: { suffix?: boolean }): string`
  - `formatPercent(n: number /* 0–100 */): string`
  - `formatJalaliDate(iso: string, style?: 'long' | 'short' | 'weekday'): string`
  - `formatJalaliDateTime(iso: string): string`
  - `formatRelative(iso: string, now?: Date): string`
  - `formatIranMobile(v: string): string`
  - `normalizeIranMobile(v: string): string | null` (returns `09xxxxxxxxx`)
  - `isIranMobile(v: string): boolean`

- [ ] **Step 1: Write failing tests** with exact expectations:
  - `toPersianDigits('S25 128')` → `'S۲۵ ۱۲۸'`
  - `toLatinDigits('۰۹۱۲٣٤٥')` → `'0912345'`
  - `formatNumber(12500000)` → `'۱۲٬۵۰۰٬۰۰۰'`
  - `formatToman(12500000)` → `'۱۲٬۵۰۰٬۰۰۰ تومان'`
  - `formatToman(0)` → `'۰ تومان'`
  - `formatToman(1200, { suffix: false })` → `'۱٬۲۰۰'`
  - `formatPercent(25)` → `'۲۵٪'`
  - `formatJalaliDate('2026-10-15T15:00:00+03:30')` → `'۲۳ مهر ۱۴۰۵'`
  - `formatJalaliDate(…, 'short')` → `'۱۴۰۵/۰۷/۲۳'`
  - `formatJalaliDate(…, 'weekday')` → `'پنجشنبه ۲۳ مهر'`
  - `formatJalaliDateTime(…)` → `'۲۳ مهر ۱۴۰۵، ساعت ۱۵:۰۰'`
  - `formatRelative('2026-10-15T12:00:00+03:30', new Date('2026-10-15T15:00:00+03:30'))` → `'۳ ساعت پیش'`
  - `formatIranMobile('+989121234567')` → `'۰۹۱۲ ۱۲۳ ۴۵۶۷'`
  - `normalizeIranMobile('۰۰۹۸۹۱۲۱۲۳۴۵۶۷')` → `'09121234567'`
  - `normalizeIranMobile('+982191000000')` → `null`
  - `isIranMobile('9121234567')` → `true`
- [ ] **Step 2:** Run; expect FAIL. **Step 3:** Implement with `Intl` (`fa-IR`, `fa-IR-u-ca-persian`, `timeZone: 'Asia/Tehran'`, `Intl.RelativeTimeFormat('fa', { numeric: 'auto' })`). **Step 4:** Run; expect PASS.
- [ ] **Step 5:** Commit: `feat: Persian number, Toman, Jalali date and mobile formatting`.

### Task 5: API core — types, errors, envelope parsing, server and browser transports

**Files:**
- Create: `src/lib/api/types/common.ts`, `src/lib/api/errors.ts`, `src/lib/api/envelope.ts`, `src/lib/api/server.ts`, `src/lib/api/client.ts`, `src/lib/http/client-ip.ts`
- Test: `tests/unit/api/envelope.test.ts`, `tests/unit/api/server.test.ts`, `tests/unit/api/client.test.ts`, `tests/unit/http/client-ip.test.ts`

**Interfaces:**
- Produces:
  - `interface Envelope<T> { msg: string; code: number; data: T }`
  - `interface Paginated<T> { count: number; total_pages: number; current_page: number; page_size: number; next: string | null; previous: string | null; results: T[] }`
  - `interface ApiErrorItem { code: string; detail: string; attr: string | null }`
  - `type FeatureKey = 'blog' | 'blog_comments' | 'product_comments' | 'stock_notifications' | 'coupons' | 'pay_on_delivery' | 'online_payment' | 'wallet' | 'guest_checkout' | 'registration'`
  - `class ApiError extends Error { status: number; code: string; errors: ApiErrorItem[]; detail: string; retryAfter: number | null; feature: FeatureKey | null; data: Record<string, unknown> }`, with `isFeatureDisabled()`, `isAuth()` (401) and `fieldErrors(): Record<string, string>` (keyed by `attr`; `null` attrs go under `'non_field_errors'`)
  - `parseResponse<T>(res: Response): Promise<{ data: T; msg: string; status: number }>`
    - 204 gives `data: null`;
    - a non-JSON body throws `ApiError` (`code: 'non_json_response'`, `detail: 'ارتباط با سرور برقرار نشد. لطفاً دوباره تلاش کنید.'`);
    - a non-2xx JSON response throws `ApiError` built from `data.errors`.
  - `apiPath(path: string, query?: QueryInit): string`, where `type QueryInit = Record<string, string | number | boolean | Array<string | number> | null | undefined>`
    - it ensures exactly one trailing `/` before the query, encodes each path segment once, repeats array query params, and drops `null`/`undefined`.
  - `apiFetch<T>(path: string, opts?: { method?: string; query?: QueryInit; body?: unknown; formData?: FormData; token?: string | null; cartToken?: string | null; idempotencyKey?: string; forwardedFor?: string | null; revalidate?: number | false; tags?: string[]; signal?: AbortSignal; timeoutMs?: number /* default 10000 */ }): Promise<{ data: T; msg: string; status: number; headers: Headers }>` (`server-only`)
    - it calls `${FIREFLY_API_URL}/api/v1/${path}` with `X-API-Key`, `Accept: application/json`, and `Content-Type: application/json` for a JSON body;
    - `revalidate: false` or any token or cart token means `cache: 'no-store'`; otherwise `next: { revalidate, tags }`.
  - `bffFetch<T>(path: string, opts?: { method?; query?; body?; formData?; idempotencyKey?; signal? }): Promise<{ data: T; msg: string; status: number }>` (browser)
    - it calls `/api/bff/${path}` with header `X-Requested-With: ff` and the same error semantics.
  - `getClientIp(headers: Headers, headerName: string): string | null` (`'none'` returns `null`; `x-forwarded-for` takes the first entry)

- [ ] **Step 1: Write failing tests** (mock `globalThis.fetch`).
  - A 200 envelope returns `data`; 204 returns `null`; HTML 502 throws `non_json_response`.
  - A 400 validation error exposes `fieldErrors()` mapping `receiver.mobile`.
  - A 429 has `retryAfter === 60` from `data.retry_after`.
  - A 503 has `feature === 'blog'` and `isFeatureDisabled()` is true.
  - `apiPath('product/detail/گوشی', { a: [1, 2], b: null })` → `'product/detail/%DA%AF%D9%88%D8%B4%DB%8C/?a=1&a=2'`.
  - `apiFetch` sends `X-API-Key`, sets `X-Forwarded-For` when given, uses `cache: 'no-store'` when a token is present, and sends `Idempotency-Key` when given.
  - `bffFetch` targets `/api/bff/...` and sends `X-Requested-With`.
  - `getClientIp` reads `x-real-ip`, and takes `1.1.1.1` from `x-forwarded-for: 1.1.1.1, 2.2.2.2`.
- [ ] **Step 2:** Run; FAIL. **Step 3:** Implement. **Step 4:** Run; PASS.
- [ ] **Step 5:** Commit: `feat: typed Firefly API transports and error model`.

### Task 6: Session cookies and the BFF route

**Files:**
- Create: `src/lib/auth/cookies.ts`, `src/lib/auth/jwt.ts`, `src/lib/auth/refresh.ts`, `src/lib/bff/allowlist.ts`, `src/lib/bff/handler.ts`, `src/app/api/bff/[...path]/route.ts`
- Test: `tests/unit/auth/jwt.test.ts`, `tests/unit/bff/allowlist.test.ts`, `tests/unit/bff/handler.test.ts`

**Interfaces:**
- Consumes: `apiPath`, `parseResponse`, `ApiError` (Task 5), `getServerEnv` (Task 2), `getClientIp`.
- Produces:
  - `COOKIE = { access: 'ff_at', refresh: 'ff_rt', cart: 'ff_cart', flag: 'ff_auth' } as const`
  - `cookieOptions(name: keyof typeof COOKIE, maxAgeSeconds: number, secure: boolean): ResponseCookie options`
  - `decodeJwtExp(token: string): number | null` (seconds; no signature check)
  - `isExpiring(token: string | null | undefined, skewSeconds = 30, now = Date.now()): boolean`
  - `refreshAccess(refresh: string, forwardedFor: string | null): Promise<{ access: string } | { error: 'invalid' | 'inactive' | 'network' }>` (`server-only`; it calls `POST account/auth/token/refresh/`)
  - `isAllowed(method: string, path: string): boolean`
  - `handleBff(req: NextRequest, segments: string[]): Promise<NextResponse>`

  **Behaviour of `handleBff`:**
  1. Reject paths that are not allow-listed with 404 (`not_found` envelope).
  2. For non-GET, require header `X-Requested-With: ff` and that `Origin`, when present, matches the request host. Otherwise return 403.
  3. If `ff_at` is expiring and `ff_rt` exists, refresh first.
  4. Forward the method, query, and JSON or multipart body (streamed). Headers:
     - `X-API-Key`;
     - `Authorization: Bearer <ff_at>` when present;
     - `X-Cart-Token: <ff_cart>` **only when there is no access token, or when the path is `cart/merge/`**;
     - `Idempotency-Key` passthrough;
     - `X-Forwarded-For` from `getClientIp`.
  5. On `401 token_not_valid`, refresh once and retry once.
  6. If the response `data.tokens` has `access` and `refresh`, set `ff_at` (max-age = exp − now), `ff_rt` (max-age = exp − now, so the remember-me length is respected) and `ff_auth=1`. Then **delete `tokens` from the JSON** before returning.
  7. If the response is from `cart/*` without an access token and `data.token` is a non-empty string, set `ff_cart` (30 days). After a successful `cart/merge/`, delete `ff_cart`.
  8. For `account/auth/logout/`, inject `{ refresh: ff_rt }` into the body (keeping any `registration_id` the client sent). After `logout/`, `logout-all/`, or any response with code `user_inactive` or `user_not_found`, clear `ff_at`, `ff_rt` and `ff_auth`.
  9. Relay the status, JSON body and the `Retry-After` header. Never relay `Set-Cookie` from the API.

  **Allow-list.** GET and the listed writes:
  - `account/**` (except nothing)
  - `cart/**`
  - `order/**`
  - `payment/**` except `payment/gateway/callback/**`
  - `wallet/**`
  - `product/**`
  - `blog/**`
  - `pages/**`
  - `dashboard/**`
  - `notification/**`
  - `devices/**`
  - `contact-us/**`
  - `search/**`
  - `transportation/**`
  - `faq/**`
  - `homepage/` (GET)
  - `menu/**` (GET)
  - `linker/` (GET)
  - `global/**` (GET) except `global/feature-toggles/`

  The BFF does not go through redirects resolve, shortener, robots or sitemap.

- [ ] **Step 1: Write failing tests.**
  - `isExpiring` for a token with `exp = now + 10` is true; with `now + 600` it is false.
  - `isAllowed('GET', 'global/feature-toggles')` is false; `isAllowed('POST', 'payment/gateway/callback/zarinpal/x')` is false; `isAllowed('POST', 'cart/item/add')` is true.
  - The handler, with mocked fetch:
    - (a) a login response containing tokens produces a response whose body has no `tokens` key and whose `Set-Cookie` includes `ff_at` and `ff_rt` (httpOnly);
    - (b) a guest cart add response sets `ff_cart`;
    - (c) a 401 `token_not_valid` triggers exactly one refresh call and one retry;
    - (d) a POST without `X-Requested-With` returns 403;
    - (e) logout injects `refresh` and clears the cookies;
    - (f) a multipart request is forwarded with its boundary intact.
- [ ] **Step 2:** Run; FAIL. **Step 3:** Implement. **Step 4:** Run; PASS.
- [ ] **Step 5: Verify live** against `http://localhost:8000` with `pnpm dev`. A `curl` POST to `/api/bff/account/auth/login/` with the sara credentials (and `X-Requested-With: ff`) returns 200 with no `tokens` and sets the cookies. A follow-up GET `/api/bff/account/profile/me/` with the cookie jar returns sara's profile. Paste the outputs into the report.
- [ ] **Step 6:** Commit: `feat: BFF route with httpOnly session and cart cookies`.

### Task 7: Edge — `proxy.ts`, redirects, session refresh, forwarding, robots, short links, bank callback

**Files:**
- Create: `src/proxy.ts`, `src/lib/edge/redirects.ts`, `src/lib/edge/status-page.ts`, `src/app/robots.txt/route.ts`, `src/app/s/[code]/route.ts`, `src/app/api/v1/payment/gateway/callback/[gateway]/[token]/route.ts`
- Test: `tests/unit/edge/redirects.test.ts`, `tests/unit/edge/status-page.test.ts`, `tests/e2e/edge.spec.ts`

**Interfaces:**
- Consumes: `refreshAccess`, `isExpiring`, `COOKIE`, `cookieOptions` (Task 6), `getServerEnv`, `getClientIp`.
- Produces:
  - `ruleSpelling(pathname: string): string | null` (exactly the backend normalisation in `seo-cache-deploy.md` §4.4)
  - `knownSources(): Promise<Set<string>>` (in-memory, TTL 5 min, stale while refreshing)
  - `resolveRedirect(pathAndSearch: string): Promise<{ status: 301 | 302 | 410; target: string } | null>` (never cached; 1 s timeout; `null` on any failure)
  - `statusPage(status: number, title: string, message: string): Response` (small RTL HTML page with a link home, `Cache-Control: no-store`)

  **`proxy.ts` order of work:**
  1. **Forward** `/media/*`, `/static/*` and `/sitemap.xml` to `FIREFLY_API_URL` with `NextResponse.rewrite(new URL(pathname + search, apiUrl))`.
  2. Skip `_next`, `api`, `s/`, assets and prefetch requests.
  3. For GET and HEAD only, **resolve redirects** (only when `ruleSpelling` is in `knownSources()`), answering 301 or 302 with a `Location`, or a 410 `statusPage`.
  4. **Refresh the session.** If `ff_rt` exists and `ff_at` is missing or expiring, call `refreshAccess`.
     - On success, set the new `ff_at` on the response and on the forwarded request cookies (`NextResponse.next({ request: { headers } })`), so Server Components read it.
     - On `invalid` or `inactive`, delete `ff_at`, `ff_rt` and `ff_auth`.
     - On `network`, leave the cookies alone.
  - Matcher: everything except `_next/static`, `_next/image`, `favicon.ico`, `icons/` and files with an extension other than `.xml`.
- **Route handlers:**
  - `robots.txt`: `GET robots/?format=txt` with `revalidate: 300`. Return the body byte-exact as `text/plain; charset=utf-8`. If the API fails, return `User-agent: *\nDisallow:\n`.
  - `s/[code]`: as `seo-cache-deploy.md` §5.2. Always 302, never 301, never cached; 404 and 410 use `statusPage` with the Persian copy from the digest. Also set `skipTrailingSlashRedirect`? No: keep `trailingSlash: true` and accept the one 308 hop.
  - Bank callback: accept GET and POST and forward to `${apiUrl}/api/v1/payment/gateway/callback/${gateway}/${token}/`, with the original query, the raw body, `Content-Type`, `X-Forwarded-For` and `redirect: 'manual'`. Relay status and `Location` unchanged. No API key is needed.

- [ ] **Step 1: Write failing unit tests.**
  - `ruleSpelling('/product//old/')` → `'/product/old'`.
  - `ruleSpelling('/a%2Fb')` → `null`.
  - `ruleSpelling('/page/abc%ZZ/')` → `null`.
  - `ruleSpelling('/blog/%DA%A9/')` → `'/blog/ک'`.
  - `ruleSpelling('/')` → `'/'`.
  - `statusPage(410, …)` has status 410, an HTML content type, and contains `dir="rtl"`.
- [ ] **Step 2:** FAIL. **Step 3:** Implement. **Step 4:** PASS.
- [ ] **Step 5: Write e2e `tests/e2e/edge.spec.ts`** (desktop project only), against the dev backend:
  - `GET /festival/` → 302 to `/product-category/digital/mobile-phone/`.
  - `GET /product/nokia-3310-classic/` → 410.
  - `GET /product/samsung-galaxy-s23-ultra/?utm_source=sms` → 301 with `utm_source=sms` kept.
  - `GET /robots.txt` → 200 `text/plain` containing `Sitemap:`.
  - `GET /sitemap.xml` → 200 XML containing `<urlset`.
  - `GET /s/phone-fest/` → 302 to a URL ending in `/product/list/flagship-phones/`.
  - `GET /s/nope-404/` → 404 HTML.
  - `POST /api/v1/payment/gateway/callback/zarinpal/unknowntoken123/` → 302 whose `Location` contains `result=failed`.
  - A `/media/` URL taken from `/api/v1/global/settings/` `logo` → 200 image.

  Run `pnpm test:e2e --project=desktop tests/e2e/edge.spec.ts`; expect PASS.
- [ ] **Step 6:** Commit: `feat: proxy redirects, session refresh, edge forwards, robots and short links`.

### Task 8: Global data loaders, interface dictionary and snippets

**Files:**
- Create: `src/lib/api/types/settings.ts`, `src/features/settings/api.ts`, `src/lib/i18n/fa.ts`, `src/lib/i18n/translator.ts`, `src/lib/snippets/parse.ts`
- Test: `tests/unit/settings/api.test.ts`, `tests/unit/i18n/translator.test.ts`, `tests/unit/snippets/parse.test.ts`

**Interfaces:**
- Consumes: `apiFetch`, `ApiError`, `Paginated`, `FeatureKey`.
- Produces. Types follow `auth-settings.md` and `content.md`:
  - `SiteSettings` (every field of `GET global/settings/` including `auth: AuthSettings`)
  - `AuthSettings`
  - `FeatureState { key: FeatureKey; name: string; enabled: boolean; reason: string | null }`
  - `MenuNode` (union by `link_type`), `MenuKey = 'main' | 'header' | 'footer' | 'blog-sidebar'`
  - `Social { id; name; username_or_id; logo; link }`
  - `Snippet { id; description; position: 'in_head' | 'top_of_body' | 'bottom_of_body' | string; type; snippet }`
  - `CategoryNode` (from `product/category/list/` with built `children`; see `product.md` §3.2)
- Loaders (all `server-only`, wrapped in React `cache()`, **none throws**):
  - `getSiteSettings(): Promise<SiteSettings | null>` (revalidate 300, tag `settings`)
  - `getFeatureStatus(): Promise<Record<FeatureKey, FeatureState>>` (revalidate 60, tag `features`; missing keys default to enabled)
  - `getMenu(key: MenuKey): Promise<MenuNode[]>` (revalidate 300, tag `menu:<key>`; `[]` on `menu_not_found` or any failure)
  - `getSocials(): Promise<Social[]>` (300)
  - `getSnippets(): Promise<Snippet[]>` (300)
  - `getTranslations(): Promise<Record<string, string>>` (300; from `global/get-translation/fa/`, falling back to `languages/` with the `fa` entry; `{}` on failure)
  - `getCategoryTree(): Promise<CategoryNode[]>` (300; reads all pages with `limit=100`)
- Dictionary and translator:
  - `fa: Record<string, string>` is the default interface dictionary, flat `snake_case` keys. It includes at least `currency: 'تومان'`, `add_to_cart: 'افزودن به سبد خرید'`, `search_placeholder: 'جستجو در محصولات…'`, `login_register: 'ورود | ثبت‌نام'`, `cart: 'سبد خرید'`, `categories: 'دسته‌بندی‌ها'`, `home: 'خانه'`, `account: 'حساب من'`, `see_all: 'مشاهدهٔ همه'`, `not_found_title: 'صفحه‌ای که دنبالش بودید پیدا نشد'`, `retry: 'تلاش دوباره'`. Later plans add keys here.
  - `createTranslator(overrides: Record<string, string>): (key: string, vars?: Record<string, string | number>) => string`. Overrides win. `{name}` placeholders are replaced and numbers are formatted with Persian digits. An unknown key returns the key and warns once in dev.
- `parseSnippet(html: string): SnippetNode[]`, where `type SnippetNode = { tag: 'script'; src?: string; inline?: string; attrs: Record<string, string> } | { tag: 'noscript' | 'style'; inline: string } | { tag: 'meta' | 'link'; attrs: Record<string, string> } | { tag: 'html'; inline: string }`. HTML comments are dropped; anything else becomes `html`.

- [ ] **Step 1: Write failing tests.**
  - With `fetch` rejecting, `getSiteSettings()` resolves `null` and `getMenu('main')` resolves `[]`.
  - `getFeatureStatus()` maps the paginated results and defaults a missing `wallet` to enabled.
  - The translator applies an override (`add_to_cart` → custom) and interpolates `{count}` with Persian digits.
  - `parseSnippet` on the two dev fixtures (in `content.md` and the live `/global/extra-snippets/`) returns one inline script each, with comments dropped; `<script async src="https://x/y.js"></script>` gives `src` and `attrs.async`.
- [ ] **Step 2:** FAIL. **Step 3:** Implement. **Step 4:** PASS.
- [ ] **Step 5:** Commit: `feat: global settings, menus, features, translations and snippet loaders`.

### Task 9: UI primitives — controls and display

**Files:**
- Create (in `src/components/ui/`): `cn.ts` (clsx + tailwind-merge), `button.tsx`, `icon-button.tsx`, `input.tsx`, `textarea.tsx`, `select.tsx` (native, styled), `checkbox.tsx`, `radio-group.tsx`, `switch.tsx`, `field.tsx` (label, hint, error, `aria-describedby` wiring), `badge.tsx`, `chip.tsx`, `card.tsx`, `skeleton.tsx`, `spinner.tsx`, `price.tsx`, `rating.tsx`, `quantity-stepper.tsx`, `empty-state.tsx`, `pagination.tsx`, `smart-image.tsx`, `countdown.tsx`, `otp-input.tsx`, `visually-hidden.tsx`
- Create: `src/app/dev/ui/page.tsx` (showcase; `notFound()` when `NODE_ENV === 'production'`)
- Test: `tests/unit/ui/*.test.tsx`

**Interfaces** (all components forward `className` and are RTL-correct, using logical properties `ms/me/ps/pe/start/end`):
- `Button({ variant: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger' | 'link' = 'primary', size: 'sm' | 'md' | 'lg' = 'md', loading?, fullWidth?, asChild?, iconStart?, iconEnd? })`. `md` height is 44 px. `loading` disables the button, shows a spinner and sets `aria-busy`. `asChild` uses Radix `Slot`.
- `Field({ label, hint?, error?, required?, children })`, which injects `id`, `aria-invalid` and `aria-describedby` into its single child.
- `Input` and `Textarea` support `dir="ltr"` for email, phone and code fields, with start or end adornments.
- `Price({ amount: number | null, original?: number | null, discountPercent?: number, size?: 'sm' | 'md' | 'lg' })`:
  - shows `formatToman`;
  - when `original > amount`, adds a struck-through original and a sale percent pill;
  - `amount === null` renders «ناموجود» muted.
- `Rating({ value: number, count?: number, size? })` uses fractional star fill and an `aria-label` of «امتیاز ۴٫۵ از ۵».
- `QuantityStepper({ value, min = 1, max?: number | null /* 0 or null means unlimited */, onChange, loading?, size? })`:
  - at `min`, the minus button becomes a trash icon calling `onRemove?`;
  - plus is disabled at `max`;
  - uses Persian digits.
- `SmartImage` wraps `next/image`:
  - fallback to `/images/placeholder.svg` on error;
  - `ratio` prop applies `aspect-ratio` (product images are always square: `ratio="1/1"`);
  - images from hosts outside the allow-list render `unoptimized`.
- `Countdown({ endsAt: string | number, onEnd? })` shows `hh:mm:ss` (days when over 24 h) in Persian digits, updates every second, and is `aria-live="off"`.
- `OtpInput({ length = 6, value, onChange, onComplete, autoFocus })`:
  - one box per digit, LTR order;
  - accepts Persian digits and paste;
  - `autocomplete="one-time-code"` and `inputMode="numeric"`.
- `Pagination({ page, totalPages, hrefFor: (p: number) => string })` renders real links with `rel="prev"`/`rel="next"`, compact on mobile.
- `EmptyState({ icon, title, description?, action? })`.

- [ ] **Step 1: Write failing tests.**
  - `Button` with `loading` is disabled and has `aria-busy="true"`.
  - `Price` with `amount=900000, original=1000000, discountPercent=10` shows `۹۰۰٬۰۰۰ تومان`, `۱٬۰۰۰٬۰۰۰` and `۱۰٪`.
  - `QuantityStepper` with `max=2, value=2` disables plus.
  - `OtpInput` paste of `'۱۲۳۴۵۶'` calls `onComplete('123456')`.
  - `Pagination` page 2 of 5 renders links to pages 1 and 3 with `rel` attributes.
  - `Field` with `error` wires `aria-invalid` and `aria-describedby`.
- [ ] **Step 2:** FAIL. **Step 3:** Implement with Tailwind tokens from Task 3 only (no raw hex values). **Step 4:** PASS.
- [ ] **Step 5:** Run `pnpm dev`, open `/dev/ui/` at 375 px and 1440 px with Playwright, take screenshots into the report directory, and look at them. Every control must be legible, aligned and RTL-correct.
- [ ] **Step 6:** Commit: `feat: design-system controls and display primitives`.

### Task 10: UI primitives — overlays and navigation

**Files:**
- Create (in `src/components/ui/`): `dialog.tsx` (Radix), `sheet.tsx` (Vaul bottom sheet below `md`, side drawer at `md` and up, via `useMediaQuery`), `drawer.tsx` (side drawer, start side), `popover.tsx`, `dropdown-menu.tsx`, `tabs.tsx`, `accordion.tsx`, `tooltip.tsx`, `toaster.tsx` (Sonner, RTL, `position="top-center"`, rich colours), `carousel.tsx` (Embla, `direction: 'rtl'`, arrows, dots, optional autoplay with pause on hover and focus), `scroll-area.tsx`, `use-media-query.ts`
- Modify: `src/app/dev/ui/page.tsx`
- Test: `tests/unit/ui/overlays.test.tsx`

**Interfaces:**
- `Sheet({ open, onOpenChange, title, description?, children, footer? })`. The title is always rendered (visually hidden allowed) for accessibility.
- `Carousel({ children, slidesPerView?: { base: number; md?: number; lg?: number }, loop?: boolean, autoplayMs?: number, ariaLabel: string, showArrows?: boolean, showDots?: boolean })`. Arrow buttons are 44 px and RTL-correct (next is on the left).
- `toast` is re-exported from Sonner as `notify.success/error/info(message, opts?)`.

- [ ] **Step 1: Write failing tests.**
  - `Dialog` opens on trigger click, traps focus, and Escape closes it.
  - `Tabs` switch panels with the arrow keys.
  - `Accordion` toggles `aria-expanded`.
  - `Carousel` renders `aria-roledescription="carousel"` and the label.
- [ ] **Step 2:** FAIL. **Step 3:** Implement. Animations use Motion or CSS with `motion-safe:` variants. **Step 4:** PASS.
- [ ] **Step 5:** Take showcase screenshots at 375 and 1440 px with each overlay open, and review them.
- [ ] **Step 6:** Commit: `feat: design-system overlays, tabs, accordion, carousel and toasts`.

### Task 11: Root layout, providers and feature context

**Files:**
- Create: `src/app/providers.tsx`, `src/features/settings/feature-context.tsx`, `src/lib/i18n/i18n-context.tsx`, `src/lib/config-context.tsx`, `src/lib/session/session-context.tsx`, `src/features/settings/snippets.tsx`
- Modify: `src/app/layout.tsx`
- Test: `tests/unit/settings/feature-context.test.tsx`, `tests/unit/layout/snippets.test.tsx`

**Interfaces:**
- Consumes: the loaders (Task 8), `getStoreConfig`, `toPublicConfig`, `buildThemeCss`, `createTranslator`.
- Produces:
  - `useFeature(key: FeatureKey): { enabled: boolean; reason: string | null }`
  - `markFeatureDisabled(key: FeatureKey, reason: string)`, called by client error handling on `503 feature_disabled`
  - `useT()` returning the translator
  - `useStoreConfig(): PublicStoreConfig`
  - `useSession(): { hasSession: boolean }` (initial value from the `ff_auth` cookie, which the server reads in the layout)
  - `<Snippets position="in_head" | "top_of_body" | "bottom_of_body" />` (Server Component rendering parsed nodes)
  - `QueryClient` defaults:
    - `staleTime: 30_000`;
    - `retry`: never retry `ApiError` with status < 500 or `isFeatureDisabled()`, otherwise at most 2 times;
    - `refetchOnWindowFocus: false`.
- Root `layout.tsx`:
  - `lang="fa" dir="rtl"`, font variable class, theme `<style>`;
  - `generateMetadata`:
    - `metadataBase: SITE_URL`;
    - `title.template: '%s | <store name>'` and default `<store name> | <slogan>`;
    - description `slogan`, icons `favicon`, `manifest: '/manifest.webmanifest'` (added in a later plan), `formatDetection: { telephone: false }`;
  - `viewport` `themeColor: theme.primary`;
  - providers;
  - snippets in head, body start and body end.
  - It must render when `getSiteSettings()` returns `null`, with the name falling back to `presetLabel`.

- [ ] **Step 1: Write failing tests.**
  - `useFeature('coupons')` reflects the initial map.
  - After `markFeatureDisabled('coupons', 'x')`, it returns `enabled: false`.
  - `<Snippets>` renders a `<script>` for an inline snippet.
- [ ] **Step 2:** FAIL. **Step 3:** Implement. **Step 4:** PASS, plus `pnpm build`.
- [ ] **Step 5:** Commit: `feat: root layout with runtime theme, providers, metadata and snippets`.

### Task 12: Header, mega-menu, mobile navigation and announcement bar

**Files:**
- Create (in `src/components/layout/`): `site-header.tsx` (server), `header-search-form.tsx` (client; plain GET form to `/search/` with `q`; Plan 2 upgrades it to suggestions), `header-actions.tsx` (client; account entry, cart link with badge slot `cartCount?: number`), `mega-menu.tsx` (client; desktop hover and focus menu from `MenuNode[]`, falling back to the category tree when the `main` menu is empty), `header-links.tsx` (from `menu/header`), `mobile-bottom-nav.tsx` (client; home, categories, cart, account; active state; hidden on `/checkout/`), `categories-browser.tsx` (client; full-screen two-pane category browser for mobile, used by the bottom-nav "categories" tab and the route `/categories/`), `announcement-bar.tsx` (client; dismiss stored in `sessionStorage`), `menu-link.tsx` (renders a `MenuNode` as `Link`, `<a>` or `<span>` per `content.md` §5.4)
- Create: `src/app/(shop)/layout.tsx`, `src/app/(shop)/categories/page.tsx`
- Test: `tests/unit/layout/menu-link.test.tsx`, `tests/unit/layout/mega-menu.test.tsx`, `tests/e2e/shell.spec.ts`

**Interfaces:**
- `MenuLink({ node: MenuNode, className?, onNavigate? })`
- `SiteHeader()` reads `getSiteSettings`, `getMenu('main')`, `getMenu('header')` and `getCategoryTree`.

**Design** (the spec's §7 principles apply):
- Desktop (`lg` and up):
  - row 1: logo (start), search (centre, wide, rounded, 48 px), account and cart (end);
  - row 2: "دسته‌بندی‌ها" mega-menu trigger with an icon, header links, and a phone number with icon at the end;
  - the header becomes compact on scroll down and reappears on scroll up (CSS plus a small hook; no layout shift).
- Mobile:
  - top bar with logo and a cart icon;
  - a full-width search field under it;
  - bottom navigation fixed with safe-area inset padding; the active tab is brand-coloured with a filled icon;
  - the bottom nav hides on scroll down and shows on scroll up.
- Mega-menu:
  - first column lists top-level items;
  - hovering or focusing shows their children in columns with icons;
  - opens with a 120 ms delay;
  - closes on Escape, on outside click, or on route change;
  - keyboard: arrows move, Enter follows.
- Every link uses `MenuLink`.

- [ ] **Step 1: Write failing tests.**
  - `MenuLink` renders a `<span>` for `link_type: 'none'`, a Next `Link` for `/product/x/`, and `<a target="_blank" rel="noopener">` for `open_in_new_tab`.
  - `MegaMenu` with an empty `main` menu renders the category tree roots.
- [ ] **Step 2:** FAIL. **Step 3:** Implement. **Step 4:** PASS.
- [ ] **Step 5: Write `tests/e2e/shell.spec.ts`** (all three projects):
  - the home page shows the store logo with alt equal to the store name from the backend («فایرفلای»);
  - desktop: the mega-menu opens and shows «کالای دیجیتال»;
  - mobile: the bottom navigation is visible and the categories tab opens the browser;
  - the announcement text from settings is visible and dismissible.

  Run it; expect PASS. Save screenshots of the header at 375, 768 and 1440 px and review them.
- [ ] **Step 6:** Commit: `feat: responsive header, mega-menu, mobile bottom navigation and announcement`.

### Task 13: Footer, breadcrumbs and system pages

**Files:**
- Create (in `src/components/layout/`): `site-footer.tsx` (server), `footer-menu.tsx`, `contact-block.tsx`, `social-links.tsx`, `app-badges.tsx`, `breadcrumbs.tsx` (visual only; JSON-LD comes in later plans), `back-to-top.tsx`
- Create: `src/app/not-found.tsx`, `src/app/error.tsx`, `src/app/global-error.tsx`, `src/app/(shop)/loading.tsx`, `public/images/placeholder.svg`, `public/images/not-found.svg`
- Test: `tests/unit/layout/footer.test.tsx`, `tests/e2e/system-pages.spec.ts`

**Interfaces:**
- `Breadcrumbs({ items: { name: string; href?: string }[] })` renders a home icon first, chevrons pointing left, and the last item as `aria-current="page"`. It is horizontally scrollable on mobile.

**Footer content:**
- `menu/footer`: top-level items with children become columns;
- the contact block: phone(s) as `tel:` links, email, address, response time;
- socials (logo images, `rel="noopener"`);
- app download badges (only non-null links);
- `footer` text: sanitised operator HTML, relative `/media` made absolute;
- copyright;
- the `bottom_of_body` snippets area where trust seals usually go.

Mobile shows the columns as an accordion.

**System pages:**
- `not-found.tsx`: illustration, «صفحه‌ای که دنبالش بودید پیدا نشد», a search form, links home and to categories, and HTTP 404.
- `error.tsx`: friendly Persian message, «تلاش دوباره» (reset), link home.
- `global-error.tsx`: a minimal HTML document with the same message.

- [ ] **Step 1: Write failing tests.** The footer renders column headings from a `none` node with children, `tel:` links for `phone` and `phone2`, and hides app badges whose links are `null`.
- [ ] **Step 2:** FAIL. **Step 3:** Implement. Add an HTML sanitiser for operator HTML: `src/lib/html/sanitize.ts` with `sanitizeOperatorHtml(html: string, apiUrl: string): string`. It allows basic formatting, links and images; removes scripts, event handlers and `javascript:` URLs; and makes `/media` absolute. Test it in `tests/unit/html/sanitize.test.ts`. **Step 4:** PASS.
- [ ] **Step 5: e2e.**
  - `/this-does-not-exist/` returns 404 and shows the not-found heading.
  - The footer shows «قوانین و مقررات» from the footer menu.
- [ ] **Step 6:** Commit: `feat: footer, breadcrumbs, not-found and error pages`.

### Task 14: Docker, documentation and the foundation e2e gate

**Files:**
- Create: `Dockerfile`, `.dockerignore`, `deploy/nginx.conf.example`, `.github/workflows/ci.yml` (on push and PR to `main`: pnpm install, `typecheck`, `lint`, `format:check`, `test`, `build`; Node 22; pnpm cache), `docs/ARCHITECTURE.md`, `docs/CUSTOMIZATION.md`, `docs/DEPLOYMENT.md`
- Modify: `README.md`

**Interfaces:** none (packaging and docs).

- [ ] **Step 1: Dockerfile.**
  - Multi-stage on `node:22-alpine`: deps (pnpm via corepack, `pnpm install --frozen-lockfile`), build (`ARG FIREFLY_API_URL`, `NEXT_TELEMETRY_DISABLED=1`, `pnpm build`), and a runner (non-root user, copy `.next/standalone`, `.next/static` and `public`, `PORT=3000`, `HOSTNAME=0.0.0.0`, `CMD ["node", "server.js"]`).
  - Healthcheck: `wget -qO- http://127.0.0.1:3000/robots.txt`.
- [ ] **Step 2: nginx example.**
  - TLS placeholders, `proxy_set_header Host $host`, `X-Real-IP $remote_addr` and `X-Forwarded-For $proxy_add_x_forwarded_for`;
  - gzip and brotli;
  - `location /_next/static/ { expires 1y; add_header Cache-Control "public, immutable"; }`;
  - `client_max_body_size 6m` (receipt and avatar uploads).
- [ ] **Step 3: Documentation.**
  - `docs/DEPLOYMENT.md` (Persian): every env var (runtime vs build-time); the backend settings each shop must set (`STOREFRONT_URL`, `SITE_DOMAIN`, `TRUSTED_PROXY_IPS`, `GATEWAY_RESULT_URL_ALLOWED_HOSTS`, the panel result URL `https://<shop>/payment/callback/`, and an API key); topology diagrams; and an upgrade checklist.
  - `docs/CUSTOMIZATION.md` (Persian): presets, theme variables, font replacement, the dictionary keys the operator can override through the backend translations, and what is managed from the panel versus env.
  - `docs/ARCHITECTURE.md` (English): layers, BFF, cookies, caching table and folder conventions.
  - `README.md` (Persian, with an English summary): quick start, scripts and links.
- [ ] **Step 4: Gate.**
  - `pnpm typecheck && pnpm lint && pnpm test && pnpm build` all pass;
  - `docker build --build-arg FIREFLY_API_URL=http://localhost:8000 -t firefly-front .` succeeds, if Docker is available (otherwise note that it was skipped in the report);
  - `pnpm test:e2e` passes on all projects.
- [ ] **Step 5:** Commit: `chore: Docker image, nginx example and project documentation`. Push to `origin main`.
