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
  store config, i18n (operator overrides merged over `fa.ts`), session flag, feature switches,
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
  `401 token_not_valid`/`authentication_failed`) and retries once;
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
  request is proxied as usual. The response keeps `Cache-Control: no-store`, sets no cookie and is
  byte-for-byte the body the proxied read would give. Cost: the empty-cart shape may be up to 60 s
  stale.

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
| `ff_auth` | `1` while `ff_rt` exists: lets the UI know instantly that a session exists | no | same as `ff_rt` |

All are `Path=/`, `SameSite=Lax`, and `Secure` when `SITE_URL` is https. Helpers:
`COOKIE`/`cookieOptions` (`lib/auth/cookies.ts`); delete with `cookieOptions(key, 0, secure)`.
JWTs never reach browser JavaScript. `proxy.ts` refreshes an access token that is missing or expires
within 30 s before Server Components run, sets the new cookie on the response and rewrites the
forwarded `Cookie` header so the current render already sees it; a rejected refresh token clears
every session cookie; a network failure keeps the cookies and renders.

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
  handlers; links that open a dialog instead also carry `data-opens-dialog`), completes when the
  path or query on screen changes, gives up after 10 s, sets `aria-busy` on `<main>` meanwhile, and
  is a static bar under reduced motion.
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
  overlay stopped preloading on idle.
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
- **Product cards.** A card's heart, compare toggle, quick view icon and add slot are one client
  island (`CardActions`), not four: they read their grid's or rail's `CardScope` (one hydration
  flag, one wishlist-ids query and one compare-list subscription for every card), and the heart
  and the add button create their mutation only when pressed (`toggleWishlistOnce`,
  `addToCartOnce`). A card outside a grid or rail brings its own scope. The single buttons
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

## Folder conventions

```
src/
  app/                     routes only; (shop)/ has the header+footer layout; _shell/ holds
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
  next to it, exactly like the Docker image — against the local backend with sample data
  (`http://localhost:8000`). Three projects: `mobile` (Pixel 7), `tablet` (iPad landscape, Chromium)
  and `desktop` (1440×900). Specs that hit counted endpoints or check viewport-independent behaviour
  (edge, snippets) run in one project only. An already running server on the base URL is reused;
  `E2E_BASE_URL` points elsewhere. One full run makes about 220 anonymous API requests (about 400
  before the BFF served a guest's empty cart from a shared copy), all from one address, and the
  sample backend allows 2000 an hour per address (`THROTTLE_ANON`, a sliding hour): about eight
  runs an hour, fewer with local browsing. Past that the backend answers 429
  `throttled` (`retryAfter` in the server log) and many specs fail at once. For back-to-back runs,
  start the backend with a larger budget, e.g. `THROTTLE_ANON=20000/hour`. A global setup
  (`tests/e2e/global-setup.ts`) probes the backend once before the run and stops it with that
  advice when the answer is already 429.
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
