# Plan 3 — Authentication and Account Core — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Customers can register, log in (password, one-time code, Google, with the 2FA step), recover their password, and manage their account. The account covers the dashboard, profile and security, addresses with a map, wishlist, my comments and notifications (with optional web push). The guest cart is merged after login.

**Architecture:** Auth pages are client forms driven entirely by `auth-settings` and `feature-status`, posting through the BFF, which stores tokens in httpOnly cookies and strips them from responses. The account area is an auth-guarded route group. The layout checks the session server-side and redirects to `/login/?next=…`. Pages are client components using TanStack Query over the BFF, with skeletons. Sidebar badges come from one `dashboard/summary/` query.

**Tech Stack:** As before. New dependencies: `leaflet` and `react-leaflet` (map picker; Neshan tiles when keyed, OpenStreetMap otherwise), `@types/leaflet`. Google Identity Services is loaded with `next/script` only when Google login is enabled. Firebase (`firebase`) is loaded only when the web-push config is present (dynamic import).

**Spec:** `docs/superpowers/specs/2026-10-15-storefront-design.md` (§8.9, §8.10, §8.12 web push). API contracts: `docs/backend-integration/auth-settings.md` (§2–§6, §10.1), `cart-address.md` (§3.11 merge, §7 address book, §8 geography), `blog-faq-dashboard-notification.md` (§3 dashboard, §4 notifications and devices), `product.md` (§3.15 wishlist).

## Global Constraints

Everything in Plans 1–2's Global Constraints, plus:

- Forms are built **only** from `auth` (in `global/settings/`) and feature `registration`. Never assume SMS, Telegram or Google exist.
- A 200 with `requires_totp: true` is not a login. The next step re-sends the same body plus `totp_code`.
- OTP inputs normalise Persian and Arabic digits. Countdowns use the API's `expires_in` and `resend_after`; nothing is hard-coded.
- Error text is `data.errors[].detail`, with branching on `code`. `auth_identifier_invalid` (with `attr: null`) is shown under the identifier field.
- After any successful login: call `POST cart/merge/` once (the BFF sends the guest cart token for this path only), show any `adjustments`, invalidate the `['cart']`, `['me']` and `['summary']` queries, and navigate to `next` (same-origin paths only) or `/account/`.
- Account pages are `noindex` and never cached.
- Badges come from `dashboard/summary/`. Re-read it after any write that changes a counter.
- Identifiers in lists: my comments are keyed by `subject_type + id`.
- Persian copy everywhere. Persian phone display through `formatIranMobile`.

## Review Focus

1. **A login that needs 2FA.** The UI must switch to the TOTP step without losing the identifier or password, and must re-send `otp_code` for OTP login. Tests in Task 2.
2. **An OTP send that fails (503 `auth_otp_send_failed`, or 429 with `retry_after`).** The form shows the detail, disables resend for `retry_after` seconds, and stays usable. Tests in Task 1 (`useCountdown`) and Task 3.
3. **An open-redirect via `next`.** `/login/?next=https://evil.com` or `//evil.com` must fall back to `/account/`. Test in Task 1 (`safeNext`).
4. **The session expires while on an account page.** The BFF refresh fails, so the UI goes to login with `next` preserved, and there is no infinite loop. Test in Task 5 (the guard) and the e2e in Task 10.
5. **The address form with Persian digits, an invalid mobile, or a province change.** Digits are normalised, the city resets when the province changes, and field errors map from `attr`. Tests in Task 7.

---

## File map (this plan)

```
src/lib/api/types/account.ts        # UserProfile, AuthenticatedResponse, OtpSent, …, Address, Province, City, DashboardSummary, NotificationItem, MyComment
src/features/auth/                  # api.ts, hooks.ts, safe-next.ts, use-countdown.ts, components/*
src/app/(auth)/layout.tsx           # minimal centred layout, logo, back link
src/app/(auth)/login/page.tsx, register/page.tsx, forgot-password/page.tsx
src/features/account/               # layout/*, dashboard/*, profile/*, security/*, addresses/*, wishlist/*, comments/*, notifications/*
src/features/geo/                   # provinces/cities hooks, map-picker.tsx
src/features/push/                  # firebase.ts, use-web-push.ts, sw additions
src/app/account/layout.tsx, page.tsx, profile/, addresses/, wishlist/, comments/, notifications/
tests/unit/** , tests/e2e/account/**
```

