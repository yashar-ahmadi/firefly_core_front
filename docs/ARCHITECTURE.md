# Architecture

The Firefly storefront is a Next.js 16 (App Router) application that renders a Persian, RTL,
light-only shop on top of the Firefly Core Django API. One deployment serves one shop: the
shop's identity, menus, content and switches come from the API at runtime, and its look comes
from runtime environment variables. Nothing about a particular shop is baked into the build.

Related documents: [DEPLOYMENT.md](DEPLOYMENT.md) and [CUSTOMIZATION.md](CUSTOMIZATION.md) (Persian,
for the shop owner), the design spec in
[superpowers/specs/2026-10-15-storefront-design.md](superpowers/specs/2026-10-15-storefront-design.md),
the API digests in [backend-integration/](backend-integration/) and
[BACKEND-ISSUES.md](BACKEND-ISSUES.md).

## Contents

- [Layers](#layers)
- [Request topology](#request-topology)
- [Configuration](#configuration)
- [Cookies and the session](#cookies-and-the-session)
- [Caching](#caching)
- [Rendering rules](#rendering-rules)
- [Performance](#performance)
- [Errors and degraded operation](#errors-and-degraded-operation)
- [Operator content: sanitised HTML versus snippets](#operator-content-sanitised-html-versus-snippets)
- [Payment credentials in URLs](#payment-credentials-in-urls)
- [Folder conventions](#folder-conventions)
- [Testing strategy](#testing-strategy)
- [Adding a page, a feature or a preset](#adding-a-page-a-feature-or-a-preset)

## Layers

```
 app/          routes only: thin pages, layouts, route handlers, metadata
   │  composes
 features/     one folder per domain: server loaders, components, hooks (settings, later catalog…)
 components/   ui/ design-system primitives · layout/ header, mega-menu, footer, breadcrumbs…
   │  use
 lib/          api transports and types, auth cookies/JWT, BFF, edge (redirects), html (sanitize,
               to-text, safe-url), format (digits, Toman, Jalali, phone), i18n, theme, snippets
 config/       env schema (zod), presets, store config resolution
```

- **Server Components by default.** `"use client"` only at interactive leaves (menus, carousels,
  dialogs, forms). Client Components must only `import type` from `@/config/store-config` and
  `@/config/env` (both are `server-only`); the browser gets the public config through context.
- **Pure versus server-only modules.** Logic that needs to be unit-tested without Next lives in pure
  modules (`env-schema.ts`, `resolve-store-config.ts`, `lib/snippets/parse.ts`, `lib/theme/*`); the
  memoised accessors that read `process.env` (`getServerEnv()`, `getStoreConfig()`) are
  `server-only` and are never called at module top level.
- **Providers** (`src/app/providers.tsx`, mounted once by the root layout): RTL direction, public
  store config, the settings' `auth` block (`useAuthSettings`; every method off without settings),
  i18n (operator overrides merged over `fa.ts`), session flag, feature switches,
  TanStack Query (30 s stale time, no retry on 4xx or `feature_disabled`) and the toaster, which
  loads Sonner with the first toast. Tooltips are not a provider: each `Tooltip` brings its own
  (group several with `TooltipProvider`), so pages without one do not load its code.

## Request topology

The browser never talks to the Firefly API. Every API call is made by the Next.js server, which
adds the server-only `FIREFLY_API_KEY`.

```
Browser ──► Next.js (storefront origin)
             ├─ proxy.ts (Node runtime, page requests)
             │    1. /media/*, /static/*, /sitemap.xml ──rewrite──► Firefly API (no cookies, no auth)
             │    2. skip _next, /api/*, /s/*, /icons/*, /healthz/, asset files
             │    3. GET/HEAD: redirect rules (redirects/resolve/) ──► 301 / 302 / 410 page
             │    4. access token expiring? refresh it (Set-Cookie + forwarded Cookie for this render)
             ├─ Server Components ──apiFetch──► Firefly API     (X-API-Key; cached anonymous reads)
             ├─ /api/bff/[...path] ──────────► Firefly API     (browser actions: cart, auth, account…)
             ├─ /api/v1/payment/gateway/callback/<gateway>/<token>/ ──► Django (GET+POST, body as is)
             ├─ /robots.txt (route handler, robots/?format=txt, byte for byte)
             ├─ /s/<code>   (route handler, short links, always a fresh 302)
             └─ /healthz/   (route handler: env valid → 200 "ok", else 503; no API call, no shell)
```

**Health.** `/healthz/` is the container `HEALTHCHECK` and load-balancer probe. It validates the
runtime environment (`getServerEnv()`, spec §6.2) and nothing else: 200 `ok`, or 503 `unhealthy`
(no detail in the response; the invalid variable names are logged once). It never calls the API or
loads the settings, so a backend outage never marks the storefront unhealthy (`/robots.txt`, which
does need the API, is the separate connectivity check). The check runs on the first probe rather
than in `instrumentation.ts`, so `next build` still needs no runtime variables. With
`trailingSlash: true`, `/healthz` without the slash is a 308 to `/healthz/`.

**Compression.** The nginx example clears `Accept-Encoding` towards the app, so the app answers
with identity bodies and nginx compresses each response once, with brotli or gzip (its types include
`text/x-component`, the RSC payload of client-side navigations). `next.config.ts` keeps
`compress: true`: Next gzips only when the request accepts it, which happens only when no proxy
strips the header, so a deployment without a compressing proxy is still gzipped.

**Security headers.** `next.config.ts` `headers()` (`src/config/security-headers.ts`) sends on every
response: `X-Frame-Options: SAMEORIGIN` and `Content-Security-Policy: frame-ancestors 'self'`
(clickjacking), `X-Content-Type-Options: nosniff` and `Referrer-Policy:
strict-origin-when-cross-origin`. The CSP has only that directive; a script/style policy needs
nonces (see «Operator content» below). Forwarded `/media/`, `/static/` and `/sitemap.xml` answers
keep the API's own values where it sets the same header, and `/_next/image` keeps Next's image
sandbox CSP. nginx adds only HSTS.

**Keep-alive.** The standalone server keeps idle keep-alive sockets for `KEEP_ALIVE_TIMEOUT` (65 s
in the image and in `start-standalone.mjs`), longer than nginx's upstream `keepalive_timeout`
(60 s), so nginx never reuses a socket Node has closed.

**Transports.** `apiFetch` (`@/lib/api/server`, server-only) and `bffFetch` (`@/lib/api/client`,
browser) share one contract: paths always end with `/`, the `{ msg, code, data }` envelope is
unwrapped, and every failure is an `ApiError { status, code, errors, detail, retryAfter, feature }`
(a non-JSON body such as a proxy's HTML 502 is `non_json_response`, a timeout or lost connection is
`status: 0, code: 'network_error'`). `apiFetch` defaults to a 10 s timeout (the shell loaders use
3.5 s, short links 3 s, redirect lookups 1 s) and `redirect: 'manual'` so the API key is never
re-sent to a redirect target. `apiPath` refuses `.`/`..` segments.

**BFF** (`src/app/api/bff/[...path]/route.ts`, logic in `src/lib/bff/`):

- forwards only allow-listed API roots (`lib/bff/allowlist.ts`); anything else is 404, so it is
  never an open proxy (redirect resolution, short links, robots, the sitemap and the bank callback
  are not reachable through it);
- requires `X-Requested-With: ff` on every method (a cross-site form or top-level navigation cannot
  add it) and, for writes, an `Origin` matching the request host or `SITE_URL`;
- adds `X-API-Key`, `Authorization: Bearer <ff_at>`, `X-Cart-Token: <ff_cart>` (for guests and the
  cart merge, never on key-only paths), `Idempotency-Key` (passed through) and `X-Forwarded-For` (the visitor IP from
  `CLIENT_IP_HEADER`);
- refreshes the access token once (before the call when it is expiring, or after a
  `401 token_not_valid`/`authentication_failed`) and retries once; a refresh that fails
  transiently (5xx, 429, no answer) keeps the cookies and, where the call would go without a usable
  bearer or its 401 would be relayed, answers a retryable `503 session_refresh_unavailable` (with
  `Retry-After` when the API said when) instead of a 401 that would end a live session; a
  streamed upload, which cannot be replayed, answers `503 upload_retry` after a successful
  refresh (the new access cookie set) so the page sends it again;
- moves `data.tokens` (auth responses) and `data.token` (cart responses) into httpOnly cookies and
  strips them from the body the browser sees; clears the session on logout, `user_inactive` or
  `user_not_found`, and drops the cart cookie after a merge or `cart_not_found`;
- caps JSON bodies at 2.5 MB and streams multipart uploads up to 6 MB (413 beyond);
- answers with the API's status, envelope and `Retry-After`, never with its cookies, and always
  `Cache-Control: no-store`;
- answers a guest's `GET cart/` from a shared in-memory copy of the API's empty cart
  (`lib/bff/guest-cart.ts`). The header badge asks for the cart on every page view, and without the
  copy these reads were 44% of all API calls (each charged to the guest's per-IP budget). The
  shortcut applies only to a `GET` of exactly `cart/` with no query string and none of `ff_cart`,
  `ff_at`, `ff_rt` or `ff_auth` (present at all, even malformed), decided before any refresh step.
  The copy is filled by one single-flight call with no `X-Cart-Token`, no bearer and no visitor
  IP, and kept for 60 s (per server process). Only a `200` whose `data` has `is_empty: true`,
  `item_count: 0`, no lines and an empty or missing `token` is stored, as a string stripped by the
  same `captureSession` as every cart answer; any other answer or failure is never stored and the
  request is proxied as usual. After such a fill no new fill is tried for 10 s: those requests are
  simply proxied, so a struggling API is not asked twice per guest read. The response keeps
  `Cache-Control: no-store`, sets no cookie and is
  byte-for-byte the body the proxied read would give. Cost: the empty-cart shape may be up to 60 s
  stale;
- sends exactly three payment calls without the session when asked with `?anon=1`:
  `GET payment/<uuid>/status/`, `GET payment/<uuid>/card-transfer/` (the cards) and
  `POST payment/<uuid>/card-transfer/receipt/` (multipart, still streamed under the 6 MiB cap).
  They go with no bearer, no cart token, no refresh and no cookie change, and without the flag
  (`lib/bff/anonymous.ts`). The API refuses a signed-in visitor another account's payment (403
  `payment_forbidden`) but answers the same call made anonymously (order digest §11 #7); the
  result and card-transfer pages retry with the flag after that 403 (and from then on), and treat
  a payment answered only that way as not this account's (`foreign`). On any other path the flag
  is an ordinary query parameter (forwarded, the session attached). Being answered with the
  session is not ownership either: a guest order's payment has no owner, so the API answers it to
  any signed-in visitor. Both pages offer the account's order pages, the owner's door (the order's
  uuid) and the owner-only reads (a rejected receipt's reason) only once `GET order/<code>/`
  answered for this account (`features/payment/use-order-ownership.ts`, one read per page, which
  also gives the order's link for the card transfer's cut-off and cancel); otherwise tracking or
  the order's link page.

**Visitor IP.** The API throttles guests per IP and all storefront traffic comes from one host,
so uncached calls (BFF, redirect resolution, short links, token refresh, bank callback) send
`X-Forwarded-For: <visitor IP>`. The IP is read from `CLIENT_IP_HEADER` (default `x-real-ip`), which
must be a header the edge **overwrites**; a client-appendable `X-Forwarded-For` would be spoofable.
Cached shared reads never carry it (it would split the cache per visitor), with one deliberate
exception: a **long-tail** listing query (`isLongTail` in `features/catalog/loaders/listing.ts`: a
`search` term, `min_price`/`max_price`, `attribute_values` or more than one `brand`) sends the
visitor IP. Next's fetch cache key covers every request header (`generateCacheKey` in
`next/dist/server/lib/incremental-cache` hashes the URL, method, headers, body and fetch options),
so such a read gets a per-visitor cache entry, still cached 60 s, and each miss is charged to the
visitor's own API rate limit rather than to the storefront's single address. Plain listings (no
parameters, or only `sort`, `page`, the boolean toggles or a single brand) stay shared. The API's
own 404s for product, category, brand and list-page slugs (and unknown filter contexts) are
remembered in process memory for 60 s, at most 500 keys, least recently used out first
(`features/catalog/loaders/missing.ts`); other failures are never remembered, and
`revalidateTag` does not clear this list. DEPLOYMENT.md recommends a per-IP nginx `limit_req` on
the catalog paths on top. The backend must trust the storefront (`TRUSTED_PROXY_IPS`); see
DEPLOYMENT.md.

**Why `FIREFLY_API_URL` must be the public API origin.** Django builds media URLs from the request
`Host` (and Node's `fetch` ignores a custom `Host`), and the rewrite target of forwarded paths is
visible in the `x-middleware-rewrite` response header.

## Configuration

- `src/config/env-schema.ts` validates the raw environment with zod. In production
  (`NODE_ENV=production`, which the standalone server and the Docker image set) `FIREFLY_API_URL`,
  `FIREFLY_API_KEY` and `SITE_URL` are required; elsewhere they default to `localhost`. Values are
  trimmed, one pair of quotes is dropped, blank means unset, and the error lists every invalid
  variable by name (never its value).
- `resolveStoreConfig(env)` merges the preset (`src/config/presets/`) with the `THEME_*`, `FEATURE_*`,
  map and Firebase variables. `toPublicConfig()` is an explicit allow-list for the browser
  (no API URL or key; `mediaOrigin` is the API's public origin, used by `SmartImage` to decide
  whether `next/image` may optimise a URL).
- `buildThemeCss(theme)` (`src/lib/theme/css.ts`) turns the theme into one `:root{…}` rule: brand and
  accent 50–950 scales generated in OKLCH, an AA-readable foreground for each, a focus colour with at
  least 3:1 against the page, radius and shadow tokens. The root layout writes it into a `<style>`
  tag; Tailwind v4's `@theme inline` maps utilities (`bg-brand-600`, `rounded-card`…) onto the
  variables. `THEME_FONT=custom` adds an `@font-face` for `/fonts/custom/font.woff2` with Vazirmatn
  as the fallback.
- **The one build-time input** is the `next/image` host allow-list (`next.config.ts`
  `buildRemotePatterns`), built from `FIREFLY_API_URL` at build time and restricted to `/media/**`
  and `/static/**`; without it the build warns and allows any https host plus localhost.
  `pnpm build` never needs a running backend.

## Cookies and the session

| Cookie | Holds | httpOnly | Lifetime |
| --- | --- | --- | --- |
| `ff_at` | JWT access token | yes | until the token's `exp` (15 min) |
| `ff_rt` | JWT refresh token (does not rotate) | yes | until its `exp`: 7 days, or 30 with "remember me" |
| `ff_cart` | guest cart token | yes | 30 days (the API keeps a guest cart 30 days after its last write) |
| `ff_auth` | the session's marker while `ff_rt` exists: lets the UI know instantly that a session exists (present = signed in), and which login it is | no | same as `ff_rt` |

The marker in `ff_auth` is opaque: a random value (`crypto.randomUUID()`) the BFF mints for every
login (password, code, Google, registration complete), never a user id and never derived from a
token. It is kept while that session lives: the BFF's own refresh leaves the cookie alone, the
proxy's refresh re-sets it with the same value (a new one only when the cookie was missing or
not shaped like a marker, `isSessionMarker`), and a password change keeps it. A logout or a dead
refresh token clears it with the tokens. Sessions from before markers hold `1`, which passes.

All are `Path=/`, `SameSite=Lax`, and `Secure` when `SITE_URL` is https. Helpers:
`COOKIE`/`cookieOptions` (`lib/auth/cookies.ts`); delete with `cookieOptions(key, 0, secure)`.
JWTs never reach browser JavaScript. `proxy.ts` refreshes an access token that is missing or expires
within 30 s before Server Components run, sets the new cookie on the response and rewrites the
forwarded `Cookie` header so the current render already sees it; a rejected refresh token clears
every session cookie; a network failure keeps the cookies and renders.

In the browser the session is the `hasSession` flag (`useSession`, first read from `ff_auth`).
Queries that only make sense signed in (`useMe` under `['me']`, the wishlist ids, the account
summary) are `enabled: hasSession`. When one of them answers a 401 that means the session is gone
(`isSessionExpiredError`: not a missing API key), it calls `useSessionExpired()`
(`lib/session/use-session-expired.ts`): `hasSession` turns false, so none of them asks again;
`clearViewerQueries` drops what that visitor saw; `['me']` becomes null. On an account page, or
a checkout that held a session (`isSignedInContextPath`: `/checkout/…`, whose signed-in version
shows the visitor's addresses; a guest's checkout has no session to end), the login page replaces
it, with the page as `next`; after an action of the visitor (a heart) login is pushed; a
background read on a public page only turns the page into its guest version. A guest's checkout
receiver lives in the tab's sessionStorage (`features/checkout/receiver-draft.ts`) and is
forgotten on any login or logout.
`clearViewerQueries` (`lib/session/viewer-queries.ts`) also runs on login and logout: it removes
the session-only queries (`['me']`, `['summary']`, `['wishlist', …]`) and resets the ones guests
read too whose answers depend on the viewer (`['cart']`, and under `['product', …]` the payload's
`is_in_wishlist` and the comment lists' `is_current_user`), so nobody sees the previous visitor's
data, not even within a stale time. A new viewer-dependent query key belongs in that list.
When several session calls answer 401 at once (an account page's queries), only the first one
ends the session: `endSession()` (`useSession`) reads a ref that changes at once, before React
re-renders, so the page is replaced by login once and the cart is read again once.

The account area (`/account/…`, `src/app/(shop)/account/`, inside the shop layout) is guarded on
the server (`lib/edge/account-guard.ts`). A layout gets neither the pathname nor the query and is
not rendered again on a navigation inside its segment, so `proxy.ts` does it: after its own token
refresh, a read of an account page without a usable refresh cookie (none, not a JWT, or one the API
has just rejected) answers 307 to `/login/?next=<the page and its query>` (Next's `_rsc` dropped),
clearing leftover session cookies on the way. That covers document requests and client
navigations alike. The account layout checks the refresh cookie again for the requests the
proxy only marks (router and `Purpose` prefetches: no refresh and no guard there, so a prefetch
in flight never sets the session cookies again after a logout in another tab; see
[Payment credentials in URLs](#payment-credentials-in-urls)), with the dashboard as `next`.
A redirect during a client navigation lands on login without the root layout rendering again,
so the tab would still think it is signed in: the auth
layout mounts `SessionCheck` (`lib/session/session-check.tsx`), which ends that stale session as
`useSessionExpired` does (no navigation) when the `ff_auth` cookie is gone. It reads the cookie
itself: the layout's own value of it may be old, since a back/forward visit replays an earlier
render (a guest's login page after the login). An account page can also come back with its
session gone and no server on the way: Back restores the page Next cached, and a tab left open
asks nobody. Every tab is set right when it comes back (shown again, focused, or a `pageshow`
from the browser's cache) by `SessionSwitchSweep` (`lib/session/session-switch-sweep.tsx`, in the
root providers), against the `ff_auth` cookie: a session but no cookie (ended elsewhere) → it ends
as on a 401 (the guest version of a public page; login replaces an account page, its data dropped
first); a session and the cookie, but with another login's marker than this tab's
(`useSession().sessionReplaced()`: the marker it loaded with, signed in with, or had when a server
render turned the session on) → another visitor signed in elsewhere: the tab's web push steps
stop, and an account or checkout page loads again (`location.reload()`: its HTML is the
visitor's own) while any other page reads the viewer queries again in place
(`resetViewerQueries`: the header's name, hearts, the cart, the «شما» marks; their HTML is the
same for everyone); no session but the cookie (a login elsewhere) → the tab takes the session
itself (`setHasSession(true)`, the guest's viewer queries reset) and asks the server once
(`router.refresh()`). A check that finds the cookie as the previous one did does nothing, so
`visibilitychange` and `focus` of one return to the tab check once. `AccountShell` mounts
`AccountSessionWatch`, the same check once when an account page mounts (Back restores the page
Next cached), plus the account area's own case: no session and no cookie → login replaces the
page, with it as `next`. A logout
that never reached the BFF (no connection: `status` 0 with the cookie still set) keeps the
session and says so (`useLogout`); one that reached it signs the tab out whatever the API said
(F6). Account pages are `force-dynamic` and `noindex`;
their data is read in the browser through the BFF (`useAccountQuery`: `enabled: hasSession`, a
401 ends the session as above, the section keeps its skeleton meanwhile). The dashboard's public
banners are read on the server and streamed in an in-page `<Suspense>` (the page never waits for
them). A write that changes one of the summary's counters invalidates `SUMMARY_KEY` (a wishlist
toggle, a comment or question sent). The unread notifications have no counter in the API: the
account shell counts them on every account page (`UnreadCount`: a scan of the list capped at 20
pages of 100, read again every 5 minutes while the tab is in view; the inbox shares the query)
for the «اعلان‌ها» badge and the header's dot. Catalog pages never scan; they show what the last
account page counted.

Signing in (`/login/`, `src/app/(auth)/`: a minimal layout without the shop chrome, `noindex`,
never cached) is a pure state machine (`features/auth/components/login-state.ts`: identifier →
password or one-time code → TOTP when the API asks → done) whose steps are built only from the
settings' `auth` block (`login-methods.ts`: no SMS, Telegram or Google unless it says so, and
nothing at all under `disabledAuth()`). A `requires_totp` answer keeps the first request and sends
it again with `totp_code`. Code timers are deadlines from the API's seconds (`expires_in`,
`resend_after`, a 429's `retry_after`), so they survive a step change. A 429 holds the step's main
action (`ورود`, the code's `تأیید و ورود`, the TOTP step, the Google button) for its `retry_after`;
when a code was refused or spent (`auth_otp_throttled`, `auth_otp_daily_limit`,
`auth_otp_too_many_attempts`) it holds the next send instead. A code in error is cleared, since the
six boxes send it again once they are full. The register link offered for `auth_user_not_found`
needs the `registration` feature and a `registration_methods` entry for the identifier's type.
Google is initialised once per page and client id; a button drawn again (back on step 1) reuses
it. Every successful login runs
`completeLogin` (`useCompleteLogin`, `post-login.ts`): `POST cart/merge/` once (its adjustments in
one toast; a failure is logged and never blocks), `clearViewerQueries`, `setHasSession(true)`, the
profile and the merged cart stored and invalidated with `['summary']`, then
`router.replace(safeNext(next))`. Google Identity Services is loaded by the Google button alone
(`next/script`), only on the login page and only while Google login is on; a script that fails
takes the button and its «یا» away. A visitor who is signed in already sees so on `/login/`; the
page never redirects on the cookie or the flag alone (a session the API refuses would loop).

Registration (`/register/`) and password recovery (`/forgot-password/`) share one pure state
machine (`code-flow-state.ts`: entry → code → password → done) and every part of login that is
not login's own: the request runner (one request at a time), the waits (`lib/forms/waits.ts`: a send's 429
holds the next send, any other 429 its step's button), the failure mapping (`auth-failure.ts`,
with each page's field rules in `code-flow-errors.ts`), the focus rules (`use-step-focus.ts`),
the code step (`OtpStep`, with the channel switch among the channels the identifier can take)
and the timers. Registration keeps the start's `registration_token` in state for verify, resend
and complete, then signs in through `completeLogin`; the same first step again goes back to the
code already sent instead of asking for another. Its method tabs and channels come from
`registration_methods` and `auth` alone, and while the `registration` feature is off (or no
method is listed) the page shows the operator's reason and the way to login, with no form. An
identifier taken (`auth_email_already_exists`, `auth_phone_already_exists`) is shown under its
field with «ورود» for it. The operator's terms (`accept_terms_text`) are sanitised on the server
(`features/auth/terms.ts`, every web link in a new tab so the form is not lost) and passed to the
page as a prop. Recovery checks the code by the channel it went by, keeps the reset token for
another try after `auth_password_weak` or `auth_password_unchanged`, and ends with a toast on
`/login/`, prefilled (no tokens come back). An unknown identifier gets the API's own
`404 auth_user_not_found` detail, which the API reveals on purpose (§4.12). The new-password
strength hint is client-side guidance only and steps aside while the API's reasons are shown.
No auth form ever submits natively (a GET would put names, an email or a mobile number in the
URL, the history and the server logs): every step's form is an `AuthForm` (`method="post"`; Next
renders the page again for a form POST that is no Server Action), its `SubmitButton` is disabled
until the page has hydrated (`useHydrated`, so the server HTML has it disabled too, which also
stops Enter in a field), and a `<noscript>` notice in the card says JavaScript is needed. The
account forms use the same parts: `AuthForm`, `SubmitButton`, `FormAlert`, `useFormFocus` and the
code timers live in `src/components/form/`, the waits and `useCountdown` in `src/lib/forms/`; a
list or section that could not be read shows `ListError` (`features/account/lists/list-error.tsx`,
`frame="inline"` inside a section's card), which holds «تلاش دوباره» for a 429's `retry_after`.
Every session-only read goes through `withSessionExpiry` (`lib/session/with-session-expiry.ts`):
a 401 that means the session is gone ends it, and stays the read's error or becomes its
"nobody" value (the profile's null, the wishlist's no ids). For the
same reason the links between the auth pages carry `next` alone: what the visitor typed goes to
the next page by a one-shot handoff (`features/auth/identifier-handoff.ts`: this tab's session
storage, with an in-memory copy when storage is blocked), set by the link's click (`HandoffLink`;
not for a new tab) or before `router.replace`, taken and cleared by the page it names
(`useHandedIdentifier`, which keys the form on it so a server-rendered page hydrates empty and is
prefilled right after). An `?identifier=` in a URL is ignored: an email address or a mobile number
there would reach the history, the server logs, the Referer and the operator's analytics.

## Caching

Pages are rendered per request (the root layout is `force-dynamic`, see R5). Shared data inside a
render comes from Next's Data Cache (`fetch` with `next.revalidate` and `next.tags`), which
`apiFetch` uses **only** for anonymous `GET`/`HEAD` calls with a positive `revalidate` and no token or
cart token. React `cache()` dedupes loaders within one render. The backend sends no
`Cache-Control`/`ETag` and has no revalidation webhook, so freshness is purely time-based.

| Resource | Where | Lifetime | Tag |
| --- | --- | --- | --- |
| `global/settings/` | `getSiteSettings()` | 300 s | `settings` |
| `global/feature-status/` | `getFeatureStatus()` | 60 s | `features` |
| `menu/<key>/` (main, header, footer, blog-sidebar) | `getMenu(key)` | 300 s | `menu:<key>` |
| `global/socials/` | `getSocials()` | 300 s | `socials` |
| `global/extra-snippets/` | `getSnippets()` | 300 s | `snippets` |
| `global/get-translation/fa/` (fallback `global/languages/`) | `getTranslations()` | 300 s | `translations` |
| `product/category/list/` (all pages) | `getCategoryTree()` | 300 s | `categories` |
| `product/detail/<slug>/comment/list/?comment_type=…&page=1` | `getFirstComments()`: page 1 of the reviews and of the questions, server-rendered in their own in-page `<Suspense>` after the product (spec §8.13); later pages, and page 1 again for a signed-in visitor (`is_current_user`), come through the BFF | 60 s | `product:<slug>`, `catalog` |
| `robots/?format=txt` | `/robots.txt` route | 300 s (fetch level) | — |
| `redirects/list/` (rule sources only) | `knownSources()`, in process memory | 5 min (a failed load is retried after 30 s) | — |
| `/_next/static/*` | browser / CDN | 1 year, immutable | — |
| optimised images (`/_next/image`) | `.next/cache/images` | Next default (4 h) or upstream max-age | — |

Never cached (`cache: 'no-store'`, and `Cache-Control: no-store` on our responses):

- every BFF call (cart, auth, account, orders, payment status, search…);
- `redirects/resolve/` (counts hits; a disabled rule must stop at once) — 1 s timeout, fails open;
- `shortener/<code>/` (each 200 counts a visit; the answer is always a 302, never a 301). A
  prefetch of `/s/<code>` (`next-router-prefetch`, `Purpose: prefetch`, `Sec-Purpose: prefetch`)
  gets an uncached 204 without an API call, and storefront links to `/s/` are plain `<a>` elements
  (`isShortLinkPath()` in `lib/links/short-link.ts`), never a prefetching Next `Link`;
- token refresh, the bank callback, the robots 503 fallback and `/healthz/`;
- forwarded `/media/`, `/static/` and `/sitemap.xml` (proxied as is; the backend's headers apply).

Rules for later plans (from the spec and `seo-cache-deploy.md` §10): never send `Authorization` on a
cached read, nor a per-visitor `X-Forwarded-For` (except on a long-tail listing query, see Visitor
IP); personal data (wishlist hearts, cart contents and
count, account details) is fetched client-side through the BFF, never rendered into the HTML; fetch
blog post detail once per render (`GET` increments the view counter).

The HTML is nevertheless not identical for every visitor: the root layout reads the `ff_auth` flag
cookie on the server (`hasSession`), so the header is rendered signed in (account menu) or signed
out («ورود | ثبت‌نام») from the first byte, without a flash. Pages are rendered per request and sent
with `Cache-Control: private, no-store`; a shared or edge cache of HTML (CDN, nginx `proxy_cache`)
must either vary on the `ff_auth` cookie or not cache HTML at all, or it would serve one visitor's
signed-in header to another.

## Rendering rules

- **R5 — the root layout is `force-dynamic`.** It reads runtime config (theme, store config,
  snippets) that must not be prerendered at build time. Never call `getServerEnv()` or
  `getStoreConfig()` at module top level. Route handlers that call the API also export
  `dynamic = 'force-dynamic'` (R3); fetch-level `revalidate` still caches their data.
- **R9 — real status codes.** No `loading.tsx` at a segment that can 404 or 500 (a streamed
  boundary turns `notFound()` and thrown errors into a 200 soft error). Pages await their primary
  entity and call `notFound()` before any `<Suspense>`; only secondary sections stream, via in-page
  `<Suspense>`. Pages that can 404 also return a not-found title from `generateMetadata`. Without
  `loading.tsx`, the feedback for a client navigation is `NavigationProgress`
  (`components/layout/navigation-progress.tsx`, in `ShopShell`): a 3 px top bar that starts on the
  router's start signal (`onRouterTransitionStart` in `instrumentation-client.ts`) or an unmodified
  same-origin link click that no handler cancelled (`onLeavingClick`, read after the click's own
  handlers; links whose click always opens a dialog instead also carry `data-opens-dialog`),
  completes when the path or query on screen changes, gives up after 10 s, sets `aria-busy` on
  `<main>` meanwhile, and is a static bar under reduced motion.
- **Metadata.** The root `title.template` is `'%s | <store>'`; it applies to child segments only, so
  the home page and pages with a backend `page_title` use `title.absolute`. Open Graph and Twitter
  titles are set explicitly. `metadataBase` is `SITE_URL`.
- **Hydration.** Anything that depends on "now" (relative dates) is computed client-side or given a
  fixed `now`. Mixed Latin/Persian titles use `dir="auto"`.
- **Language and formatting.** `<html lang="fa" dir="rtl">`; Persian digits, «… تومان», Jalali dates
  (`fa-IR-u-ca-persian`, `Asia/Tehran`) through `@/lib/format`; UI copy comes from the dictionary
  (`t(key)`), never inline strings in shared components.
- **Accessibility floor.** 44 px touch targets, 16 px body text (14 px for secondary labels), visible
  focus rings, `prefers-reduced-motion` respected.

## Performance

- **JavaScript budget (ruling P2-R4): at most 250 KB gzip per catalog route.** Next 16 no longer
  prints First Load JS, so the figure is measured as the browser loads the production build with
  no interaction: every `/_next/static/**/*.js` the page requests until it settles (after `load`,
  no `/_next/static` request in flight for 1 s, network-idle style limited to the app's own
  assets), each compressed with gzip -9 and summed. `noModule` polyfills are never requested by a
  modern browser and do not count; neither does code that loads on first use. The framework
  alone (react-dom, the App Router, the Turbopack runtime) is about 140 KB of it.
- **The guard:** `tests/e2e/catalog/budget.spec.ts` (desktop project, part of `pnpm test:e2e`)
  measures home, category, a curated list, product, search, compare, a brand and the brand index,
  each twice: on the desktop page (1440 px) and in a fresh phone context (Pixel 7 at 375 px, touch,
  mobile user agent), where code for touch phones may load. It prints
  `[js-budget] <route> (<device>): <KB>` for each and fails a route over 250 KB on either. At Plan
  2's end (desktop): home 219, category, list and brand 238, product 237, search 208, compare 214,
  brand index 204. The phone figures were about 15 KB higher (category 255) until the phone search
  overlay stopped preloading on idle. Its sibling `tests/e2e/catalog/budget-signed-in.spec.ts`
  measures the same way with the project's shared session (Plan 3): home, a category and a product
  as sara sees them, `/account/`, `/account/profile/` and `/account/notifications/`. After Plan
  3's final fixes (desktop/phone, signed in): home 227.7/225.4, category 247.9/245.7, product
  246.1/243.9, account 234.2/231.9, profile 231.5/229.2, notifications 224.1/221.9 — the
  signed-in desktop's catalog carries the header's account button chunk.
- **Push shops.** Web push's re-register effect has its own chunk, downloaded only by a browser
  with push on and a session (`LazyPushReregister` reads the stored registration first). The
  `budget-push` project runs both specs again against a second server on the same build with
  dummy `FIREBASE_*` values (playwright.config.ts: the config is read at runtime), signed in with
  push on in the browser (the costliest case), through the desktop project's session. After the
  Plan 3 final fixes (desktop/phone): a guest's pages are the same as without push (category
  245.7/245.7); signed in, the category is 247.9/245.7 without push and 249.5/247.3 with push
  on — 0.5 KB under the budget: the next catalog feature must pay for itself.
- **Plan 4's recovery (ruling P4-R2).** The root `app/error.tsx` boundary sits above the shop
  layout, so Turbopack builds its chunk group without the layout's chunks: its static import of
  `ErrorView` (next/link, `Button` and its Slot, icons) put a second copy of that code on every
  page (6.6 KB, of which 0.2 KB was the boundary's own). It now loads the view through
  `next/dynamic` when the boundary shows (a plain `ErrorFallback` with a reload if that chunk
  cannot load). Every route dropped 5.6 KB: signed in (desktop/phone) home 222.0/219.8, category
  242.3/240.1, product 240.5/238.2; the push shop with push on, category 243.9/241.6. The
  duplicates are found by parsing the loaded chunks' module ids (a module id in two chunks of
  one page); Turbopack's chunking options (`requestCost`, `minChunkSize`,
  `generateComponentChunks`) did not help (equal, +11 KB, +0.4 KB). A new boundary or other
  render-dependent file (error, not-found) at a segment above the shop layout must not import
  what the layout already ships.
- **The cart page's own code stays on `/cart/` (ruling P4-R1).** `features/cart/hooks.ts`,
  `api.ts` and `cart-cache.ts` ship with the header's badge and add-to-cart on every catalog
  page, so the cart page's writes live in modules only it imports: `coupon-hooks.ts` (apply,
  remove), `clear-hooks.ts`, `remove-hooks.ts` (removal with «بازگردانی»), with their own `bffFetch`
  calls rather than new `cartApi` entries. They share the `CART_WRITES` mutation scope and
  `storeCart`, so they wait for a stepper's PUT or a removal still on its way. The checkout
  (Plan 4 Tasks 2–3) follows the same rule. The phone's cart bar hides the bottom navigation the
  way the product page's buy bar does (`[data-cart-bar]` / `body[data-cart-bar-shown]` in
  globals.css: CSS only, no catalog code).
- **The checkout's code stays in `(checkout)`.** `features/checkout/` (the steps, the guest's
  receiver form, the shipping options, their writes in `use-checkout-writes.ts`) is imported by
  `/checkout/` alone; the `(checkout)` layout's frame (`ShellFrame` with `CheckoutHeader` and
  `CheckoutFooter`) leaves out the shop's header, menus, search, bottom navigation, compare bar
  and quick view, which pays for the steps. The address book's sheet and the map still load on
  demand, and so does the `(checkout)` error boundary's view, as the root's does (statically it
  cost 3.6 KB there; lazily 0.8 KB, its own copy of the loader and the plain fallback).
- **The checkout loads only the open step's body** (Task 3's amendment, `lazy-steps.tsx`). The
  page is the steps' frame: each step's numbered heading, a done step's summary in a line, a
  locked step's heading alone. The body of the open step is its own lazy chunk: the guest's
  receiver form or the signed-in address picker, the shipping options, the payment routes, the
  review. While it comes, its section keeps its heading (the focus goes there at once) over a
  skeleton; a chunk that cannot load says so in its section with a reload. The shopper at work in
  the page (a pointer over it, a focus in it) fetches the bodies of the steps ahead meanwhile,
  never on arrival alone. The choices made for the shopper run in the page's own code, not in
  the bodies (`use-auto-choices.ts`, from `useCheckout`): the book's default address posted for a
  signed-in cart, the operator's default shipping option. A step being completed so shows its
  heading over a named skeleton, and its body loads only if the shopper is asked after all (an
  empty book, no default, a refusal). A signed-in shopper's first visit therefore goes from the
  cart to the review loading the review's body alone. The guard measures every state a visitor
  lands in, against 246 KB for the checkout (`CHECKOUT_BUDGET_KB`, below the route budget:
  headroom for the order's payment resume): a guest at the receiver, a guest back at the review,
  sara's checkout with its writes refused (budget specs), and k.yazdi's first visit and return
  at the review (his journey). The radio steps (address picker, shipping, payment)
  take their form controls as one set (`step-controls.ts`: the radio group with the checkbox and
  the text input). The catalog's filters load those three as one chunk, and Turbopack groups
  modules by the chunk groups that load them together: steps that took the radio group alone split
  that chunk for the catalog (category, list and brand +1.8 KB). With the set, the catalog's
  chunks are byte for byte what they were. What runs only after the press loads on the press: the placement and its refusals
  (`place-flow.ts`, whose own imports are only modules the page does not have, or the shared
  chunks regroup again), then the placed order's payment (`placed/placed-loader.tsx` →
  `placed-order-panel.tsx`: the intents, `goToBank` behind its own `import()`, the ways to pay
  later), fetched ahead when the browser is idle after the shopper's first press or focus in the
  review's form, never on the step's arrival alone. The payment catalog (`payment/method/list/`, `payment/gateway/list/`) comes as props
  from the server's 60 s cache, its operator texts sanitised there (`features/payment/catalog.ts`).
  The only shared code the checkout added is the checkout in the session-expiry path rule
  (`isSignedInContextPath`) and the wallet's key in `SESSION_QUERIES`. In Task 3 the catalog
  routes grew by 343 B (home, category, list, brand, product), of which about 20 B is code (the
  wallet's key, one shared module) and the rest Turbopack regrouping the same modules into other
  chunks; `/cart/` grew by 430 B, as it also carries `CartSummary`'s checkout rows.
- **The payment link's page** (`/order/pay/<token>/`, Plan 4 Task 4) is read on the server
  (`features/payment/pay-link-read.ts`: the order once per request, shared with its metadata, the
  visitor's IP for the per-IP 30/min budget, never cached). A refusal (410, the 409s, 429, no
  answer) is a server-rendered calm page (`pay-link-refusal.tsx`) that loads no island; an unknown
  token is a real 404 (`not-found.tsx` in its segment). An open link renders its island
  (`pay-link-page.tsx`, its own chunk behind `pay-link-loader.tsx`, rendered on the server too),
  which reads the order again through the BFF only after the shopper acted. Its routes are the
  checkout's own lazy payment step (`lazy-steps.tsx`'s `PaymentSection`), the bank's screen
  loads on the bank's answer, the open-attempt resume UI (`open-attempt.tsx`) is its own chunk
  behind `open-attempt-loader.tsx` (the checkout loads it only on a `409 payment_attempt_open`,
  the link page only when its order has an open attempt), and the cancel dialog loads on its
  button's first press. Two lessons from keeping the shop's other pages byte for byte (measured
  by bisecting builds): a lazily loaded chunk that imported a constant from a client module of
  another feature (`THROTTLED_MESSAGE` from `account/lists/list-error.tsx`, in the resume UI's
  chunk under the placed order's) made Turbopack regroup the providers' shared chunks (+438 B on
  every page); and a lucide icon imported by an alias (`XCircle` instead of `CircleX`) adds a
  re-export module to a chunk the product page shares (+13 B). Copy such a constant, and use the
  icons' canonical names. Measured states (`tests/e2e/checkout/pay-link.spec.ts`, held to
  `CHECKOUT_BUDGET_KB`): an order to pay 238.1 KB, an open attempt 226.6 KB, a refused link 200.6
  KB (desktop and phone alike); a pure pay-on-delivery confirmation and every open-attempt row
  measure the same with the dev backend's answers replaced (the bank's states cannot be had in
  dev). The shop's other pages and `/cart/` are byte for byte what Task 3 left; the checkout's
  states moved by at most 0.2 KB (the carried retries' code), its costliest (sara's) not at all.
- **The payment result page** (`/payment/callback/`, Plan 4 Task 5): the route's entry is a thin
  wrapper around its island (`features/payment/result-loader.tsx`, server-rendered), the status
  polling (`use-payment-status.ts`) and «پرداخت دوباره» are in it, the bank redirect and the
  confetti load only when used. Measured from a mocked status
  (`tests/e2e/checkout/payment-result.spec.ts`, held to `CHECKOUT_BUDGET_KB`): checking, failed
  and an invalid return 219.1 KB, success 220.0 KB with the confetti (desktop and phone alike).
  A third lesson for keeping the shop's other pages byte for byte: importing the phone formatter
  (`lib/format/phone.ts`, directly or through the shell's `SupportPhone`) into the island regrouped
  two of the product page's chunks (+110 B there, measured by bisecting builds); the route formats
  the support line on the server and hands the island the text. Importing lucide's `LoaderCircle`
  next to `Spinner` re-exported it from a shared chunk (+11 B on every page): use `Spinner`.
- **The card-transfer page** (`/payment/card-transfer/<uuid>/`, Plan 4 Task 6): a thin route
  entry around its island (`features/payment/card-transfer/card-transfer-loader.tsx`,
  server-rendered: the title and the cards' skeleton). The island holds the cards, the receipt
  form, the Jalali date input (`components/ui/jalali-date-time-input.tsx` with the pure
  `lib/format/jalali-calendar.ts`, never re-exported from `lib/format`), the outcome and the
  closed views; the cancel dialog loads on its first press. Its radio group comes through the
  checkout's `step-controls.ts` set (the chunk-splitting rule above), and the support line is
  formatted on the server, as on the result page. Measured from mocked answers
  (`tests/e2e/checkout/card-transfer-states.spec.ts`, held to `CHECKOUT_BUDGET_KB`): 240.1 KB in
  every state (cards loading, the form, under review, rejected; desktop and phone alike), and the
  live journey's form the same; the shop's other pages, `/cart/` and `/checkout/` byte for byte
  unchanged. The island takes the shared leave-guard's default wait rather than importing
  `LEAVING_MS`: that export of `lib/navigation/leaving.ts` grew a lazy chunk of `/checkout/`
  (+4 B gzip, measured).
- **The order tracking page** (`/order/track/`, Plan 4 Task 7): in the shop's frame, a thin route
  entry around its island (`features/orders/track/track-loader.tsx`, server-rendered: the form,
  its button disabled until hydrated). The server's HTML holds no order: the lookup (code and
  mobile, a lookup key) is a `POST order/track/` from the browser, never a URL or a log. The
  island reads this device's guest orders after hydration; the phone formatter stays off it (the
  support line is formatted on the server). Measured from mocked answers
  (`tests/e2e/orders/track.spec.ts`, held to `CHECKOUT_BUDGET_KB`): 213.2 KB in every state (the
  form with recent orders, a result, not found; desktop and phone alike). Adding the route
  regrouped three of the shop's shared chunks (the same 89,875 raw bytes): the shop's pages load
  the same code, 661 B less gzip. A component a server component renders is a client reference of
  the whole route, loaded on every visit: the card transfer's calm page (also its not-found page)
  therefore takes its tracking link and its «کپی لینک این صفحه» from the island as props
  (`renderTrack`, `extra`) instead of importing them (they cost the route 4.6 KB first). The
  tracking links on the other pages (`TrackLink`) hand the order's code over in session storage;
  the code helpers they need live apart from the form's (`order-code.ts`), so they carry no phone
  formatter.
- **Keeping under it.** Interactive widgets that are not on screen at first paint load on first
  use: overlays and panels through `next/dynamic` (`ssr: false`), menus through `DeferredMenu`
  (`components/ui/deferred-menu.tsx`), toasts through the lazy Sonner view behind `notify()`. Each
  loader ends in `.catch` with a local fallback (the page it would have led to, or the content
  shown in place), and its trigger preloads on hover, focus or press. Content that only folds (the
  phone footer columns, an FAQ) uses the native `Disclosure` (`<details>`), not the Radix
  `Accordion`: no JavaScript, and the content is in the HTML while closed. Its trade-offs: the
  title heading sits inside `<summary>`, which VoiceOver reads as a plain disclosure (the heading
  is flattened out of its rotor), and it opens and closes without the accordion's animation. Use
  the `Accordion` where either matters or the state is driven from code (the listing filters).
  Server Components must not import a heavy client primitive just to wrap a trigger (a `Dialog`
  imported by a Server Component ships with every page that renders it).
- **Signed-in code.** What only a signed-in visitor sees loads with the session, never with a
  guest's page (the budget is measured as a guest): the header's account button (the profile
  read, the avatar) is a `next/dynamic` import rendered only while `hasSession` (server-rendered,
  and so preloaded, when the request carries the session flag), and its menu (with logout) loads
  on first use. A shared module in that code must not drag a larger one in: `useMe` reads the
  profile from `features/auth/profile-api.ts`, not from `authApi`, which holds every auth endpoint.
- **Product cards.** A card's heart, compare toggle, quick view icon and add slot are one client
  island (`CardActions`), not four: they read their grid's or rail's `CardScope` (one hydration
  flag, one wishlist-ids query and one compare-list subscription for every card), and the heart
  and the add button create their mutation only when pressed (`toggleWishlistOnce`,
  `addToCartOnce`, through `runMutation` in `lib/query/run-mutation.ts`: no observer, so the
  mutation is collected `gcTime` after it settles, and its scope still queues it behind the other
  cart writes). A card outside a grid or rail brings its own scope. The single buttons
  (`HeartButton`, `CompareToggle`, `AddToCartButton`, `QuickViewLink`) keep their hooks for the
  buy box, quick view and the compare table and share their markup with the island.
- **Total Blocking Time** (Playwright, 412×823, 4× CPU, 150 ms RTT, 1.6 Mbps; long-task time
  over 50 ms from FCP to load + 5 s) stays around 600–800 ms on a 24-card listing. The card
  island took about 80–120 ms off; the rest is the evaluation of the scripts with the inline RSC
  payload (one task of about 330–450 ms), the relayout when Vazirmatn arrives (about 130–200 ms)
  and React's single hydration commit (about 270 ms). Tried and dropped: a Suspense boundary per
  card (36 separate commits, but in one 1 s task), a plain `<a>` instead of `next/link` (no
  change), no web font (worse).
- **The phone search overlay and the iOS keyboard.** iOS raises the keyboard only for a field the
  visitor taps or one focused inside the tap's own event handling. The phone header field
  (`features/search/mobile-search.tsx`) is therefore a real, writable input (never read-only
  before a tap), and on touch phones (`(pointer: coarse)` below md) the overlay's code is
  preloaded at the visitor's first interaction: a touch, a scroll or a key anywhere, or the
  field's own focus or press (`features/search/overlay-loader.ts`). Not on idle: that is about
  15 KB gzip a page nobody touches would load anyway, and it took the phone listing routes over
  the 250 KB budget (the budget guard measures a phone too). With the code in, a tap opens the
  overlay inside `flushSync` and its field takes the focus before the tap's handler returns. Without it yet, the
  focus and whatever is typed stay in the header field, and the overlay opens with that text once
  the code arrives (leaving the field first cancels the opening). After closing, the focus returns
  to the header field read-only until it leaves, so the return does not raise the keyboard. If the
  code cannot load, the field stays the plain GET form. **Unverified on a real iPhone**: the unit
  tests check that the overlay field is focused while the tap is still being handled, which is the
  condition iOS needs, but no device test was possible here.
- **Layout stability.** Vazirmatn loads with `display: swap` behind Persian-tuned fallback faces
  (`styles/font-fallbacks.css`, listed in `lib/fonts.ts`), so text keeps its width and line breaks
  when the font arrives. Images have fixed frames, and countdowns and badges keep one width
  through hydration.

## Errors and degraded operation

- The shell loaders (`features/settings/api.ts`) never throw: a failure is logged once (status and
  code only) and a safe fallback is returned (no settings → the preset label as store name, empty
  menus, every feature on — the API still enforces switches with `503 feature_disabled`). A slow or
  absent backend therefore degrades the shell instead of breaking it.
- `503 feature_disabled` from any client query or mutation turns that switch off in the
  `FeatureProvider`; such errors are never retried.
- Errors render `error.tsx` (shop segment) or `global-error.tsx`; unknown paths render the Persian
  not-found page with a 404 status. The edge's own 404/410/503 pages come from
  `lib/edge/status-page.ts`.

## Operator content: sanitised HTML versus snippets

- **Content HTML** (footer text, later FAQ answers, pages, dynamic content) goes through
  `sanitizeOperatorHtml` (`lib/html/sanitize.ts`, server-only, sanitize-html): an allow-list of
  formatting, lists, tables, links and images; no scripts, styles, iframes, forms or event
  handlers; `http(s)`/`mailto`/`tel` URLs only; `/media` and `/static` made absolute on the API
  origin; external links (including `\`-spelled protocol-relative ones) open in a new tab with
  `rel="noopener noreferrer"`; tables wrapped in a focusable scroll region. Plain-text fields
  (announcement, copyright) use `htmlToText`.
- **Snippets** (`global/extra-snippets/`) are trusted operator code and are *not* sanitised:
  analytics must execute. `parseSnippet` splits them into `script`/`noscript`/`style`/`meta`/`link`
  nodes and loose `html`. Head snippets render inside `<head>` (loose HTML skipped); body scripts at
  the start or end of `<body>`; loose body HTML renders **visibly** in `<SnippetHtmlZone>` (top) or
  in the footer's trust-badge zone (bottom and `outside_of_body`) — eNamad-style seals are `<a><img>`.
  `on*` and `style` attributes on snippet script/meta/link nodes are dropped with a warning (React
  cannot render them). Bare (tagless) script and style snippets are escaped (`</script` →
  `<\/script`, `<!--` → `\x3C!--`, `</style` → `<\/style`) so they cannot end their wrapper
  early. Scripts run on the first full page load only. The only CSP today is `frame-ancestors`; a
  script/style policy must be nonce-based (Next's inline RSC scripts, the per-announcement inline
  script, snippets, the theme `<style>`).

## Payment credentials in URLs

The payment link's token (`/order/pay/<token>/`, a guest's only key to pay or cancel the order)
and a payment's uuid (`/payment/callback/?payment=<uuid>`, `/payment/card-transfer/<uuid>/`) are
bearer credentials (order digest §1.3): whoever reads the URL holds them. One rule names these
pages, `src/config/credential-routes.ts` (`isCredentialPath`, `carriesCredential`): the two path
prefixes, and a page whose `next` leads back to one (the payment link offers a login for the
wallet: `/login/?next=/order/pay/<token>/`). Every consumer reads that rule:

- **No operator code.** The proxy marks every page it serves with `x-ff-route-kind: page` or
  `credential` (overwriting whatever the visitor sent), prefetches included: its matcher takes
  router prefetches (an RSC request, `rsc: 1`, with `next-router-prefetch`; the prefetch header on
  a document request is treated as a visit) and `Purpose: prefetch` requests too (a prefetched
  document or segment can be shown on the click), and for those the proxy only marks the render
  (`isQuietPrefetch()`: no redirect lookup, which would count a hit, no session refresh, no
  account guard; an undecodable one gets the 404 page). The router's headers reach the proxy
  only because `next.config.ts` sets `skipProxyUrlNormalize`: by default Next removes `rsc`,
  `next-router-prefetch`, `next-router-segment-prefetch`, `next-router-state-tree` and the `_rsc`
  query before the proxy runs (`next dev` and `next start` alike), so a router prefetch and a
  client navigation arrive identical and the prefetch got the refresh and the guard (a refresh
  answering after another tab's logout set the session cookies again). What really arrives, with
  and without the option, is `tests/fixtures/rsc-request-shapes.json` (captured from the build).
  With the option the URL the proxy sees may carry Next's `_rsc`, which it leaves out of every
  URL it builds (the redirect lookup, the login's `next`). Its redirects are still built on the
  request's own URL (the server's listening address, `0.0.0.0:3000` in the image), and Next's
  router still makes a same-origin `Location` relative before it reaches the browser (checked on
  the build with a `0.0.0.0` listener; `tests/e2e/edge.spec.ts`). The snippet loader
  (`src/features/settings/snippets.tsx` through `operator-code.ts`) renders only on `page`: on a
  credential page, and on anything the proxy
  did not mark (fail closed: the paths its matcher skips, such as an asset-like URL's 404, and
  the paths it leaves alone, where it drops a marker the visitor sent),
  there are no snippet scripts, styles, meta tags, and no HTML zones either (the top zone, the
  footers' trust seals: their markup is unsanitised operator HTML, and `<img onerror>` would
  run). Analytics therefore never sees these URLs (`page_location`).
- **One third-party script stays: Google login.** The login that leads back to the payment link
  (`/login/?next=/order/pay/<token>/`) is a credential page, but Google Identity Services still
  loads there while Google login is on (`google-button.tsx`): it is the login itself, not
  operator code and not analytics, and with `no-referrer` neither its script nor its button's
  frame is sent the page's URL as a Referer. Like any script in the page it could read the URL;
  that is accepted for the login provider the shopper chose. No other third-party script may
  load on a credential page.
- **No referrer.** `securityHeaderRules()` (next.config.ts) sends `Referrer-Policy: no-referrer`
  on the credential pages (a later header rule wins in Next). The SMS link's trailing-slash 308
  is answered by Next before any header rule (it carries none, the baseline ones included); the
  page it leads to has the policy.
- **Full page loads.** Our links to them are plain `<a>` and `loadPage()`, never the client
  router: a script loaded on the page before (an analytics history listener) would otherwise see
  the new URL. The reverse is harmless: from a credential page, a client navigation keeps the
  root layout it rendered, so the pages after it show no operator code until the next full load.
- **Never looked up or logged.** The proxy never resolves a credential page as an operator
  redirect source (its path never reaches the redirect API nor `[redirects]` log lines); the BFF
  logs no paths; `next dev`'s request log ignores `/order/pay/` and `/payment/` (production logs
  no requests). Errors are logged with their status and code, never the path.
- **The shop's own pages still hold them in the DOM.** The checkout (a `page`: snippets run)
  shows the pay-later link (`/order/pay/<token>/`) and an open card attempt's link
  (`/payment/card-transfer/<uuid>/`) as `href`s. Nothing sends them anywhere, but a session
  replay or heatmap snippet records the DOM: CUSTOMIZATION.md tells operators to mask link URLs
  (or not to record `/checkout/`). They stay links (copy, open in a new tab).

**The bank's return page** (`/payment/callback/?result=…&payment=<uuid>&code=…`) never reads the
query on the server (its HTML is the same for every return). In the browser it reads the uuid
once, keeps it for this tab (`sessionStorage`, `ff-payment-return`) and replaces the address with
`?result=…&code=…` (the native History API, which Next keeps in step), so the credential leaves
the address bar and the tab's history; a reload of what is left reads it back from the tab's copy
(only when its `result` and `code` match, so another return in the tab never takes it). The page
stays under the `/payment/` prefix either way. The uuid is also in `localStorage`'s pending
payments (Plan 4, saved before the bank) on every page of the origin; the result page removes its
entry once the payment settled.

**The card-transfer page** (`/payment/card-transfer/<uuid>/`) is under the `/payment/` prefix
(operator code off, `no-referrer`) and is reached only by full page loads (the checkout, the link
page, the resume UI, its own «پرداخت دوباره»); a uuid of the wrong shape is a 404 with no API call.
It reads its cards in the browser (`GET payment/<uuid>/card-transfer/`, never an intent's answer:
a replayed key answers no cards), and its links back to the order's link page are plain `<a>`.
A cancelled attempt's and an unknown uuid's pending entries are removed.

**A new route whose URL carries a payment link's token or a payment's uuid** (in its path or its
query) must sit under one of `CREDENTIAL_PREFIXES` (`credential-routes.ts`), or add its prefix
there in the same change. Every safeguard above follows from that list alone (the marker, the
snippet gate, the referrer rule, the redirect lookup, the dev log); a route outside it gets none
of them.

Tests: `tests/unit/config/credential-routes.test.ts` (the rule),
`credential-headers.test.ts` (Next's own header matcher, the SMS link's 308 keeping the token),
`tests/unit/edge/proxy-credential.test.ts` (the marker, prefetches included),
`proxy-rsc.test.ts` (the captured request shapes: prefetches marked and nothing else, a client
navigation refreshed and guarded, `_rsc` left out of what the proxy builds),
`tests/e2e/edge.spec.ts` (the same on the running build, the Location relative),
`proxy-matcher.test.ts` (the proxy runs on prefetches), `tests/unit/layout/snippets-credential
.test.tsx` (nothing renders unmarked or on a credential page), `tests/unit/payment/credential-
links.test.tsx` (full loads), `tests/e2e/snippets.spec.ts` (no snippet runs on the payment
link's not-found page, and its `Referrer-Policy`) and `tests/e2e/checkout/pay-link.spec.ts` (nor
on a real link's page).

## Folder conventions

```
src/
  app/                     routes only; (shop)/ has the header+footer layout; (checkout)/ the
                           quiet frame of the purchase (logo, «خرید امن», back to the cart); _shell/ holds
                           root-layout helpers (metadata, theme head); dev/ui is a dev-only showcase
                           (404 in production); api/bff, api/v1/payment/…, robots.txt, s/[code],
                           healthz
  features/<domain>/       server loaders (`api.ts`, server-only), components, hooks, utils
  components/ui/           design-system primitives (Button, Sheet, Dialog, Carousel, Price…)
  components/layout/       shell pieces (SiteHeader, MegaMenu, MobileBottomNav, SiteFooter…)
  lib/                     framework-agnostic code: api, auth, bff, edge, html, http, format,
                           i18n, links, query, session, snippets, theme
  config/                  env schema, presets, store config, security headers
  styles/                  globals.css (Tailwind v4 @theme, tokens), rich-content.css
  proxy.ts                 the Next 16 proxy (formerly middleware)
tests/unit/<area>/         Vitest + Testing Library (jsdom); shared builders in */support.ts
tests/e2e/                 Playwright specs against the sample-data backend
scripts/                   start-standalone.mjs (serve the production artifact)
deploy/                    nginx.conf.example
docs/                      DEPLOYMENT.md, CUSTOMIZATION.md (Persian), this file, specs and plans
```

Conventions: named exports; `@/` imports; files around 250 lines at most; code, identifiers and
comments in English, user-facing copy in Persian; conventional commits. Write invisible characters
in source as `\u{XXXX}` escapes (with the regex `u` flag where relevant).

## Testing strategy

- **Unit and component tests** (`pnpm test`, Vitest + jsdom): formatting, env and theme config,
  colour contrast, API envelope and errors, BFF cookie/token/CSRF handling, the proxy (redirects,
  refresh, forwards, matcher), settings loaders and their fallbacks, snippet parsing, the sanitiser,
  every UI primitive and layout piece. Components that need the shell context render inside
  `Providers`; overlays and carousels call `stubBrowserApis()` (`tests/unit/support/dom-stubs.ts`).
- **End-to-end** (`pnpm test:e2e`, Playwright): runs the **production artifact** — `pnpm build` then
  `pnpm start:standalone`, i.e. `.next/standalone/server.js` with `.next/static` and `public` copied
  next to it, exactly like the Docker image (each server from its own copy of the build, one folder
  per port under `node_modules/.cache/standalone-servers/`, complete before it starts: the main and
  the push shop's server never touch each other's files, and the global setup stops a run whose
  reused server serves an earlier build) — against the local backend with sample data
  (`http://localhost:8000`). Three projects: `mobile` (Pixel 7), `tablet` (iPad landscape, Chromium)
  and `desktop` (1440×900). Specs that hit counted endpoints or check viewport-independent behaviour
  (edge, snippets) run in one project only. A fourth, `journeys` (1440×900, one worker, 10 s action
  timeout), runs after the other three: the specs that log in through the form or write sara's
  data (`tests/e2e/account/auth.spec.ts`, `account.spec.ts`), and the signed-in checkout as
  k.yazdi (`tests/e2e/checkout/checkout-signed-in.spec.ts`, ruling P4-R4: never sara for order
  journeys; the `kamran` guard of `tests/e2e/support/kamran-guard.ts` puts his cart's lines,
  destination and shipping choice and his address book back exactly), so no read-only spec sees that data
  change. A guest places one order per run (`tests/e2e/checkout/checkout-place.spec.ts`: a new
  mobile each run, for the guest's unpaid-orders ceiling; the dev backend answers a bank intent
  `400 gateway_unknown` when a gateway is named (the chooser shows), and the page withdraws that
  gateway for itself and tries the other with a press, refused too, until the bank routes close;
  `503 gateway_not_configured` when none is named; two of the 30 an hour of `payment_attempt`)
  and cancels it
  through its link afterwards, whatever happened (the token is taken from any 2xx placement
  before anything is asserted), so the dev database keeps no open unpaid order. The payment link
  journey (`tests/e2e/checkout/pay-link.spec.ts`) places one more guest order through the BFF
  (`support/guest-order.ts`, no intent), opens its link as the SMS spells it (no trailing slash:
  the 308 keeps the token), refuses the bank as above, opens a card-transfer attempt, resumes and
  abandons it on the link, reads that cancelled attempt's real status on the bank's return page
  (`/payment/callback/`), measures the link's pages, and cancels the order through the page's
  dialog (an API guard cancels it when the test ends earlier): four `payment_attempt` calls,
  about ten `order_payment_link` calls and one payment status read per run. Its budget lines
  print `/order/pay/<token>/`, never the token. The card-transfer journey
  (`tests/e2e/checkout/card-transfer.spec.ts`) places one more guest order, opens a live card
  attempt from its link page, checks the live cards, their copy buttons and the attempt's
  cut-off, fills the receipt with `tests/fixtures/receipt.png` and MOCKS its upload (a live
  upload moves the order to «در انتظار بررسی», which cannot be cancelled; Plan 4 Task 10 makes the
  one live upload), then cancels the attempt and the order (in `finally`): two `payment_attempt`
  calls and four `payment_status` reads per run. The page's other states
  (`card-transfer-states.spec.ts`, every device project) come from mocked answers, a real PNG
  decoded by the browser included. The return page's other states
  (`tests/e2e/checkout/payment-result.spec.ts`, every device project, a guest, no backend write)
  come from a status mocked in the browser (`page.route`), the polling schedule on Playwright's
  fake clock: the dev backend cannot run a bank. A failure the
  dev backend gives by design is forgiven by its status (`forgiveFailure(page, url, status)` in
  `watch-errors.ts`). Playwright skips it when a project before it failed, and a filter on the command line
  does not drop its dependencies (one journey file still runs the three device suites first):
  `pnpm test:e2e:journeys` (`--project=journeys --no-deps`) runs the journeys alone. An already running server on the base URL is reused;
  `E2E_BASE_URL` points elsewhere. One full run makes about 220 anonymous API requests (about 400
  before the BFF served a guest's empty cart from a shared copy), all from one address, and the
  sample backend allows 2000 an hour per address (`THROTTLE_ANON`, a sliding hour): about eight
  runs an hour, fewer with local browsing. Past that the backend answers 429
  `throttled` (`retryAfter` in the server log) and many specs fail at once. For back-to-back runs,
  start the backend with a larger budget, e.g. `THROTTLE_ANON=20000/hour`. A global setup
  (`tests/e2e/global-setup.ts`) probes the backend once before the run and stops it with that
  advice when the answer is already 429. The dev backend runs on SQLite: two projects writing
  carts at the same moment can meet «database is locked» (a 500). Every spec that writes a cart
  through the UI does it with `cartWrite` (`tests/e2e/support/cart-write.ts`): a 500 that the
  backend's log (`FIREFLY_BACKEND_LOG`, by default `/tmp/backend.log`) shows as that lock, and
  that left the cart unchanged (read again through the BFF), is logged as a warning and the
  visitor's action is repeated once; any other failure fails the test. A cart write a test makes
  itself (the checkout budget's seed line) goes through `requestCartWrite`, the same guard. No
  retry in app code.
- **Signed-in specs** (Plan 3). Every login, and every logout, is one `auth_attempt` at the
  backend, 20 a minute per address for the whole run (the BFF forwards the visitor's address), so
  specs never log in per test or in a loop (`tests/e2e/support/session.ts`, which counts a full
  run's attempts: 23). Measured from the backend's log, Playwright's project-by-project order kept
  them to at most 8 in any minute of a run (Plan 4 Task 2; 5 before the journeys project gained
  the signed-in checkout) and 9 across two runs back to back (Plan 3); that is the
  scheduler's behaviour as configured, not a guarantee, so keep the total low. A spec that only reads with a session uses
  `signedInTest` from there: its `page` shares one login per project per run (a storage-state file
  in the output folder, written by the first worker that asks for it while the others wait; if
  that login fails, the waiting workers fail at once with its reason, without logging in). Never
  log that session out, revoke it or change its password with it, and restore any account data a
  test changes: the `sara` fixture (`tests/e2e/support/sara-guard.ts`) reads sara's address book
  (with its default), wishlist and cart lines before a write journey and puts them back exactly in
  its teardown, with a request context of its own, however the test ends (a timeout included). It
  keeps that snapshot in `tests/e2e/.state/` (gitignored, outside the output folder) until the
  restore is verified, so a run that crashed is put right by the next one, which also takes out
  the journeys' markers (`MARKERS` in `tests/e2e/support/sara-data.ts`) before it starts. The
  restore runs even when the wait for her data to settle gives up. A snapshot that cannot be put
  back (her data changed since in a way the restore cannot undo) stops the run with an error naming
  `tests/e2e/.state/sara-<project>.json`: check her address book, wishlist and cart, then delete
  that file and run again. A
  spec that ends or changes its session logs in on its own, once per project, with `logIn` (as
  `tests/e2e/account/logout.spec.ts` does) or the form (`logInWithForm`), and logs out.
- **CI** (`.github/workflows/ci.yml`, push and PR to `main`): install, `typecheck`, `lint`,
  `format:check`, `test`, `build`. End-to-end tests are not run in CI (they need the backend, a
  separate repository); run them locally before pushing.

## Adding a page, a feature or a preset

**A page.** Add the route under `src/app/(shop)/…` (or another route group) and keep it thin:
compose components from `features/<domain>/`. Load data with a `cache()`-wrapped server loader that
calls `apiFetch` with an explicit `revalidate` and `tags` for public reads (or no `revalidate` for
personal data). Await the primary entity and call `notFound()` before any `<Suspense>`; never add a
segment `loading.tsx` there (R9). Export `generateMetadata` (with a not-found title). Add a unit test
for the loader and components, and an e2e spec if it is a user journey.

**A feature.** Create `src/features/<domain>/` with `api.ts` (server-only loaders), components
(Server Components unless interactive) and hooks for client state (TanStack Query through
`bffFetch`). If the browser needs a new API root, add it to `lib/bff/allowlist.ts` with the
narrowest methods. New UI strings go into `src/lib/i18n/fa.ts` (and are then listed in
CUSTOMIZATION.md). A backend feature switch is read with the `FeatureProvider` hooks; a frontend
extra gets a `FEATURE_*` variable in `env-schema.ts`, `resolveStoreConfig`, `.env.example` and the
docs.

**A preset.** Add `src/config/presets/<name>.ts` exporting a `Preset` (label, primary, accent,
radius, shadow, motion, card style), register it in `PRESETS` and `PRESET_NAMES`
(`src/config/presets/index.ts`), and document it in `.env.example` and CUSTOMIZATION.md. The theme
tests check that every preset produces AA-readable foregrounds.
