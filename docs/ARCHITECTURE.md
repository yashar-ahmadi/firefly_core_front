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
             │    5. a blog page while the blog is switched off: rendered with 503 (see «The blog switch»)
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
  cart merge, never on key-only paths), `Idempotency-Key` (passed through) and `X-Forwarded-For`
  (the visitor IP from `CLIENT_IP_HEADER`). Key-only paths (`isKeyOnly`, `lib/bff/session.ts`)
  get the API key alone and no refresh step: the token refresh and logout, and the sign-in,
  registration and recovery forms' POSTs (login, OTP login, Google, `register/*`,
  `password-reset/*`), which start a session and never need one, so a stale refresh cookie whose
  refresh fails transiently cannot hold every sign-in at a 503;
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
(`features/catalog/loaders/missing.ts`), and so is a listing page past its last (`?page=N`: the
catalog's `product/list/` and the blog's `blog/post/list/`, keyed by the normalised API query,
`orRememberedPastLastPage`; the page is still a 404, Plan 2's rule); other failures are never
remembered, and
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
`is_in_wishlist` and the comment lists' `is_current_user`, and a blog post's and a content page's
comment lists, `['blog-comments', …]` and `['page-comments', …]`, for the same flag), so nobody
sees the previous visitor's
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
proxy only marks (router prefetches and a `Purpose` prefetch without `Sec-Purpose`: no refresh
and no guard there, so a prefetch in flight never sets the session cookies again after a logout
in another tab; see
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
visitor's own), and so does a `/payment/` page (the bank's return, the card transfer: they read
once whether the payment's order is this account's, `useOrderOwnership`, and would go on
offering the previous account's order page and door), while any other page reads the viewer
queries again in place
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
| `blog/home/` | `getBlogHome()` (`features/blog/api.ts`) | 60 s | `blog:home`, `blog` |
| `blog/post/list/?category=…&search=…&page=…` | `getBlogPosts()`: the archive, a category's posts; a search sends the visitor IP (its own entry and rate, like a long-tail listing); a page past the last remembered a minute in process memory | 60 s | `blog` |
| `blog/category/list/` (all pages), `blog/category/<slug>/` | `getBlogCategories()`, `getBlogCategory()` (a 404 remembered a minute in process memory) | 300 s | `blog`, `blog-category:<slug>` |
| `global/feature-status/blog/` | `blogSwitchOff()` (`lib/edge/blog-switch.ts`), the proxy's, in process memory | 60 s (a failed read: retried after 15 s, the last known state kept) | — |
| `blog/post/<slug>/comment/list/?comment_type=comment&page=1`, `pages/<slug>/comment/list/?comment_type=comment&page=1` | `getFirstComments()` (`features/comments/first-comments.ts`): page 1 of a post's or a content page's comments, server-rendered in its own in-page `<Suspense>` after the subject; the questions (read when their tab opens), later pages, and page 1 again for a signed-in visitor (`is_current_user`) come through the BFF | 60 s | `blog-post:<slug>`, `blog`; `page:<slug>`, `pages` |
| `pages/<slug>/` | `getPage()` (`features/content/pages/api.ts`): a content page as everyone sees it, anonymous (a 404 remembered a minute in process memory); a staff preview is read apart, never cached (see Content pages) | 300 s | `page:<slug>`, `pages` |
| `pages/list/?limit=100` | `getPageCards()`: the `with_sidebar` aside's other pages | 300 s | `pages` |
| `pages/contact-us/` | `getContactPage()` (`features/contact/api.ts`, through `getPage()`): the operator's contact page above the form at `/contact-us/`; a staff preview of a draft is read apart, never cached, as every page's; a failed read shows the page without it | 300 s | `page:contact-us`, `pages` |
| `faq/category/list/?limit=100&page=…` (all pages) | `getFaqCategories()` (`features/faq/api.ts`): the help centre, anonymous | 600 s | `faq` |
| `contact-us/subject/list/?limit=100&page=…` (all pages) | `getContactSubjects()` (`features/contact/api.ts`): the contact form's subjects; expired at once by the BFF when a message is refused for a stale list (see Help centre, contact page and linker) | 300 s | `contact-subjects` |
| `linker/` | `getLinker()` (`features/linker/api.ts`): `/links/` | 300 s | `linker` |
| `global/dynamic-content/<key>/` | `getDynamicContent()` (`features/content/dynamic/api.ts`): the message slots (home, product, cart, checkout, the review's terms dialogs); a 404 remembered a minute in process memory | 300 s | `dynamic-content:<key>`, `dynamic-content` |
| `product/detail/<slug>/comment/list/?comment_type=…&page=1` | `getFirstComments()`: page 1 of the reviews and of the questions, server-rendered in their own in-page `<Suspense>` after the product (spec §8.13); later pages, and page 1 again for a signed-in visitor (`is_current_user`), come through the BFF | 60 s | `product:<slug>`, `catalog` |
| `robots/?format=txt` | `/robots.txt` route | 300 s (fetch level) | — |
| `redirects/list/` (rule sources only) | `knownSources()`, in process memory | 5 min (a failed load is retried after 30 s) | — |
| `/_next/static/*` | browser / CDN | 1 year, immutable | — |
| optimised images (`/_next/image`) | `.next/cache/images` | Next default (4 h) or upstream max-age | — |

Never cached (`cache: 'no-store'`, and `Cache-Control: no-store` on our responses):

- every BFF call (cart, auth, account, orders, payment status, search…), the contact form's
  message and its subject list read again after a stale-subject refusal among them;
- `blog/post/<slug>/` (each read counts a view): `getPost()`, once per page view, as the visitor
  (see Blog post views);
- a content page's staff preview: `pages/<slug>/` read again with the visitor's token after the
  anonymous read's 404 (see Content pages);
- `redirects/resolve/` (counts hits; a disabled rule must stop at once) — 1 s timeout, fails open;
- `shortener/<code>/` (each 200 counts a visit; the answer is always a 302, never a 301). A
  prefetch of `/s/<code>` never calls the API and is answered uncached (`src/app/s/[code]/route.ts`,
  `prefetchKind()` in `lib/http/prefetch.ts`): the Next router's (`next-router-prefetch`) gets a
  204; a browser's speculative one (`Purpose: prefetch` or `Sec-Purpose: prefetch`) gets a 503,
  because the browser keeps a 2xx and serves it on the click, which would then never reach us,
  while a non-2xx is discarded and the click navigates and is counted. Storefront links to `/s/`
  are plain `<a>` elements (`isShortLinkPath()` in `lib/links/short-link.ts`), never a
  prefetching Next `Link`;
- token refresh, the bank callback, the robots 503 fallback and `/healthz/`;
- forwarded `/media/`, `/static/` and `/sitemap.xml` (proxied as is; the backend's headers apply).

Rules for later plans (from the spec and `seo-cache-deploy.md` §10): never send `Authorization` on a
cached read, nor a per-visitor `X-Forwarded-For` (except on a long-tail listing query, see Visitor
IP); personal data (wishlist hearts, cart contents and
count, account details) is fetched client-side through the BFF, never rendered into the HTML; fetch
blog post detail once per render (`GET` increments the view counter).

**Normalised query strings** (seo digest §13): a listing's API query is built from the API's own
parameter names only (`parseListingParams`, keys sorted by `toSearchParams`), so equal listings
share one Data Cache entry whatever else the URL holds. Tracking parameters (`utm_*`, `gclid`,
`gbraid`, `wbraid`, `fbclid`, `msclkid`, `yclid`, `_ga`, `_gl`, `srsltid`: `lib/url/tracking-params.ts`)
are never filters: they never reach the API, and `listingIndexing` and `hasQuery` leave them out,
so a campaign link to a listing is indexed as its clean URL with the clean canonical (any other
parameter but `page` still makes it `noindex, follow` without a canonical). The home page's
canonical is always `/` (the installed app's `/?source=pwa` included).

The HTML is nevertheless not identical for every visitor: the root layout reads the `ff_auth` flag
cookie on the server (`hasSession`), so the header is rendered signed in (account menu) or signed
out («ورود | ثبت‌نام») from the first byte, without a flash. Pages are rendered per request and sent
with `Cache-Control: private, no-store`; a shared or edge cache of HTML (CDN, nginx `proxy_cache`)
must either vary on the `ff_auth` cookie or not cache HTML at all, or it would serve one visitor's
signed-in header to another.

### The blog switch

An operator can switch the blog off at any moment (`blog`; every blog endpoint then answers
`503 feature_disabled`). Its pages must then answer a real HTTP 503 with the operator's reason,
but an App Router page cannot set its status in Next 16 (`notFound()` is 404, `forbidden()` and
`unauthorized()` 403/401 behind a flag; streaming commits to 200). So the proxy does it: on a GET or
HEAD of `/blog` or under it, it reads the switch (`blogSwitchOff()`, above) and, while it is off,
lets the page render with `status: 503` and `Retry-After: 300` (`renderPage`,
`lib/edge/page-render.ts`), telling the page through `x-ff-blog-off` (the reason, percent-encoded;
a visitor's own header is always dropped). Next keeps the proxy's status for that render, documents
and RSC requests alike (checked on the build); a client navigation whose RSC fetch gets the 503
loads the page as a document, which shows the same. The page (`loadBlog`,
`features/blog/availability.ts`) renders «وبلاگ موقتاً در دسترس نیست» with the reason, noindex,
inside the shop's layout. When the switch goes off after the proxy last read it, the API refuses
the page's read (`BlogUnavailableError`): the page shows the same, with 200 this once **per server
process** (still noindex, and `private, no-store` like every page), and `noteBlogOff()` turns that
process's proxy state off at once, so its next request is a 503 (state on `globalThis`: the proxy
and the pages are separate bundles of one process). A read of the switch already on its way then
answers older news and is ignored (a generation counter), so it cannot turn the blog back on. The
state is per process: each instance of a multi-instance deploy learns the switch on its own (its
own minute's read, or its own first refused page). Back on: within the minute. Storefront-owned blog links follow the shell's feature map (`getFeatureStatus()`): the
account's «لیست مطالعه» row, my comments' post links, the search results' posts group, and the
reading-list bookmarks (also turned off by a refused write); the operator's menus come pre-filtered
by the API.

### Blog post views

`GET blog/post/<slug>/` increments the post's `view_count` on every call, with no dedupe (blog
digest §1.5), so a render of a post's page is a counted view. Ruling P5-R1: **no link to a post is
ever prefetched.** The blog's own links (cards, the sidebar's recent posts, the home's carousel,
search rows) say `prefetch={false}`, a link item holding one says `prefetch: false`
(`tests/unit/blog/post-links-prefetch.test.ts` checks the source), and operator URLs ask
`isBlogPostPath()` (`lib/links/post-link.ts`: MenuLink in the header and footer menus, StoreLink
on the home page). Hard rules for the post's route, so that even a default prefetch could never
render it (Next renders a dynamic page for a prefetch only down to a loading boundary, or with
Cache Components or partial prefetching):

- no `loading.*` at or above `/blog/[slug]` (`src/app`, `(shop)`, `blog`, `blog/[slug]`);
- no Cache Components (`cacheComponents`), no partial prefetching (`partialPrefetching`, a
  segment's `prefetch` export) in next.config or the route.

The same test fails on either.

The route (`app/(shop)/blog/[slug]/page.tsx`) reads the post through `getPost()`
(`features/blog/post-api.ts`), a React `cache()`: `generateMetadata` and the page share the one
call of the request (`tests/unit/blog/post-page.test.ts` fails without `cache()`). Nothing keeps
it beyond the request: no Data Cache, no ISR (`revalidate`). A cached detail would reach the API
only when it was refreshed, so the views of every page served from it would go uncounted, and a
draft published or previewed meanwhile would show stale. Being read per request anyway, it is
read as the visitor: their access token when it is a JWT (a staff account sees a draft or a
scheduled post, `is_unpublished`, under «پیش‌نمایش — این پست هنوز منتشر نشده است», noindex, no
share links, no comments; the post's `is_in_reading_list` seeds the bookmark, so it never shows
the wrong state first) and their IP (the API's per-IP limit). Checked on the build: a document
load counts one view, so does a client navigation (its RSC request); a router prefetch's request
(`next-router-prefetch`) renders nothing of the page and counts none; an unknown slug, a draft
for a guest and `list` are real 404s. `tests/e2e/blog/post.spec.ts` counts one more view for a
click from the blog and one for a reload.

**A HEAD request counts a view too.** Next renders a page for `HEAD` exactly as for `GET` and
only drops the body when it sends the answer (`send-payload.js`), so `generateMetadata` and the
page run and `getPost()` reads the post. It is not avoided, because a HEAD must answer what the
GET would: 200, a 404 for a missing post or a draft, a 503 while the blog is off. Only that
counted read knows which. The API has no read of a post that counts nothing: its own `HEAD` is
Django's `GET` (`retrieve()` increments `view_count` for a published post). So a monitor or link
checker that sends `HEAD` to post URLs inflates their views. Point uptime checks at `/healthz/`,
and keep crawlers' HEAD-only checks off `/blog/<slug>/`.

### Content pages

`/page/<slug>/` (`app/(shop)/page/[slug]/page.tsx`, content digest §3–§4) renders an operator's
page in the shop's layout. It is indexable, and a page counts no views (unlike a post), so its
links prefetch as any shop link: the search results' page rows, the aside, menus.

- **Two reads, kept apart** (`getPage()`, a React `cache()`: `generateMetadata` and the page
  share each). Everyone's page is read anonymously (no `Authorization`, no visitor IP) and cached
  300 s, one Data Cache entry for every visitor. Only when that read is the API's 404 (missing,
  or a draft), and only for a visitor with a session (a JWT-shaped `ff_at`), the page is read
  again with their token and IP, uncached (`apiFetch` never caches a call with a token). A staff
  account then gets the draft (`is_unpublished`): «پیش‌نویس — منتشر نشده», `noindex, nofollow`,
  no comments (their lists answer 404 even for staff). Anyone else gets the same 404. A published
  page never carries a token, and an answer read with one never reaches a cache. Pages are
  rendered per request anyway (R5), and sent `private, no-store`.
- **Status codes** (R9): no `loading.*`; the page is awaited and `notFound()` called (missing,
  a draft for a guest, `list`, a slug that is not one segment) before anything streams. Persian
  slugs are percent-encoded once for the API (`oneSegment`).
- **Layouts** (`pageLayout()`, unknown values read as `default`; the frame says `data-layout`):
  `default`, one readable column (`max-w-3xl`); `full_width`, the container's whole width, where
  tables scroll in their own focusable region and, on phones, pictures keep their own width, each
  scrolling sideways in a focusable, labelled region of its own as a table does (the sanitiser's
  `wideImages`: `<span class="image-wrap" role="region" tabindex="0" aria-label="تصویر">`, so the
  keyboard scrolls it too; a picture inside a link is left unwrapped, the link taking the focus;
  `.rich-content-wide`; from 768 px they fit the column; the content's box is the last guard, so
  the page itself never scrolls sideways);
  `with_sidebar`, the text and an `<aside>` «صفحه‌های دیگر» (every other published page,
  `getPageCards()`, read for that layout only), beside it from lg and sticky, below it on phones.
  None ships client code of its own: `ContentPage` is a server component.
- **Content**: `RichContentBody` over the sanitiser (`/media` on the API, shop links routed in
  the browser on a click, so a post's link is never prefetched: P5-R1). Every id is dropped (a
  page has no `headings`); a content `h1` is an `h2`, so the title is the page's one `h1`.
- **Head** (`contentPageMetadata()`, `features/content/pages/page-seo.ts`, over
  `pageMetadata()`): the title absolute (`page_title` as written when it names the shop, else
  «<page_title> | <shop>»: the API's `page_title` falls back to the bare title, checked live);
  the description (`page_description`, else `description`, else none); keywords when set; the
  canonical (`canonical_link`, else the page's own path, its trailing slash kept); the operator's
  `meta_tags` split, in order with repeats kept: `og:`, `article:`, `product:`, `profile:`,
  `book:`, `fb:` rows rendered by the page as `<meta property>` (React hoists them into the
  initial `<head>`), the others through `metadata.other`. No key is ever `undefined`. JSON-LD:
  the BreadcrumbList of the visible trail (the API gives pages no structured data), escaped.
- **Comments**: shown while `enable_comments`, or while approved comments or questions exist
  (`commentsShown()`; the form only while `enable_comments`). The section, lists, threads and form
  are the blog's, generalised in `src/features/comments/` by subject (`subjects.ts`: a post's or
  a page's API path, query key, form switch and words). A page's forms sit behind its own gate
  (`CommentsGate`): closed by `enable_comments`, or by a send's `403 page_comments_disabled`,
  which takes every form away and puts the API's sentence (focused) in its place. The shop's
  answer reads «پاسخ فروشگاه» on posts and pages alike, as in «دیدگاه‌های من».
- **`contact-us`** is never rendered here: `/page/contact-us/` redirects (308) to the contact
  page, `/contact-us/`, which shows the page's title, content and meta rows above the form (see
  Help centre, contact page and linker). The shop's own links to it (`contentPagePath`: search
  rows, the aside, «دیدگاه‌های من») go straight to `/contact-us/`; menus and the backend's sitemap
  still name `/page/contact-us/` and take the redirect.

### Help centre, contact page and linker

Plan 5 Task 4: `/faq/` and `/contact-us/` in the shop's layout, `/links/` in its own.

- **Help centre** (`/faq/`, blog-faq digest §2): every category (`limit=100`, then each page `next`
  names; only its `page` is read, `lib/api/every-page.ts`), anonymous and cached 600 s
  (`getFaqCategories()`, shared with `generateMetadata` by `cache()`), in the API's order (never
  sorted by name). A category without a visible question is left out (no heading over nothing,
  no chip to it); with none at all, an empty state. Each question is the kit's native
  `Disclosure` (`<details id="faq-<id>">`, its question an h3 under the category's h2, escaped,
  `pre-line`); each answer is operator HTML the API leaves unsanitised with relative `/media`: it
  goes through the shared sanitiser on the server (`faqSections()`: scripts, handlers and
  `javascript:` dropped, `/media` and `/static` on the API's origin). The page ships one island,
  `FaqBrowser`: the chip row (in-page links to `#faq-category-<id>`, sticky under the header;
  they work without JavaScript), a search over every question and answer (the API has none):
  Persian-aware (`faq-search.ts`: the Arabic ي, ى and ك read as ی and ک, digits in any script, a
  ZWNJ as a space, and a word found with or without its spaces), every word in any order; while
  it runs, what does not match is `hidden`, the chips go, and a polite region says the count;
  nothing found offers the contact page. A `#faq-<id>` link (on arrival or from the page) opens
  its question and brings it into view, clearing a search that hid it (`useFaqDeepLink`).
  FAQPage JSON-LD is built from the same data (the API's is not exposed): every question shown,
  each answer as the plain text of its sanitised HTML, escaped.
- **Contact page** (`/contact-us/`, content digest §9; `force-dynamic`, as the digest asks): the
  canonical contact URL, the backend's `support_link` (seo digest §2.2). `/contact/` (the guide's)
  and `/page/contact-us/` send there for good (308, `src/config/redirects.ts`). next.config's
  redirects run before the proxy (Next's order: headers, redirects, then the proxy), so they win
  over an operator redirect rule for the same path: the proxy never sees these requests (checked
  on the build: with a refresh cookie, `/faq/` makes the proxy's refresh call and `/contact/` none).
  The operator's `contact-us` page, when published, gives the title, the content (sanitised)
  and its meta rows (`property=` rendered, `name=` through `metadata.other`). A draft of it is
  previewed here by staff, since `/page/contact-us/` redirects: the pages' two-path read
  (`getPage`: the anonymous cached read, then, on its 404 and only with a session, the read with
  the visitor's token, uncached) puts it under the preview bar, `noindex, nofollow`. Its comments
  are not shown (the form is how to write to the shop) and the canonical is always `/contact-us/` (its
  `canonical_link` would name the redirect). Then the shop's contact details (the footer's
  `contactDetails()` and `ContactDetailsList` from `components/layout/contact-block.tsx`: phones,
  e-mail, address with postal code and map link, the response hours; not the support link, which
  leads here) beside the form.
- **The form** (`features/contact/`): the subject select only while subjects are listed (required,
  «انتخاب کنید» first and disabled), the name (≤ 100, `autocomplete="name"`), e-mail and phone in
  one fieldset (both left to right; at least one, checked before any request with the API's own
  `contact_channel_required` sentence, said once under both and describing both), the text
  (10–5000 as hints only), the honeypot. The body: the subject as a Number or left out, e-mail and
  phone trimmed and left out when empty, the phone's digits normalised (an Iranian mobile as
  `09…`; anything else in Latin digits for the API to refuse), the honeypot as typed. Every error of
  the table goes where it belongs (`contactFailure()`): the three contact codes (`attr: null`) by
  code, the others by `attr`, several at once; `parse_error`, 405, 413, 415 one generic alert; no
  answer or a 5xx «ارسال نشد…»; a 429 holds the button for `retry_after`, said in minutes (it can
  be close to an hour). A 201 shows the API's sentence under the button, clears the form and
  focuses the text.
- **A stale subject list** (Review Focus #4): the page's list is cached 300 s, so a subject
  switched off meanwhile (`contact_subject_unavailable`), or a list that was empty and is not any
  more (`contact_subject_required` while the form had no select), means the form's list is out of
  date. The form reads the list again through the BFF (`GET contact-us/subject/list/`: BFF calls
  are never cached), draws the select anew (keyed by the ids, so no old choice survives), keeps
  everything typed and says what happened. The digest's own design is a route handler calling
  `revalidateTag`; here the browser's calls go through `/api/bff/`, so the BFF does it
  (`lib/bff/contact-subjects.ts`): after the API's refusal with one of the two codes it expires
  the `contact-subjects` tag at once (`revalidateTag(tag, { expire: 0 })`), so the next render of
  the page reads the new list too. Only the storefront's own form can cause it: the BFF's CSRF
  check (`X-Requested-With: ff`, a same-origin `Origin`) comes before any call, and the API must
  have answered one of the two codes; and since a script can forge both, a bust happens at most
  once per 30 s per server process (each costs one subject read on the next render).
- **Throttle identity**: the message (10 kept an hour, per IP for a guest) goes through the BFF,
  which sends the visitor's IP as `X-Forwarded-For` on every call it forwards (`handleBff`, from
  `CLIENT_IP_HEADER`), as on every uncached user call, so each guest has the quota to themselves.
  The API honours it only from a trusted proxy (`TRUSTED_PROXY_IPS`, DEPLOYMENT): otherwise every
  guest shares the storefront server's ten messages an hour.
- **Linker** (`/links/`, content digest §8): `src/app/links/` sits outside `(shop)`, in its own
  layout: no shop header, footer or bottom navigation, but the root layout's skip link, providers
  and operator snippets (the proxy marks it a `page` like any other page), its `<main id="main">`
  and the bottom HTML zone, and next.config's security headers. One template for every theme: the
  palette as CSS variables on the root (`linkerStyle()`: `--linker-background`, a colour or a
  gradient, painted `no-repeat` the whole screen high; the text, button background, text and
  border; `--linker-radius` from `rounded_edges`), a value that is not a plain colour or gradient
  replaced by the classic palette's; the avatar's circle and a button's hover derived with
  `color-mix`; never a branch on `theme.key`. The focus ring takes the theme's text colour (it
  sits on the page background, which the theme keeps readable). The social row on top or at the
  bottom; a button's thumbnail on the PHYSICAL side the operator chose (the page is RTL: `right`
  is the natural order, `left` reversed); the footer line with `show_footer`. Links by type: a
  store path is the router's `Link` (a post never prefetched, P5-R1; a short link a plain `<a>`),
  anything else a plain `<a>` to the API's absolute `href`; e-mail and phone their `mailto:` and
  `tel:`; text a heading and its lines, never HTML; a video an embed only for Aparat
  (`/v/<hash>` → `www.aparat.com/video/video/embed/videohash/<hash>/vt/frame`) and YouTube
  (`watch?v=`, `youtu.be` → `www.youtube-nocookie.com/embed/<id>`, the privacy-enhanced player:
  no cookie before the visitor plays), hosts matched exactly, lazily loaded, titled, sandboxed
  (`allow-scripts allow-same-origin allow-presentation allow-popups`: no top navigation, forms or
  downloads), with `referrerpolicy="strict-origin-when-cross-origin"` (YouTube refuses to play
  without the origin); any other video a button; an unknown type nothing. The site's CSP has
  `frame-ancestors` only (who may frame the shop), no `frame-src`, so the embeds need no CSP
  change; adding a `frame-src` alone would block every other frame (Google's sign-in button, an
  operator snippet's) unless listed too. A linker never saved (`name === ''`) is a real 404; the
  page is indexable, its title the name, its canonical `/links/`. A server component: the route
  ships the root layout's code alone.

### Message slots (dynamic content)

Plan 5 Task 5 (auth-settings digest §7.8–7.9). A content page type is a message slot, not a page:
the operator creates one in the panel with a slug-style key and fills it with description and
warning items. The storefront's keys and places are in `SLOT_KEYS`
(`features/content/dynamic/slot-keys.ts`) and CUSTOMIZATION («جای پیام‌ها»): `home` (under the
home page's first section: `SectionRenderer`'s `notice`), `product` (under the buy box, before the
sections), `cart` and `checkout` (under the page heading), `terms` and `return-policy` (dialog
links «مطالعهٔ قوانین» and «رویهٔ بازگرداندن کالا» right after the review's terms checkbox, or on
their own without one).

- **The read** (`getDynamicContent`, `features/content/dynamic/api.ts`):
  `global/dynamic-content/<key>/`, anonymous, cached 300 s, tagged `dynamic-content:<key>` and
  `dynamic-content`. A 404 (no
  such slot, or switched off) is remembered a minute in process memory, as the catalog's are (Next
  caches only 200s), so an empty slot costs no API call per visit. Any other failure gives null,
  logged with its status alone. Only slug-style keys are read. It never throws.
- **The content** (`slotContent`): each item's HTML through the shared sanitiser on the server
  (`richContentHtml`, from `content/rich-content-html.ts`), relative `/media` and `/static` made
  absolute (the API leaves them relative); an item with nothing visible is dropped; no item, no
  slot.
- **`DynamicSlot({ pageType, variant })`** (`dynamic-slot.tsx`): `inline` is server HTML only
  (`slotBody`: host elements, an inline SVG icon): descriptions as content blocks (their title a
  heading), warnings as an `aside role="note"` with the icon and their title, or «توجه», in words.
  Its links are plain links: a post's is never prefetched (P5-R1), a short link counts once.
  `dialog-link` is a tiny client island (`SlotDialogLink`): a button whose dialog's code
  (`slot-dialog.tsx`, the kit's Dialog) loads on the first press or when the pointer or focus
  reaches it. The content comes rendered from the server as the island's children: no BFF entry,
  no client fetch, no sanitiser in the browser. The server knows from the same cached read whether
  to render the button at all. The dialog is named by the slot's title; the focus goes to its
  «بستن» (×), never to a link in the content, and back to the button on close.
- **`InlineSlot`** (`inline-slot.tsx`) is the inline variant on its own, for pages with no
  dialog-link slot (home, product, cart): Turbopack puts every client component a page's server
  modules import into that page's chunks, rendered or not, so importing `DynamicSlot` cost those
  pages 0.2–0.7 KB with every slot empty (`tests/unit/content/slot-imports.test.ts` guards it).
  The same holds for `RichContentBody`: `richContentHtml` lives apart from `RichContent`, and the
  checkout's server helpers import it from there.

### The PWA: the service worker's caches (Plan 5 Task 6)

The site has one service worker, `/sw.js` (`src/app/sw.js/route.ts`, scope `/`), built from
sections (`features/pwa/sw-source.ts`): web push (Plan 3: the push and click handlers, unchanged)
and, with `FEATURE_PWA` on, offline caching (`features/pwa/sw-offline.ts`). With the flag off the
worker answers no request at all (no `fetch` handler) and deletes every `ff-` cache an earlier one
kept; web push still registers it on opt-in. Its caches are named after the running build
(`.next/BUILD_ID`, `features/pwa/build-version.ts`): `ff-<build>-static`, `ff-<build>-images`,
`ff-<build>-pages`; activate deletes every other `ff-` cache, so a deploy starts clean.

| Request | Strategy |
| --- | --- |
| `/_next/static/*` | cache first (immutable files) |
| an image under `/_next/image`, `/media/`, `/static/` (same origin) | stale while revalidate, at most 200 kept, the least recently stored first to go |
| a navigation to `/offline/` or `/` (`OFFLINE_PAGES`) | network first; after 4 s, or when the network fails, the anonymous copy kept; else the offline page. With nothing kept a slow network is waited for (no offline page at 4 s for a page that is merely slow) |
| a navigation to any other page | the network; when it fails, the offline page (never a copy: none is ever kept) |
| everything else (RSC fetches, the BFF, JSON, other origins) | not answered: the browser's own request |

**Never kept, never served from a cache** (`SW_NEVER_CACHED` in `features/pwa/offline-rules.ts`,
the one list, embedded in the worker and checked by its tests): `/api/` (the BFF and `/api/v1/`),
`/account/`, `/cart/`, `/checkout/` (its thanks page too), `/payment/`, `/order/`, `/login/`,
`/register/`, `/forgot-password/`, `/s/` (short links count visits), `/sw.js`,
`/manifest.webmanifest`, `/healthz/`; any non-GET; any request with `Authorization`; any other
origin (the API host's images, when served directly, are opaque anyway); any response that is not
a plain 200 of type `basic` or `cors`, or carries `no-store` or `private`.

**Why only two pages have an offline copy, and how.** Every page is sent `private, no-store` (the
root layout is dynamic) and carries the visitor (`hasSession`, the header's account state), so the
worker never keeps the visitor's own navigation responses. It asks for the copies itself, at
install and when a kept copy is over 10 minutes old on a visit to that page (measured on the
worker's own clock: each copy is stamped `x-ff-kept-at` when kept, never aged from the server's
`Date`, since the device's clock may run ahead or behind): `x-ff-offline:
snapshot`, `credentials: 'omit'` (no cookie at all: the page renders for nobody, no session, no
guest cart). The proxy answers that request, and only that one, with `Cache-Control: no-cache` and
the header back (`lib/edge/offline-copy.ts`: GET, the header, no `Cookie`, no `Authorization`, a
document not a router fetch or prefetch, an `OFFLINE_PAGES` path; Next keeps a Cache-Control the
proxy set on a dynamic page, checked on the build); the worker keeps a page only with that
consent, so its own rule against `no-store`/`private` holds as stated. Every other response,
including the same page asked for with any cookie, stays `private, no-store`. A shared cache in
front may store such a copy (`no-cache`) but must revalidate it before any reuse, and it is the
page any guest gets. Such a cache must also vary it on `X-FF-Offline`, so it reuses the copy only
for the worker's own request, never for a visitor's navigation: Next writes every page's `Vary`
itself (`res.setHeader('Vary', …)` in its app-page runtime, replacing any the proxy set: seen on
the 16.4.1 build), so nginx adds it (`deploy/nginx.conf.example`: `map $upstream_http_x_ff_offline`,
`add_header Vary $ff_offline_vary`). The worker reads its copies by path with `ignoreVary` (one
copy per path). The app files the kept HTML names (styles, scripts, the font) are kept with
it, so the copy renders and hydrates offline. Offline, a signed-in visitor sees the guest's home
page (the anonymous copy): nothing of theirs is ever stored. Logout tells the worker to forget the
kept pages and pictures (`features/pwa/purge-offline-pages.ts`, from `forgetSignedInStorage`;
the avatar is a picture kept through `/_next/image`), which then keeps the anonymous copies
again: belt and braces for the pages, as none holds a visitor's data.

**Registration and the install prompt cost no chunk on arrival.** The root layout writes a few
lines of inline script (`features/pwa/register-sw.tsx`, production builds with `FEATURE_PWA` only):
after `load`, once idle, `navigator.serviceWorker.register('/sw.js', { scope: '/' })`, the same
call as web push's opt-in (one registration). It also counts visits (one per tab session), decides
whether this device may be offered the install (a phone, the second visit on, never dismissed,
not the installed app, not landing on the visitor's own pages) and keeps Chromium's
`beforeinstallprompt` (its own banner suppressed). The shop layout's gate
(`install-prompt-gate.tsx`, about 0.16 KB on every shop route, rendered or not: the floor for a
React mount point) loads the prompt (`install-prompt.tsx`) for such a device alone. A CSP with a
`script-src` (deferred, see DEPLOYMENT) must allow that inline script (nonce or hash).

**Turbopack gotcha: never `import` sharp.** `sharp` (the icons' generator,
`features/pwa/app-icon.ts`) is a server external; imported as ESM (`import`, static or `import()`)
Turbopack loads it as an async module, and one async module anywhere in the app adds Turbopack's
async-module runtime to the browser runtime every page loads (+0.45 KB gzip on every route,
measured). It is required through `createRequire` instead: a CommonJS external.

**Testing offline in Playwright.** `context.setOffline(true)` cuts the pages' requests but not the
service worker's own fetches (Chromium, seen on this build): `tests/e2e/support/pwa.ts` also
aborts every request through `context.route`, which reaches the worker's. The PWA specs run in the
`pwa` project, on the push shop's server with `FEATURE_PWA` on; the main e2e server runs with it
off, so no worker sits between the other specs and their routes and mocks.

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
  titles are set explicitly. `metadataBase` is `SITE_URL`, set once in the root layout
  (`app/_shell/metadata.ts`). No builder writes a key set to `undefined` (it would wipe the
  layout's value): `tests/unit/seo/no-undefined-metadata.test.ts`.
- **SEO (Plan 5 Task 7; spec §8.13, seo digest §7 and §13), checked on the build by
  `tests/e2e/seo.spec.ts` and `seo-urls.spec.ts`.** Every indexable route type (home, category,
  brand and the brands index, curated list, product, blog home, post, blog category, content page,
  FAQ, `/contact-us/`, `/links/`, the categories tab) serves one `<h1>`, a title, one absolute
  canonical on `SITE_URL`'s origin ending with `/`, one description, `og:title` and its JSON-LD:
  the backend's (Product, BlogPosting, CollectionPage, every BreadcrumbList) with every URL moved
  onto the shop's origin, else the shop's own: Organization and WebSite with a SearchAction on
  `/search/?q=` on the home page (`features/seo/organization-jsonld.tsx`, from the settings and
  socials; the backend's homepage has no structured data, so nothing is merged), FAQPage,
  a BreadcrumbList from the visible trail (brand, brands index, blog home, pages; the
  categories tab, home › «دسته‌بندی‌ها», though it shows no trail), a ProfilePage of
  the shop on `/links/` (`linkerJsonLd`). All written by `JsonLd` (`<` escaped). The product's
  JSON-LD keeps the API's Rial prices labelled `IRR` (for search engines only, never shown);
  nothing the storefront builds carries a price. noindex: the cart, the checkout and its thanks
  page, the account, search, compare, the generic listing, any filtered or sorted listing, the
  auth pages, order tracking, the pay link, the payment pages, `/offline/` and both 404 shells;
  the payment pages and the login that leads back to a pay link also send no referrer and name no
  canonical. Every page has exactly one robots tag: on a 404 it is Next's own `noindex` (written on
  every 404, it cannot be turned off), so every 404 head says `robots: null`
  (`NOT_FOUND_ROBOTS` in `features/seo/not-found-metadata.ts`), dropping its layout's (the
  checkout's, the account's) instead of writing a second tag; `tests/unit/seo/not-found-robots.test.ts`
  checks every not-found file.
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
  at the review (his journey); and the thanks page after a placement, a guest's and sara's
  (`tests/e2e/support/thanks-states.ts`: this tab's hand-off made up, nothing placed). The radio
  steps (address picker, shipping, payment)
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
- **The account's orders and reviews** (`/account/orders/`, `/account/orders/<code>/`,
  `/account/reviews/`, Plan 4 Task 8): client islands in the account shell over the BFF, every
  key under `ORDERS_KEY` (`SESSION_QUERIES`). An order's page reads the order on the server with
  the session first (`features/orders/account/order-read.ts`, never cached, one read shared by the
  metadata and the page), so an order that is not the account's is a real 404 (R9: no
  `loading.tsx`); without a usable token there it reads it in the browser. The pay sheet (the
  checkout's route choice and the open attempt, through the owner's uuid door), the cancel
  question, the QR code and the review form are each a `next/dynamic` chunk fetched on the first
  press (`order-overlays.tsx`, `awaiting-reviews-page.tsx`); one sheet and one question serve every
  card of the list, keyed by the order. Measured by the signed-in guard
  (`budget-signed-in.spec.ts`, held to `CHECKOUT_BUDGET_KB`, sara's orders read only): the list
  and an empty tab 225.3 KB, an order (delivered, or awaiting payment with pay and cancel
  offered) 226.8 KB, the reviews 219.9 KB on a desktop (push on: +1.6–1.7 KB). Adding them cost
  the shop's other pages at most 0.1 KB (`ORDERS_KEY` in the shell's `SESSION_QUERIES`, a lucide
  icon regrouped) and `/checkout/` 0.1–0.2 KB (`useAccountQuery`'s two new options, and `Input`
  regrouped into a chunk the orders' search shares).
- **The wallet** (`/account/wallet/`, Plan 4 Task 9): a client island in the account shell over
  the BFF, every key under `WALLET_KEY` (`SESSION_QUERIES`; the balance's own key is shared with
  the checkout's payment step). The balance and the top-up box load with the page; the three tabs
  (the ledger, the withdrawals, the payment history: one view at a time, a long page on a phone)
  are each a `next/dynamic` chunk, and so are the bank's code and Task 3's «در حال انتقال به …»
  screen (loaded with the bank's answer), Task 3's gateway chooser (behind «تغییر درگاه»: its
  radio group cost every view about 11 KB on load), the withdrawal form, its cancel question and
  a payment's detail sheet (`wallet-page.tsx`, `withdrawals.tsx`, `top-up-gateway.tsx`,
  `top-up-parts.tsx`). Measured by the signed-in guard (sara's wallet, read only; also answered
  frozen): 229.5–233.4 KB on a desktop and a phone, 235.1 KB at most with push on (230.7–234.4 KB
  and 236.0 KB since Plan 4 Task 10, below). Adding the
  route regrouped shared chunks for other pages without adding code to them (Turbopack groups
  modules by the routes that load them): `/checkout/` −0.2 KB, the product page −1.3 KB, login
  −0.3 KB, the card-transfer page −0.3 KB, the payment result −0.1–0.2 KB, `/register/` +0.8 KB,
  `/forgot-password/` +0.2 KB, the catalog's listings ±0.0–0.1 KB.
- **Plan 4's last figures** (Task 10, the full suite's guards on the final build; Task 9's last run
  for the comparison). Every Plan 4 route is under its 246 KB in every state measured: `/checkout/`
  unchanged (a guest 241.1, at the review 239.7, signed in 239.7, sara's refused writes 244.3 KB,
  the costliest), the payment link 239.1 / 228.3 (an open attempt) / 201.2 KB (refused), the
  payment result 219.6–220.4 KB, the card-transfer page 240.9 KB, order tracking 213.8 KB, the
  orders 223.2–227.2 KB, an order 224.7–228.7 KB, the reviews 217.8–221.8 KB, the wallet
  230.7–236.0 KB (push on included). The wallet grew 0.9–1.3 KB with Task 9's carried fixes, which
  load with the page (the withdrawal record read while the `wallet` switch is off, the rules for
  a balance under the minimum, the top-up's sentence for a gateway's own range); the orders list
  0.2–0.3 KB (its overlays' focus rule) and an order 0.1 KB (its way up). The catalog moved by at
  most 0.1 KB (rounding and regrouping; no code added to it): the costliest is a signed-in
  category with push on, 243.8 KB of 250; `/cart/` 228.4–232.4 KB.
- **The final fix wave's figures** (its last build, the budget specs). The thanks page
  (`/checkout/thanks/<code>/`, measured from then on) 215.6 KB in every state (a guest, sara,
  push on; desktop and phone alike). `/checkout/` 241.0 (a guest), 239.7 (the reviews) and 244.2
  KB (sara's refused writes): at most 0.2 KB less than Task 10. The account pages 1.6–1.7 KB more
  and the wallet 1.2–1.3 KB (the logout's storage clean-up, the wallet's entry with the switch off
  and its placeholder), the sign-in pages 0.8–0.9 KB more (the same clean-up), the payment pages
  0.5–0.6 KB more (the bank handoff's URL check; the wave's full run); the catalog and `/cart/`
  unchanged, but for 4 B on the signed-in category (242.2 KB).
- **The blog post page and the reading list** (Plan 5 Task 2, the full run's guards). A post
  (`/blog/best-phones-under-30m/`): 221.2 KB for a guest (desktop and phone), 223.5/221.2 KB
  signed in, 225.2/222.8 KB with push on. The article, its table of contents and the progress bar
  are small islands over server-rendered HTML; the comment form is a `next/dynamic` chunk fetched
  on the first «ثبت دیدگاه», «ثبت پرسش» or «پاسخ» press, and the questions are read only when their
  tab opens. The reading list (`/account/reading-list/`): 224.6/222.2 KB signed in, 226.2/223.9
  KB with push on. Its empty and no-match states are rendered by the server page and handed to
  the island as props (`readingListStates()`), and `PostGrid` takes its empty state from its
  callers: with `EmptyState` in the island's graph (imported directly and through `PostGrid`),
  Turbopack regrouped the catalog's shared chunks (the category +0.7 KB). Against Plan 5 Task 1's
  run: the category, a list and a brand unchanged (239.8 KB; signed in with push on, 243.8), the
  product page 1.0 KB less (237.5), nearly every other route 0.1 KB more (Task 1's carried link
  check, `isBlogPostPath()` in the shell's `MenuLink` and `StoreLink`), and, without new code on
  them, `/checkout/` 0.3–0.4 KB more (241.3 a guest, 240.0 at the review, 244.6 sara's refused
  writes: 1.4 KB under its 246), the payment result 0.5 more (220.6–221.4), the thanks page and
  the card-transfer page 0.2 more (215.8, 241.7). Bisecting builds found no single cause: taking
  out the post page, its comments or the reading list each gave back 0.1–0.2 KB of the checkout's
  share, and the checkout loads the same modules as before the task.
- **The help centre, the contact page and the linker** (Plan 5 Task 4, the full run's guards).
  `/faq/` 205.4 KB (desktop and phone; one island: the search, the chips, the questions through
  the kit's `Disclosure`); `/contact-us/` 208.5 KB for a guest, 210.8/208.5 KB signed in,
  212.5/210.2 KB with push on (the form); `/links/` 196.7 KB, held to 200 KB (no shop shell: the
  root layout's code and a server-rendered page). Against Task 3's run: the catalog, `/cart/`, the
  blog post and `/checkout/` (a guest 241.1, sara's refused writes 244.4) unchanged; the
  checkout's review states 239.8 → 239.9 KB, 9 bytes (two lazy loaders name chunks whose hashes
  changed; no module of the checkout changed, the figure crossed a rounding boundary); content
  pages 0.1–0.2 KB more (217.1: Turbopack moved the Radix tabs code their comments use into a
  chunk now shared with `/categories/`, whose total is unchanged); two account rows 0.1 KB
  (rounding).
- **The root 404 is light (Plan 5 Task 5, ruling P5-R2).** Next 16.4.1 builds every segment's
  not-found element on every request and passes it to that segment's `LayoutRouter`
  (`create-component-tree.js`, `createBoundaryConventionElement`): the root `not-found.tsx`'s
  rendered tree is in the payload of every page under the root layout, shown or not, and the
  browser loads the code of every client component in a payload. It used to render the shop
  shell, so every page outside the shop layout downloaded the shop's header, search, menus and
  bottom navigation, some of it twice (sara's checkout loaded 30 modules in two chunks). Now:
  - unknown URLs go through the shop group's catch-all `(shop)/[...missing]/page.tsx` (only
    `notFound()` and the 404 title; Next ranks a catch-all below every other route): the shop's
    `not-found.tsx` (search, the main categories) inside the shop layout;
  - the root `not-found.tsx` is server HTML only, with no client module in its import graph
    (`tests/unit/layout/root-not-found.test.tsx` walks it): the store's name, «صفحه پیدا نشد», a
    sentence, and plain links to home, `/search/` and `/contact-us/`. Next shows it inside the
    nearest layout of the page that threw (a malformed thanks code inside the checkout's frame, an
    unsaved linker inside the linker's), so it is a labelled region, never a second `<main>`.
  - The proxy still runs first for every path (operator redirects, legacy page extensions, the
    blog switch): it runs before Next's routing. `tests/e2e/route-table.spec.ts` checks each route
    family's status, both 404 shells and the proxy's mark on unknown paths.
  - Every path is a route now, so a router prefetch of an unknown path (a redirect source too)
    gets the catch-all's route tree, 200, where it used to get a 404; still no redirect lookup
    (`edge.spec.ts`). The navigation that follows is looked up like any visit: redirected, or the
    shop's 404 (`route-table.spec.ts` prefetches `/festival/`, then follows it to its target).

  Effect (the guards, desktop and phone alike): every `/checkout/` state −27.5 to −27.6 KB (a
  guest 213.6, at the review 212.3, sara's refused writes 216.8 of 246), the thanks page 188.2,
  `/login/` 208.3, `/register/` 209.3, `/forgot-password/` 205.4, `/links/` 169.2, the bank's
  return page 192.7 (the scratch measure); every page in the shop layout byte-identical (151 of
  188 guard lines unchanged; the contact page signed in +0.1 from a longer phone hint). A 404 for
  an unknown URL costs 202.0 KB (was 196.7: the shop layout's extras, such as the compare bar,
  now come with it). The HTML of a checkout page halved (82 → 43 KB). A future root-level boundary
  (not-found, error, forbidden) must stay as light: whatever it renders is on every page.
- **Message slots (Plan 5 Task 5).** An inline slot is server HTML: home, product, catalog and
  `/cart/` are byte-identical with their slots (empty in dev, and the mock's full ones measured
  the same). That holds only because those pages import `InlineSlot`, never `DynamicSlot`:
  Turbopack puts every client component a page's server modules import into that page's chunks,
  rendered or not (importing `DynamicSlot` cost them 0.2–0.7 KB with every slot empty). The
  checkout pays for the dialog-link button: +19 B for a guest and sara's refused writes, +97 B at
  the review (the guards: 213.6, 216.9 and 212.4 KB), because the button (about 0.4 KB) replaced
  `RichContentBody`, which the checkout had carried only through its server helpers' import of
  `richContentHtml` (now `content/rich-content-html.ts`). The same move took it out of the
  account's orders, order and wallet pages (through the payment catalog): 260–307 B less each.
  The content pages, which render it, load the same 32 modules as before in two chunks split
  differently: +132 B of compression. The dialog's code loads on the first
  press, never on arrival, with «در حال باز شدن…» said meanwhile. The dialog's own first-open
  cost is 15.1 KB: the kit's Dialog plus the Radix overlay base. The press also starts the review
  form's idle preload of the placed-order payment panel (24.0 KB). That preload is intended, and
  ticking the terms box starts it anyway.
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
- **The categories menus, per viewport (Plan 5 Task 8).** «دسته‌بندی‌ها» in the header's second
  row is one client component, `CategoriesMenu` (`components/layout/categories-menu.tsx`): from lg
  the mega-menu, below lg the drawer's button, chosen by `useMediaQuery` after hydration (the
  server and hydration render the drawer's button, which looks the same from lg, chevron
  included). The mega-menu's code (its panel, which renders the whole main menu) is not part of
  any page: its stand-in fetches it when pointed at or focused and mounts it open on a resting
  pointer (the menu's own 120 ms), a press (focus on its button) or Down/Up (focus on the first or
  last item), through `MegaMenu`'s `opening`; a failed download sends a press to `/categories/`.
  The drawer's panel loads on its first opening, as before. Phones hide the row, so neither
  menu's code loads there. Every page in the shop layout −1.8 to −1.9 KB, desktop and phone alike
  (the guards: category 238.1, product 235.8, home 218.4; signed in with push on, category
  242.2); pages outside it byte for byte. The menus' panels are therefore not in the server's
  HTML, so the header carries their links for crawlers (spec §8.13): `MenuLinkTree`
  (`components/layout/menu-link-tree.tsx`), a Server Component beside `CategoriesMenu` that
  renders the same items (`menu/main`, or the category tree while it is empty) as a `<ul hidden>`
  of plain `<a href>`, at every depth, on every page of the shop layout and at every width.
  `hidden` keeps it out of the layout, the accessibility tree and the tab order, and a plain
  anchor is never prefetched (P5-R1). It costs no JavaScript (the guards' chunks byte for byte)
  and about 1.1 KB of HTML (0.2 KB gzip) with the dev menu's 4 links, half of it the RSC
  payload's copy; rendered from inside `CategoriesMenu` instead (no RSC copy), it cost every
  shop page 85 B of JavaScript (measured, dropped).
- **Plan 5 Task 8's figures** (the full run's guards, 220 rows, against Task 7's). Every page in
  the shop layout 1.7–1.8 KB less, desktop and phone alike (the lazy mega-menu, less the cart
  badge's bump and the audit's fixes, about 0.1 KB): home 218.5 KB, a category, a list and a
  brand 238.3, the product 235.9, `/brand/` 200.4, `/cart/` 226.9, the blog 203.6, a post 219.7,
  the account pages 216.9–235.7 (push on included); the costliest is still a signed-in category
  with push on, 242.3 KB of 250. Unchanged: `/links/` 169.2 (of 200), `/register/` 209.3,
  `/forgot-password/` 205.4, the payment link, result and card-transfer pages, the thanks page
  188.2, a signed-in checkout 212.5–216.9 and a guest's review 212.5 KB. Two routes outside the
  shop layout (no mega-menu to shed) grew by bytes (each change's gzip cost measured in the
  served chunks): a guest's `/checkout/` 213.6 → 213.7 KB (218,758 → 218,808 B: about 36 B for
  the receiver form's room and the screen-tall skeleton, which took its CLS from 0.46 to 0, 10 B
  for «شمارهٔ موبایل», 8 B for the logo link's 44 px, less 4 B for the checkbox's
  `rounded-check`) and `/login/` 208.3 → 208.4 KB (about 8 B: the wording 7, the logo 7, the
  checkbox −6).
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
  over 50 ms from FCP to load + 5 s) on a 24-card listing: about 620–690 ms until Plan 5 Task 8,
  about 460 ms since. The card island took about 80–120 ms off (Plan 2). Task 8's traces put the
  rest in the swap relayout when Vazirmatn arrives (two tasks around 2.0–2.2 s) and the single
  hydration commit (about 300 ms, ending at 4.1–4.9 s on that link). The desktop sidebar's
  filters (379 elements on `/product/list/`, hidden below lg) were server-rendered and hydrated
  on phones too; they now render from lg only (`SidebarFilters`): alternating A/B against
  4519cb4, 7 runs each, the listing's median 624 → 462 ms and the phones category 601 → 408 ms
  (the lazy mega-menu alone did not move the listing: 632 vs 690, noise). Until the viewport is
  known, and below lg, the panel's static outline stands in (`FilterPanelSkeleton`, a Server
  Component passed as `fallback`: its switches, each group's title and a 44 px row per option,
  the brand search box, the price block and the swatch pills, about 85 plain elements on a phone),
  as tall as the panel to the pixel (`catalog/sidebar-stability.spec.ts` compares the two with
  and without JavaScript), so a desktop's panel moves nothing: an empty filtered listing's footer
  shifted (CLS 0.0101 at 1440×900, now 0). It costs the listings 4 B of JavaScript and no phone
  blocking time (A/B against Task 8, 7 runs: within noise). Tried and dropped: a
  Suspense boundary per card (36 separate commits, but in one 1 s task), a plain `<a>` instead
  of `next/link` (no change), no web font (worse). Not done: the card's RSC rows (about 4 KB each,
  mostly Tailwind class strings; the compare item repeats the card's name and image) are small
  next to the hydration itself.
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
  through hydration. A lazily loaded body keeps its room while its code comes: the guest's
  receiver form's skeleton is the form's height (`guest-form-room`, globals.css), and the
  checkout's loading skeleton is a screen tall, so the footer starts below the fold (Lighthouse
  measured a CLS of 0.46 on a guest's `/checkout/` before; `checkout-stability.spec.ts`: 0.000).
  A signed-in first visit's choices made for the shopper (`use-auto-choices.ts`: the book's
  default address, the operator's default shipping) run behind that skeleton: shown as they
  happened, each opened and closed its step and moved the steps below (k.yazdi's first visit:
  CLS 0.148 on a 412 px phone, 0.115 at 1440×900; `checkout-signed-in-stability.spec.ts`: 0).
  The page of steps is a screen tall too, so the footer stays below the fold as steps open and
  close. A choice made again after arrival (another address resets the shipping) shows in its
  step, as before.
- **The font is a subset** (`lib/fonts.ts` holds the command): 85 KB instead of the full variable
  font's 111 KB, preloaded (an HTTP `Link`) on every first visit; Latin Extended and IPA letters
  fall back to the system face.

## Errors and degraded operation

- The shell loaders (`features/settings/api.ts`) never throw: a failure is logged once (status and
  code only) and a safe fallback is returned (no settings → the preset label as store name, empty
  menus, every feature on — the API still enforces switches with `503 feature_disabled`). A slow or
  absent backend therefore degrades the shell instead of breaking it.
- `503 feature_disabled` from any client query or mutation turns that switch off in the
  `FeatureProvider`; such errors are never retried.
- Errors render `error.tsx` (shop segment) or `global-error.tsx`; unknown paths render the shop's
  Persian not-found page with a 404 status (through the catch-all `(shop)/[...missing]`; the root
  `not-found.tsx` is the light one, see Performance). The edge's own 404/410/503 pages come from
  `lib/edge/status-page.ts`.

## Operator content: sanitised HTML versus snippets

- **Content HTML** (footer text, later FAQ answers, pages, dynamic content) goes through
  `sanitizeOperatorHtml` (`lib/html/sanitize.ts`, server-only, sanitize-html): an allow-list of
  formatting, lists, tables, links and images; no scripts, styles, iframes, forms or event
  handlers; `http(s)`/`mailto`/`tel` URLs only; `/media` and `/static` made absolute on the API
  origin; external links (including `\`-spelled protocol-relative ones) open in a new tab with
  `rel="noopener noreferrer"`; tables wrapped in a focusable scroll region. Every `id` is
  dropped, except a blog post's heading ids (`headingIds`, its table of contents' anchors:
  `lib/html/heading-ids.ts`), kept on headings only, each on its first heading (the document
  never holds an id twice), and never one the page's own markup uses: `RESERVED_IDS`
  (`lib/html/reserved-ids.ts`: `main`, `comments`, the post's title and sections, the shell's
  ids; a new id on such a page goes there, `tests/unit/html/reserved-ids.test.ts` checks it).
  Plain-text fields (announcement, copyright) use `htmlToText`.
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
  a document request is treated as a visit) and browser prefetches too (a prefetched document or
  segment can be shown on the click), and for the quiet ones the proxy only marks the render
  (`isQuietPrefetch()`: no redirect lookup, which would count a hit, no session refresh, no
  account guard; an undecodable one gets the 404 page). One rule decides which prefetches may be
  quiet: only those the browser never shows on the click. A router prefetch is the router's own
  fetch. A `Sec-Purpose` holding the token `prefetch` is never quiet, whatever comes with it: a
  speculation-rules prefetch is kept even under `no-store` and shown on the click, and so is a
  prefetch ahead of a prerender, which Chromium sent with both `Sec-Purpose: prefetch;prerender`
  and the older `Purpose: prefetch` while it moved to the new header (Chromium CL 5df53e05: "the
  Purpose header is unchanged"); it goes through the lookup and the refresh like a visit.
  `Purpose: prefetch` alone is quiet: it is the older `<link rel=prefetch>` header (older
  Chromium, WebKit), whose answer goes through the HTTP cache, and every page here is
  `no-store`, so the click is a visit of its own and gets the lookup and the refresh (current
  Chromium sends `Sec-Purpose` for `<link rel=prefetch>` too). Captured from the preinstalled
  Chromium 141 (`tests/fixtures/browser-prefetch-shapes.json`, read by
  `tests/unit/http/prefetch-kept.test.ts`; the both-headers shape is recorded there, not captured:
  Chromium 141 no longer sends `Purpose`); `tests/e2e/edge.spec.ts` checks the `no-store` answer
  such a document gets, and that a both-headers prefetch of a redirect source is redirected while
  `Purpose` alone is not. A page ever answered cacheable would need `Purpose: prefetch` to stop
  being quiet. The router's headers reach the proxy
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
- **Never looked up or logged by the app.** The proxy never resolves a credential page as an
  operator redirect source (its path never reaches the redirect API nor `[redirects]` log lines);
  the BFF logs no paths; `next dev`'s request log ignores `/order/pay/` and `/payment/`, and the
  production server (`server.js`) writes no request log at all. Errors are logged with their
  status and code, never the path. The reverse proxy in front does log requests: the shipped
  `deploy/nginx.conf.example` writes every access log through `log_format firefly_masked`, whose
  URI (`$ff_safe_uri`, three `map`s over `$request_uri`) has `<token>` for the payment link's token
  (`…/order/pay/`, `…/payment/link/`, `/login/?next=/order/pay/…` also `%2F`-spelled, the bank's
  `/api/v1/payment/gateway/callback/<gateway>/<token>/`) and `<uuid>` for up to two uuids
  (`/payment/card-transfer/`, `/payment/callback/?payment=`, `/api/bff/payment/<uuid>/…`, the
  same API paths in the single-origin topology), and no Referer. Checked with nginx 1.27.5 on
  credential-shaped requests (none reached the access log). nginx's error log cannot be masked: an
  upstream failure writes the request line there (DEPLOYMENT.md says how to treat it). Any other
  proxy or CDN in front must mask the same paths; a new credential route (below) adds its pattern
  to those maps.
- **The shop's own pages still hold them in the DOM.** The checkout (a `page`: snippets run)
  shows the pay-later link (`/order/pay/<token>/`) and an open card attempt's link
  (`/payment/card-transfer/<uuid>/`) as `href`s. Nothing sends them anywhere, but a session
  replay or heatmap snippet records the DOM: CUSTOMIZATION.md tells operators to mask link URLs
  (or not to record `/checkout/`). They stay links (copy, open in a new tab).
- **The account order's first render carries no link token.** `/account/orders/<code>/` (a
  `page`: snippets run) hands the order it read on the server to the browser in the page's RSC
  payload, so `readAccountOrder` replaces its `payment_url` with a marker first (the page only
  needs whether a link exists; null stays null). The browser's own reads (`GET order/<code>/`
  again, and `order/list/`) still bring the real `payment_url` into the tab's query cache:
  memory only, never rendered, sent or logged, the same trade-off as the checkout's placement
  answer.

**The bank's return page** (`/payment/callback/?result=…&payment=<uuid>&code=…`) never reads the
query on the server (its HTML is the same for every return). In the browser it reads the uuid
once, keeps it for this tab (`sessionStorage`, `ff-payment-return`) and replaces the address with
`?result=…&code=…` (the native History API, which Next keeps in step), so the credential leaves
the address bar and the tab's history; a reload of what is left reads it back from the tab's copy
(only when its `result` and `code` match, so another return in the tab never takes it). The page
stays under the `/payment/` prefix either way. The uuid is also in `localStorage`'s pending
payments (Plan 4, saved before the bank) on every page of the origin; the result page removes its
entry once the payment settled, entries older than 7 days go at the next save, and a logout
(every outcome that ends the session, `forgetSignedInStorage` in `use-logout.ts`) removes the
ones saved while signed in (each entry is marked with whether the flag cookie was set; entries
kept before that mark go too, a guest's own stay), with this tab's last placed order
(`ff-checkout-placed`) and its placement key. A guest's recent orders (`ff-guest-orders`, the link
token once, no URL beside it) are kept 30 days on the device: the link pays only until the payment
deadline (72 hours, a week after a receipt), the code stays for tracking.

**The way to the bank** (`src/features/payment/go-to-bank.ts`) leaves only for a handoff URL that
`bankUrl()` (`handoff-url.ts`) accepts: `https:`, and `http:` only in a build that is not
production (`next dev` and the unit tests, for a sandbox gateway on a developer's machine; the
browser does not know the backend's base URL, and every gateway's payment page is https). The URL
comes from the API, and a `javascript:` or `data:` one given to `location.assign` or a form's
`action` would run on the shop's origin. Where a handoff arrives (an intent's answer, a top-up's,
an open attempt's «ادامه در …») one that is refused is the bank not answering
(`gateway_unavailable`): nothing is saved for the way back and nothing navigates; `goToBank`
itself throws `UnsafeHandoffError` before touching either. Tests: `tests/unit/payment/
handoff-url.test.ts`, `go-to-bank.test.ts`, `unsafe-handoff.test.tsx`.

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
of them. Its token or uuid also needs a pattern in the nginx example's log masks (above).

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
  destination and shipping choice and his address book back exactly; since Plan 4 Task 10 it also
  places his order through the review, the only signed-in placement of a routine run: the bank
  refused, the order kept on the page with no console error, and his guard cancels it, with any
  other order of his awaiting payment that the test left and never handed over: it lists them
  before the test and after), so no
  read-only spec sees that data change. His account's orders journey (`tests/e2e/account/orders-journey.spec.ts`) places one
  order of his through the BFF (`support/kamran-order.ts`, no intent), finds it in «سفارش‌های من»,
  presses «پرداخت» (the dev bank refuses the intent: one `payment_attempt`), cancels it from its
  page (the `kamran` guard's teardown cancels it when the test ends earlier, a timeout included)
  and buys it again (one `cart/reorder/`;
  the guard empties his cart again). The read-only orders spec (`tests/e2e/account/orders.spec.ts`,
  every device project, sara) aborts any write the pages could make and answers the review's
  submission itself (a live review cannot be taken back). The wallet's read-only spec
  (`tests/e2e/account/wallet.spec.ts`, every device project) reads shirin's wallet (ruling P4-R4:
  the account with a wallet history; her own shared session, `tests/e2e/support/shirin.ts`) and
  aborts every write; her wallet journey (`wallet-journey.spec.ts`, journeys) presses a top-up the
  dev bank refuses (one `wallet/top-up/`, no money moves), then files ONE withdrawal request and
  cancels it in the same test (the money back at once: her balance asserted exactly as before);
  a guard cancels any open request of hers before and after (`wallet_withdrawal` is five an hour,
  counted on success: one request per run). Her reading list (`tests/e2e/blog/reading-list.spec.ts`,
  journeys; Plan 5 Task 1): one post saved and removed from a card, one request per press (POST,
  then DELETE), her list snapshotted first and put back exactly by the fixture's teardown (two
  writes a run when it passes); her page `/account/reading-list/` (Task 2: a post saved for it,
  filtered and sorted through the URL, removed by its bookmark and brought back by «بازگردانی»;
  three writes, and the teardown's one to take the post out again). The blog's read-only spec
  (`tests/e2e/blog/blog.spec.ts`, every device project) reads the home, its pages, a category and
  the search's «مشاهدهٔ همه» as a guest; `watch-errors.ts` lets no route's 404 through any more
  (content pages were the last, Task 3), only the dev backend's missing pictures. Content pages'
  spec (`tests/e2e/content/page.spec.ts`, every device project, a guest) reads `about-us` in its
  layout with its comments and the shop's answer, `privacy` without a comments block, real 404s
  for a missing page and a draft, and answers the form's POST itself (a 201, then a 403
  `page_comments_disabled`); `E2E_LIVE_PAGE_COMMENT=1` sends one guest comment on `terms` for
  real (desktop only, once: it stays pending for the operator to reject). The help centre's,
  the contact page's and the linker's specs (`tests/e2e/content/faq.spec.ts`, `contact.spec.ts`,
  `links.spec.ts`, every device project, a guest) read the live pages (the order, the keyboard,
  the chips, the Persian search, a deep link; the subjects, the details, the redirects; the
  theme, the shell's absence, the focus ring) and answer every contact POST and the subject
  list read again themselves (a real message is a permanent row in the inbox);
  `E2E_LIVE_CONTACT=1` sends one message for real (desktop only, once). A post's spec (`tests/e2e/blog/post.spec.ts`,
  every device project, a guest) reads the article, its table of contents, the comments with the
  shop's answer and the Q&A tab, and a real 404; it counts the views of one post per project
  (`airfryer-vs-oven`, `laptop-for-students`, `smartwatch-health-features`: a load, a click from
  the blog, a reload) and answers the comment form's POST itself (a real one leaves a pending
  comment nobody can take back). Each run counts 2 views of `best-phones-under-30m` and 3 of its
  own post per project, plus the budget guards' 8 loads of `best-phones-under-30m` and the
  accessibility audit's 2 (Plan 5 Task 8). `E2E_LIVE_COMMENT=1` sends one guest
  comment for real instead (desktop only, once: it stays pending for the operator to reject). A guest places one order per run (`tests/e2e/checkout/checkout-place.spec.ts`: a new
  mobile each run, for the guest's unpaid-orders ceiling; the dev backend answers a bank intent
  `400 gateway_unknown` when a gateway is named (the chooser shows), and the page withdraws that
  gateway for itself and tries the other with a press, refused too, until the bank routes close;
  `503 gateway_not_configured` when none is named; two of the 30 an hour of `payment_attempt`)
  and hands it to the `orders` guard (`tests/e2e/support/order-guard.ts`), so the dev database
  keeps no open unpaid order: a fixture whose teardown runs however the test ends (a timeout
  included), with request contexts of its own, cancels every payment attempt the test opened and
  every order it handed over (a guest's through its link, the token taken from any 2xx placement
  before anything is asserted; an account's from that account), and fails when one could not be
  cancelled; an order left on purpose (`keep`) is only named. The payment link
  journey (`tests/e2e/checkout/pay-link.spec.ts`) places one more guest order through the BFF
  (`support/guest-order.ts`, no intent), opens its link as the SMS spells it (no trailing slash:
  the 308 keeps the token), refuses the bank as above, opens a card-transfer attempt, resumes and
  abandons it on the link, reads that cancelled attempt's real status on the bank's return page
  (`/payment/callback/`), measures the link's pages, and cancels the order through the page's
  dialog (the `orders` guard cancels it when the test ends earlier): four `payment_attempt` calls,
  about ten `order_payment_link` calls and one payment status read per run. Its budget lines
  print `/order/pay/<token>/`, never the token. The card-transfer journey
  (`tests/e2e/checkout/card-transfer.spec.ts`) places one more guest order, opens a live card
  attempt from its link page, checks the live cards, their copy buttons and the attempt's
  cut-off, fills the receipt with a 400×400 PNG (`tests/fixtures/receipt-400.png`) and MOCKS its
  upload, then the `orders` guard cancels the attempt and the order: two `payment_attempt` calls
  and four `payment_status` reads per run. `E2E_LIVE_RECEIPT=1` sends that receipt for real
  instead (Plan 4 Task 10 ran it once: order 8492370249; the final fix wave once more: order
  5572290917, both left under review; `payment_receipt_upload` is ten an hour). Its multipart
  body is read through a route that sends it on unchanged: a `request` listener gets no body for
  a request holding a file (that one run failed there, after the server had taken the receipt).
  It is opt-in
  because a live upload moves the order to «در انتظار بررسی», which neither the customer nor the
  link can cancel: every such run leaves one order in the dev database for the shop's operator
  to reject (its code is printed; the guard cancels the order as usual until the receipt is
  taken). The page's other states
  (`card-transfer-states.spec.ts`, every device project) come from mocked answers, a real PNG
  decoded by the browser included. The return page's other states
  (`tests/e2e/checkout/payment-result.spec.ts`, every device project, a guest, no backend write)
  come from a status mocked in the browser (`page.route`), the polling schedule on Playwright's
  fake clock: the dev backend cannot run a bank. The guest's pay-on-delivery journey
  (`tests/e2e/checkout/guest-cod.spec.ts`) fills a guest cart past peyk Tehran's free line with
  a sample coupon (`TEA30`, else `FREESHIP`: `tests/e2e/support/sample-coupon.ts`), checked
  against the API's fields for whichever it took. The sample codes run out (2026-10-28 and
  2026-11-12) on a backend the suite only reads: with neither taken, the run says so in its
  annotations and goes on without a coupon (`E2E_COUPONS` replaces the codes). Then Tehran, the
  default courier with «پرداخت در محل» (nothing charged online), and it places the order. The checkout's own
  confirmation intent is held in the browser: a confirmed pure pay-on-delivery order is «در حال
  انجام» at once, which no customer can cancel, so the thanks page shows it awaiting confirmation,
  with its code and its link; tracking with the code and the receiver's mobile finds it, and the
  link page's dialog cancels it (the `orders` guard otherwise). The wallet purchase
  (`tests/e2e/checkout/user-wallet.spec.ts`, shirin) is opt-in, `E2E_LIVE_WALLET_ORDER=1`, for
  the same reason: a wallet payment settles at once and the order is «در حال انجام», so the money
  stays spent and the order stays (her balance is asserted less exactly the order's online
  amount; the code and the amount are printed). Plan 4 Task 10 ran it once: order 1557203863,
  268,000 Toman from her wallet (45,170,000 → 44,902,000), and that run failed its last check (a
  console 404 `cart_not_found` on the placement, fixed in 411a832); the final fix wave's run
  passed: order 8152445742, 268,000 Toman (44,902,000 → 44,634,000). «خرید دوباره» on one of
  shirin's delivered orders
  (`orders-journey.spec.ts`) fills her cart and its toast leads there; the `shirin` guard
  (`tests/e2e/support/shirin-guard.ts`, her shared session, no login of its own) puts her cart
  and address book back exactly, as the `kamran` guard does his (both through
  `tests/e2e/support/account-guard.ts`: a snapshot in `tests/e2e/.state/` until the restore is
  verified). A full routine run's writes (Plan 4 Task 10, from the backend's log): 6 orders placed
  (4 guests': checkout-place, pay-link, card-transfer, guest-cod; 2 of k.yazdi's:
  checkout-signed-in, orders-journey), all 6 cancelled; 8 payment intents (2 card-transfer
  attempts opened, 6 refused by the dev bank) and 2 attempt cancels (`payment_attempt`, 30 an hour:
  8 a run for the guests' address, 2 for k.yazdi); 1 coupon applied (and 3 codes refused by the
  cart spec); 7 tracking lookups (6 by the tracking spec, 1 by guest-cod); 2 reorders (k.yazdi,
  shirin); 1 wallet top-up the dev bank refuses and 1 withdrawal filed and cancelled (shirin); no
  receipt upload, no wallet spend; 29 auth attempts; carts and address books restored. Each opt-in run adds one order it cannot
  take back: a receipt under review, or a wallet-paid order. A failure the
  dev backend gives by design is forgiven by its status (`forgiveFailure(page, url, status)` in
  `watch-errors.ts`). Playwright skips it when a project before it failed, and a filter on the command line
  does not drop its dependencies (one journey file still runs the three device suites first):
  `pnpm test:e2e:journeys` (`--project=journeys --no-deps`) runs the journeys alone. An already running server on the base URL is reused;
  `E2E_BASE_URL` points elsewhere. One full run makes about 1,900 API requests (Plan 4 Task 10),
  about 700 of them anonymous (estimated from the throttle's own window when it ran out), all from
  one address, and the sample backend allows 2000 an hour per address (`THROTTLE_ANON`, a sliding
  hour): two full runs an hour at most (about 1,400 of the 2,000), fewer with local browsing
  (Task 10's third run within an hour met the 429 midway). Past that the backend answers 429
  `throttled` (`retryAfter` in the server log) and many specs fail at once. For back-to-back runs,
  start the backend with a larger budget, e.g. `THROTTLE_ANON=20000/hour`. A global setup
  (`tests/e2e/global-setup.ts`) probes the backend once before the run (one anonymous read) and
  stops it with that advice and the wait (`Retry-After`, or the body's `retry_after`) when the
  answer is already 429. The API tells nothing of the budget left before it refuses, so the setup
  also keeps the start of every full run (no file, project or grep filter) in a ledger,
  `tests/e2e/.state/full-runs.json` (`tests/e2e/support/anon-budget.ts`), and stops a third full
  run within the hour at once with «Wait N s»; `E2E_SKIP_ANON_LEDGER=1` skips the ledger (a larger
  budget). Focused runs and browsing are not in it: the probe still catches a budget they used
  up. The dev backend runs on SQLite: two projects writing
  carts at the same moment can meet «database is locked» (a 500). Every spec that writes a cart
  through the UI does it with `cartWrite` (`tests/e2e/support/cart-write.ts`): a 500 that the
  backend's log (`FIREFLY_BACKEND_LOG`, by default `/tmp/backend.log`) shows as that lock, and
  that left the cart unchanged (read again through the BFF), is logged as a warning and the
  visitor's action is repeated once; any other failure fails the test. A cart write a test makes
  itself (the checkout budget's seed line) goes through `requestCartWrite`, the same guard. No
  retry in app code. The same log proves three counts in `tests/e2e/seo-urls.spec.ts` (the
  tracking parameters' one cache key, the past-the-end page's negative cache, one `search/` per
  results page). Without the file those three skip on a developer's machine, but fail with a
  message where the run must prove them: with `CI` set or `E2E_REQUIRE_BACKEND_LOG=1`
  (`tests/e2e/support/backend-log.ts`).
- **Signed-in specs** (Plan 3). Every login, and every logout, is one `auth_attempt` at the
  backend, 20 a minute per address for the whole run (the BFF forwards the visitor's address), so
  specs never log in per test or in a loop (`tests/e2e/support/session.ts`, which counts a full
  run's attempts: 29). Measured from the backend's log, Playwright's project-by-project order kept
  them to at most 8 in any minute of a run (Plan 4 Task 2; 5 before the journeys project gained
  the signed-in checkout; 10 in Plan 4 Task 10, all in the minute the journeys' 11 log in and
  out) and 9 across two runs back to back (Plan 3); that is the
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
- **Accessibility audit** (Plan 5 Task 8; spec §7.1, WCAG 2.1 AA). `tests/e2e/a11y.spec.ts` runs
  axe-core (`@axe-core/playwright`, `tests/e2e/support/axe.ts`) on every page type, on a phone and
  a desktop: home, category, product, the cart empty and with a line, the checkout's receiver step
  and review (this context's own guest cart, cleared after), login, register, the account
  dashboard (sara's shared session, read only), the blog home, one post (`POST_PATH`: two views a
  run), a content page, FAQ, `/contact-us/`, `/links/`, order tracking, both 404 shells and
  `/offline/`; `a11y-overlays.spec.ts` the same with the search and its suggestions, quick view,
  the phone's filter sheet, the mega-menu and the mini-cart open. A `serious` or `critical`
  violation of the WCAG 2.0/2.1 A and AA rules fails the test; every finding is printed
  (`[axe] …`). No rule is ever turned off; third-party embeds (Google's sign-in iframe, the
  linker's video players) are excluded element by element. `checkout/checkout-stability.spec.ts`
  sums a guest checkout's own layout shifts (under 0.1), and `cart/badge-bump.spec.ts` reads the
  cart badge's animation after an add under both motion settings.
- **Lighthouse** is not part of `pnpm test:e2e`: `node scripts/lighthouse.mjs` (Lighthouse's CLI
  through npx, its version pinned in the script; the browser from `CHROME_PATH`, by default the
  preinstalled Chromium) runs home, a category, a product, the one post and a guest's `/checkout/`
  three times each at its mobile defaults (simulated throttling) against `BASE_URL`, writes the
  JSON reports to the system's temp folder and prints the median of each score and metric
  (`scripts/lighthouse-summary.mjs`, unit-tested). Targets: Performance 85, Accessibility,
  Best Practices and SEO 95 (the checkout's SEO is its intended noindex).
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