---

### Task 1: Auth types, client API, helpers

**Files:**
- Create: `src/lib/api/types/account.ts`, `src/features/auth/api.ts`, `src/features/auth/safe-next.ts`, `src/features/auth/use-countdown.ts`, `src/features/auth/use-auth-settings.ts`, `src/features/auth/use-me.ts`
- Test: `tests/unit/auth/safe-next.test.ts`, `tests/unit/auth/use-countdown.test.tsx`, `tests/unit/auth/api.test.ts`

**Interfaces:**
- Produces:
  - Types from `auth-settings.md` §3 (`UserProfile`, `AuthenticatedResponse` without `tokens`, since the BFF strips them, `OtpSent`, `RegistrationStarted`, `RegistrationVerified`, `PasswordResetToken`, `TotpSetup`, `TotpStatus`, `ContactType`, `OtpMethod`).
  - `authApi.*`, one function per endpoint in `auth-settings.md` §4, each returning the `data` type. For example, `authApi.login(body: { login_method: ContactType; login_identifier: string; password: string; remember_me: boolean; totp_code?: string }): Promise<AuthenticatedResponse>`.
  - `safeNext(next: string | null | undefined, fallback = '/account/'): string`. It accepts only a path starting with a single `/`, with no `//` and no backslash.
  - `useCountdown(seconds: number | null): { remaining: number; done: boolean; restart(seconds: number): void }`.
  - `useAuthSettings(): AuthSettings` (from the layout-provided settings context).
  - `useMe(): UseQueryResult<UserProfile | null>` (key `['me']`). It is disabled without a session; a 401 resolves `null`.
  - `identifierType(value: string): ContactType | null`. Email if it matches a simple email regex; phone if `normalizeIranMobile` is non-null.

- [ ] **Step 1: Write failing tests.**
  - `safeNext('https://evil.com')`, `safeNext('//evil.com')` and `safeNext('/\\evil')` all return `'/account/'`; `safeNext('/cart/')` returns `'/cart/'`.
  - The countdown decrements to 0 with fake timers and `done` becomes true.
  - `identifierType('۰۹۱۲۱۲۳۴۵۶۷')` is `'phone'` and `identifierType('a@b.co')` is `'email'`.
- [ ] **Step 2:** FAIL. **Step 3:** Implement. **Step 4:** PASS. **Step 5:** Commit: `feat: auth client API, types and helpers`.

### Task 2: Login page — password, one-time code, Google and the 2FA step

**Files:**
- Create: `src/app/(auth)/layout.tsx`, `src/app/(auth)/login/page.tsx`, and in `src/features/auth/components/`: `login-flow.tsx` (state machine), `identifier-step.tsx`, `password-step.tsx`, `otp-step.tsx`, `totp-step.tsx`, `google-button.tsx`, `auth-card.tsx`, `post-login.ts`
- Test: `tests/unit/auth/login-flow.test.tsx`

**Interfaces:**
- Produces:
  - `completeLogin(res: AuthenticatedResponse, next: string): Promise<void>`. It calls `POST cart/merge/`, shows adjustments in a toast when there are any, invalidates queries, and runs `router.replace(safeNext(next))`.
  - `LoginFlow` states: `identifier` → (`password` | `otp`) → `totp?` → done.

**UX:**
- One card. Step 1 asks «ایمیل یا شماره موبایل» with a single field; the type is detected automatically.
- Step 2 defaults to password, with a link «ورود با کد یکبار مصرف» when OTP is available for this identifier type.
- The password field has show/hide, «مرا به خاطر بسپار» (with the 7 versus 30 days help), and «فراموشی رمز عبور».
- The OTP step shows the channel choice (only channels valid for the identifier type, preselecting `default_otp_methods[type]`), six boxes, the countdown and «ارسال مجدد».
- The TOTP step offers six boxes for the authenticator code.
- A Google button sits above, with a divider «یا», only when enabled.
- `auth_user_not_found` gives a CTA to register with the identifier prefilled.
- Back buttons between steps keep the entered values.

- [ ] **Step 1: Write failing tests** (mock `authApi`):
  - A password login returning `requires_totp: true` moves to the TOTP step, and the next submit sends the same body plus `totp_code`.
  - An OTP login that requires TOTP re-sends `otp_code` and `totp_code`.
  - `auth_invalid_credentials` shows its detail under the password field.
- [ ] **Step 2:** FAIL. **Step 3:** Implement. Read `auth-settings.md` §4.5–4.8, §5 F2–F4 and §6. **Step 4:** PASS.
- [ ] **Step 5: Live check** with `pnpm dev`. Log in as `sara.ahmadi@example.com` / `Firefly@1234` in a Playwright script. Expect a redirect to `/account/` (which may 404 until Task 5) and the `ff_rt` cookie set. Put the output in the report.
- [ ] **Step 6:** Commit: `feat: login with password, one-time code, Google and 2FA step`.

### Task 3: Registration and password recovery

**Files:**
- Create: `src/app/(auth)/register/page.tsx`, `src/app/(auth)/forgot-password/page.tsx`, and in `src/features/auth/components/`: `register-flow.tsx`, `forgot-password-flow.tsx`, `password-strength.tsx`, `password-fields.tsx`
- Test: `tests/unit/auth/register-flow.test.tsx`, `tests/unit/auth/forgot-password-flow.test.tsx`

**Interfaces and behaviour:**
- Register flow (`auth-settings.md` §5 F1):
  - **start:** first name, last name, method tabs from `registration_methods`, the identifier, and the OTP channel when more than one is valid;
  - **verify:** six boxes, countdown, resend (channel switch allowed among compatible channels);
  - **complete:** password and confirmation with a strength hint. `auth_password_weak` lists the `reasons`.
  - Then `completeLogin`.
  - When the `registration` feature is off, show the operator's reason and a link to login.
  - `auth_email_already_exists` and `auth_phone_already_exists` offer a «ورود» CTA with the identifier prefilled.
- Forgot password (F7): identifier, then the channel when needed, then the OTP, then the new password. On success show a toast «رمز عبور تغییر کرد؛ دوباره وارد شوید» and redirect to `/login/` with the identifier prefilled.
- The terms text (`accept_terms_text`) is shown under the register submit as sanitised HTML.

- [ ] **Step 1: Write failing tests.**
  - The register flow with only `registration_methods: ['email']` renders no phone tab.
  - `start` → `verify` → `complete` calls the three endpoints with the stored `registration_token`.
  - A 429 on resend disables the button for `retry_after` seconds.
  - The forgot-password flow ends on `/login/`.
- [ ] **Step 2:** FAIL. **Step 3:** Implement. **Step 4:** PASS.
- [ ] **Step 5:** Commit: `feat: registration and password recovery flows`.

### Task 4: Header account menu and logout

**Files:**
- Create: `src/features/auth/components/account-menu.tsx`, `src/features/auth/use-logout.ts`
- Modify: `src/components/layout/header-actions.tsx`, `src/components/layout/mobile-bottom-nav.tsx`
- Test: `tests/unit/auth/account-menu.test.tsx`

**Interfaces:**
- `useLogout(): { logout(opts?: { all?: boolean }): Promise<void> }`. It calls `account/auth/logout/` (or `logout-all/`). If web push is active it first unregisters the device. On any outcome it clears the query cache and runs `router.replace('/')`.
- `AccountMenu`: without a session, a «ورود | ثبت‌نام» button linking to `/login/?next=<current>`. With a session, a dropdown with avatar or initials, full name, links to «پیشخوان», «سفارش‌ها», «علاقه‌مندی‌ها», «نشانی‌ها», «اعلان‌ها» (with unread dot) and «خروج».

- [ ] **Step 1: Write failing tests.** Guest sees the login link; signed-in sees the user's `full_name` from `useMe`; clicking «خروج» calls the logout API and navigates home.
- [ ] **Step 2:** FAIL. **Step 3:** Implement. **Step 4:** PASS. **Step 5:** Commit: `feat: header account menu and logout`.

### Task 5: Account shell and dashboard

**Files:**
- Create: `src/app/account/layout.tsx`, `src/app/account/page.tsx`, and in `src/features/account/`: `layout/account-nav.tsx` (desktop sidebar; on mobile the dashboard page lists the sections as a hub), `layout/account-header.tsx`, `dashboard/use-summary.ts`, `dashboard/summary-cards.tsx`, `dashboard/order-status-strip.tsx`, `dashboard/recent-purchases.tsx`, `dashboard/dashboard-banners.tsx`, `src/lib/api/types/dashboard.ts`
- Test: `tests/unit/account/account-nav.test.tsx`, `tests/unit/account/summary.test.tsx`

**Interfaces:**
- The account layout is a Server Component. If there is no `ff_rt` cookie it calls `redirect('/login/?next=' + encodeURIComponent(path))`. It renders the shop header and footer, plus a two-column account shell (nav at the start, content at the end) at `lg`.
- `useSummary(): UseQueryResult<DashboardSummary>` (key `['summary']`).
- `AccountNav` items, with badges from the summary:

  | label | route | badge |
  |---|---|---|
  | پیشخوان | `/account/` | — |
  | سفارش‌ها | `/account/orders/` | `orders.total` |
  | در انتظار دیدگاه | `/account/reviews/` | `awaiting_review_count` |
  | علاقه‌مندی‌ها | `/account/wishlist/` | `wishlist_count` |
  | لیست مطالعه | `/account/reading-list/` | `reading_list_count` |
  | دیدگاه‌های من | `/account/comments/` | `comment_count` |
  | نشانی‌ها | `/account/addresses/` | — |
  | کیف پول | `/account/wallet/` | balance in Toman |
  | اعلان‌ها | `/account/notifications/` | unread count |
  | اطلاعات حساب | `/account/profile/` | — |
  | خروج | — | — |

  Orders, awaiting review, reading list and wallet routes are built in Plans 4 and 5. Until then they render a «به‌زودی» placeholder page. This placeholder is removed by those plans.
- Dashboard:
  - a greeting with the name;
  - summary cards: wallet balance (frozen state note), order groups as a strip with icons and counts linking to `/account/orders/?group=<key>`, awaiting reviews, wishlist;
  - recent purchases (`dashboard/purchased-product/list/?limit=4`) as mini cards;
  - dashboard banners (public endpoint) as a carousel.
- Mobile: the dashboard doubles as the hub, with a list of the nav items as large tappable rows.

- [ ] **Step 1: Write failing tests.** `AccountNav` renders the badges from a summary fixture (`orders.total` 7 → «۷»); the dashboard renders all 5 order groups from `summary.orders.groups` in the given order with their labels.
- [ ] **Step 2:** FAIL. **Step 3:** Implement. **Step 4:** PASS.
- [ ] **Step 5:** Commit: `feat: account shell, navigation and dashboard`.

### Task 6: Profile and security

**Files:**
- Create in `src/features/account/profile/`: `profile-page.tsx`, `profile-form.tsx` (names), `avatar-upload.tsx` (multipart, up to 5 MB, preview), `contact-section.tsx` (email and phone add/change with OTP, per F9), `password-section.tsx` (F8), `two-factor-section.tsx` (F10: setup QR from `qr_code` data URL, secret copy, enable with a code, disable with a code), `sessions-section.tsx` (logout everywhere)
- Create: `src/app/account/profile/page.tsx`
- Test: `tests/unit/account/password-section.test.tsx`, `tests/unit/account/contact-section.test.tsx`

**Behaviour:**
- A password change returns new tokens. The BFF stores them (Plan 1 Task 6 behaviour covers `data.tokens`), and the UI shows a success toast only.
- `has_usable_password === false` shows «تعیین رمز عبور» without the current-password field.
- A contact request requires `password` and/or `totp_code` per `auth-settings.md` §4.17. Show those fields only when needed.
- After a contact verify, replace the `['me']` data with the response.

- [ ] **Step 1: Write failing tests.**
  - The password section hides «رمز فعلی» when `has_usable_password` is false.
  - The contact section shows «افزودن ایمیل» when `email` is null, and «تغییر» plus a verified badge otherwise.
- [ ] **Step 2:** FAIL. **Step 3:** Implement. **Step 4:** PASS. **Step 5:** Commit: `feat: profile, contact change, password and two-factor settings`.

### Task 7: Address book with map picker

**Files:**
- Create in `src/features/geo/`: `api.ts`, `use-provinces.ts`, `use-cities.ts`, `map-picker.tsx` (client only through `next/dynamic` with `ssr: false`; Leaflet; Neshan tiles `https://map.neshan.org/…` with `NESHAN_MAP_KEY` when the provider is `neshan`, otherwise the OSM standard tile layer with attribution; a draggable centre pin; «موقعیت من» via geolocation; returns `{ latitude, longitude }` rounded to 6 decimals)
- Create in `src/features/account/addresses/`: `address-list.tsx`, `address-card.tsx`, `address-form.tsx`, `address-sheet.tsx`, `use-addresses.ts`
- Create: `src/app/account/addresses/page.tsx`
- Test: `tests/unit/account/address-form.test.tsx`, `tests/unit/geo/use-cities.test.tsx`

**Interfaces:**
- `useAddresses()`, `useCreateAddress()`, `useUpdateAddress()`, `useDeleteAddress()` (204) and `useSetDefaultAddress()`. Every write invalidates `['addresses']` and `['cart']` (the destination may change).
- `AddressForm({ initial?: Address, onSaved(address: Address) })`:
  - fields per `cart-address.md` §7.2: title, receiver name and mobile, province, city, address line, plaque, unit, postal code (optional here), and the map;
  - normalises digits;
  - resets the city when the province changes;
  - maps `validation_error` attrs to fields and `address_*` codes to a form-level alert;
  - latitude and longitude are sent together or not at all.
- `AddressSheet`: the form in a `Sheet`. Plan 4's checkout reuses it.
- The list shows a default badge, «انتخاب به‌عنوان پیش‌فرض», edit and delete (with a confirm dialog).

- [ ] **Step 1: Write failing tests.**
  - The form normalises «۰۹۱۲۱۲۳۴۵۶۷» to Latin before submit.
  - Changing the province clears the city.
  - A backend `invalid_iranian_mobile` on `receiver_mobile` shows under that field.
  - Sending only latitude is impossible (both or neither).
- [ ] **Step 2:** FAIL. **Step 3:** Implement. Read `cart-address.md` §7–§8. **Step 4:** PASS.
- [ ] **Step 5:** Commit: `feat: address book with province, city and map picker`.

### Task 8: Wishlist and my comments pages

**Files:**
- Create: `src/app/account/wishlist/page.tsx`, `src/features/account/wishlist/wishlist-page.tsx`, `src/app/account/comments/page.tsx`, and in `src/features/account/comments/`: `comments-page.tsx`, `comment-row.tsx`
- Test: `tests/unit/account/comments.test.tsx`

**Behaviour:**
- Wishlist: a grid of product cards with remove and add-to-cart, sort (`added-desc` and `added-asc`), «فقط موجودها» (`in_stock=true`), and pagination. The empty state links to the home page.
- My comments:
  - tabs by `subject_type` (all, product, post, page) and a status filter per `blog-faq-dashboard-notification.md` §3.6;
  - each row shows the subject title with a link, a status pill (pending, approved, rejected with Persian labels from the API `*_display` fields), the text, and replies;
  - «حذف دیدگاه» calls `DELETE dashboard/comment/<subject_type>/<id>/delete/` (204) after confirming, then refetches the list and summary;
  - rows are keyed by `` `${subject_type}-${id}` ``.

- [ ] **Step 1: Write failing tests.** Comments with the same id but a different `subject_type` both render (no key collision); delete calls the right path.
- [ ] **Step 2:** FAIL. **Step 3:** Implement. **Step 4:** PASS. **Step 5:** Commit: `feat: wishlist and my comments account pages`.

### Task 9: Notifications inbox and optional web push

**Files:**
- Create in `src/features/notifications/`: `use-notifications.ts`, `notifications-page.tsx`, `notification-item.tsx`
- Create: `src/app/account/notifications/page.tsx`, `src/features/push/firebase.ts`, `src/features/push/use-web-push.ts`, `src/features/push/push-toggle.tsx`, `src/app/sw.js/route.ts`
  - This is the **single** service worker for the whole site (scope `/`), served with `Content-Type: application/javascript`, `Service-Worker-Allowed: /` and `Cache-Control: no-cache`.
  - It is built from `src/features/pwa/sw-source.ts`, with the Firebase config inlined from runtime env when present.
  - Plan 5 adds offline caching to the same file.
  - Firebase `getToken` receives this registration through `serviceWorkerRegistration`, so there is no separate `firebase-messaging-sw.js`.
- Test: `tests/unit/notifications/use-notifications.test.tsx`, `tests/unit/push/use-web-push.test.tsx`

**Behaviour:**
- Inbox: an infinite list (newest first). Unread items show a dot and bold title. Opening (expanding) an item marks it read (`POST notification/<id>/read/`). «علامت‌گذاری همه به‌عنوان خوانده‌شده» loops over the unread ids sequentially.
- The unread count is computed by fetching pages with `limit=100` until `next` is null. Polling is every 5 minutes while the tab is visible.
- Web push, only when `config.features.webPush`:
  - a toggle in the inbox header;
  - on enable, after a user gesture: `Notification.requestPermission()`, Firebase `getToken` with the VAPID key and the SW registration, then `POST devices/` with `{ registration_id, type: 'web', name: navigator.userAgent-based label }`;
  - re-POST on every load while enabled;
  - on disable or logout, `DELETE devices/unregister/` with a JSON body.
  - The SW route handles background messages and `notificationclick` (focus or open `/account/notifications/`).
  - Foreground messages show a toast and refresh the inbox.
  - Without Firebase config, nothing loads and the toggle is hidden.

- [ ] **Step 1: Write failing tests.**
  - The unread count sums across two mocked pages.
  - Mark-all calls the read endpoint once per unread id.
  - `useWebPush` reports `supported: false` when the config is null.
- [ ] **Step 2:** FAIL. **Step 3:** Implement. **Step 4:** PASS. **Step 5:** Commit: `feat: notification inbox and optional Firebase web push`.

### Task 10: Auth and account quality gate

**Files:**
- Create: `tests/e2e/account/auth.spec.ts`, `tests/e2e/account/account.spec.ts`

- [ ] **Step 1: e2e** (all projects; sara's account):
  - Log in with password and land on `/account/`. The greeting shows «سارا» and the order-group strip is visible.
  - A guest adds a product to the cart, logs in, and the cart badge still counts the item (merge).
  - Wishlist: heart a product on its page, then see it in `/account/wishlist/` and remove it.
  - Address: add an address (Tehran province, a city, a valid mobile and postal code), see it listed, set it default, then delete it.
  - Profile: the name fields are prefilled.
  - Logout: back to home, «ورود | ثبت‌نام» visible, and `/account/` redirects to `/login/?next=%2Faccount%2F`.
  - A wrong password shows the backend detail.
  - `/login/?next=//evil.com` → after login, lands on `/account/`.
- [ ] **Step 2:** Run `pnpm typecheck && pnpm lint && pnpm test && pnpm build && pnpm test:e2e`. All pass.
- [ ] **Step 3: Visual pass.** Screenshots of login (each step), register, dashboard, profile, addresses (with the sheet open) and notifications at 375, 768 and 1440 px. Review them and fix issues.
- [ ] **Step 4:** Commit: `test: auth and account e2e gate`. Push to `origin main`.
