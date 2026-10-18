# Firefly Storefront — Design

Date: 2026-10-15 · Status: draft for approval

This document describes the storefront (customer-facing website) for the **Firefly Core** backend
(`yashar-ahmadi/firefly_core_backend`, branch `develop`). The backend is a Django REST API. It also renders
its own admin panel, so the admin panel is **not** part of this project. Every customer-facing feature the
API offers must work in this storefront.

The exact API contracts (endpoints, response shapes, error codes, gotchas) are in
[`docs/backend-integration/`](../../backend-integration). Those digests were written from the backend's
38 Persian guides and checked against a live backend with the sample data. This document decides
*what* we build and the important *how*. The digests are the reference for every field.

---

## 1. Intent

One storefront codebase, deployed separately for each shop. The current shops are a mobile-phone and
gadget shop, a seed and fertilizer shop, a board-game shop, a carpet shop and a building-paint shop. Each
shop has its own backend, database and domain.

The storefront must:

- feel familiar to Iranian shoppers (Digikala-style structure) without copying anyone's look;
- be simple enough for shoppers of every age, with the fewest possible clicks to reach a goal;
- be modern, beautiful and animated, but never at the cost of speed or clarity;
- be fully responsive, with a mobile-first experience equal in quality to desktop and tablet;
- be complete on SEO, following both the backend's SEO contract and current search-engine practice;
- be production-grade: clean, documented, tested and easy to extend.

## 2. Decisions taken with the owner

| Topic | Decision |
|---|---|
| Git | Commit and push directly to `main` of `firefly_core_front`. |
| Multi-store model | **One deployment per shop.** Each shop has its own backend and domain. The look is chosen by configuration: a preset plus overrides. |
| Language | **Persian only**, RTL. Interface labels can be overridden from the backend translation dictionary (`/global/get-translation/fa/`), so the operator can rename labels from the panel. |
| Colour scheme | **Light only**, no dark mode. |
| Frontend-only extras | **Product comparison**, **recently viewed**, **PWA** (installable, offline page) and **quick view**. |
| Font | **Vazirmatn** (self-hosted). The font is configurable, so a licensed font such as IRANYekanX can replace it later. |
| Map in address form | **Neshan** when a Neshan web key is configured, otherwise **OpenStreetMap**. |
| Visual tone | **Familiar but independent.** Iranian-familiar structure with our own identity: clean white surfaces, rounded cards, soft shadows, subtle motion. Each shop preset has its own colour and character. |

## 3. Goals, non-goals, anti-goals

**Goals**

- Cover every storefront-facing backend capability. Section 8 is the checklist.
- Make each page's main task obvious and reachable in at most one or two taps from where the user is.
- Keep personal data private, keep the API key off the browser, and keep tokens out of JavaScript.
- Perform well: LCP under 2.5 s on 4G for home, listing and product pages; CLS under 0.05; JavaScript kept
  small through Server Components first and client components only where interaction needs them.
- Make customisation clear: one config file plus environment variables per shop, with no code changes to
  open a new shop.

**Non-goals**

- The admin panel. It stays in Django.
- Multi-tenant hosting, where one storefront process serves several shops.
- Content in more than one language. The backend has none.
- Native apps.

**Anti-goals** (any of these makes the project a failure even if it "works")

- A shop that looks like a Digikala clone.
- An interface that needs explanation, for example icon-only actions without labels on primary paths, or
  hidden gestures as the only way to do something.
- A beautiful site that is slow on a mid-range Android phone on Iranian mobile internet.
- Showing a price, stock state or total that the backend did not compute. The cart and order totals always
  come from the API.
- Leaking the API key or JWT tokens to client-side JavaScript.

## 4. Constraints from the backend (summary)

These come from the backend guides. Details are in the integration digests.

- Every API call needs `X-API-Key`. JWT access tokens live 15 minutes. Refresh tokens do **not** rotate and
  hard-expire after 7 days, or 30 days with "remember me". Change-password returns a new pair.
- Guest carts are identified by `X-Cart-Token`, which the server returns as `data.token`. After login the
  guest cart is merged with `POST /cart/merge/`.
- Responses use an envelope `{ msg, code, data }`. Errors are `data.errors[] { code, detail, attr }`. Branch
  on `code`; show `detail`. `429` carries `data.retry_after`. `503 feature_disabled` means the operator
  switched a feature off: hide that feature and never auto-retry.
- Ten features can be switched off at runtime: blog, blog comments, product comments, stock notifications,
  coupons, pay on delivery, online payment, wallet, guest checkout and registration.
- Prices are integer Toman. Dates are ISO with offset; Jalali conversion is the client's job.
- **Rate limits are per client IP for guests.** All storefront server traffic comes from one IP. The backend
  must list the storefront server in `TRUSTED_PROXY_IPS`, and the storefront must forward the visitor IP in
  `X-Forwarded-For`. This is backend *configuration*, not a code change, and is part of the deployment guide.
- Image URLs in API responses are built from the request Host. The storefront must call the backend on its
  **public** origin.
- The backend assumes these storefront URLs, all with a trailing slash: `/product/<slug>/`,
  `/product-category/<path…>/`, `/product/list/` (generic listing that takes product-list query params),
  `/product/list/<slug>/`, `/brand/<slug>/`, `/blog/`, `/blog/<slug>/`, `/blog/category/<path…>/`,
  `/page/<slug>/`, `/s/<code>`, `/order/pay/<token>`, the payment result page (`/payment/callback/` in the
  sample data, set in the panel), `/sitemap.xml`, `/robots.txt`, and the bank-callback path
  `/api/v1/payment/gateway/callback/<gateway>/<token>/`. The storefront must forward that last path to the
  backend. The sample data also links `/contact-us/`, and robots disallows `/cart/` and `/checkout/`.
- JSON-LD from the backend uses `https://SITE_DOMAIN/...`, including `/media/` and `/static/`. So
  `SITE_DOMAIN` must be the storefront domain, and the storefront must forward `/media/` and `/static/` to
  the backend.
- There is no backend-to-storefront revalidation webhook. Freshness is time-based.

## 5. Architecture

### 5.1 Stack

- **Next.js 16** (App Router, React Server Components, `proxy.ts`), **React 19**, **TypeScript** (strict).
- **Tailwind CSS v4** with CSS-variable design tokens. Accessible primitives from **Radix UI**.
  **Embla** for carousels (RTL-aware, light). **Motion** for animation. **Sonner** for toasts. **Vaul** for
  mobile bottom sheets. **lucide-react** for icons.
- **TanStack Query** for client-side server state (cart, auth user, wishlist, account data) and **Zustand**
  for small client stores (compare, recently viewed, UI). **react-hook-form + zod** for forms.
- **Leaflet**, with Neshan tiles when keyed and OpenStreetMap otherwise.
- Native `Intl` for Persian digits, Toman formatting and the Jalali calendar (`fa-IR-u-ca-persian`). No
  date library is needed for display.
- Tests: **Vitest + Testing Library** (unit and component) and **Playwright** (end-to-end against a real
  backend with sample data, on mobile, tablet and desktop viewports).
- Package manager: **pnpm**. Output: `standalone`, shipped as a Docker image.

### 5.2 Request topology (BFF)

```
Browser ──► Next.js (storefront domain)
              ├─ Server Components ──► Firefly API (server-side; API key added)
              ├─ /api/bff/** (route handler) ──► Firefly API   (browser actions: cart, auth, account…)
              ├─ proxy.ts: redirects, token refresh, short links, forwards
              │      /api/v1/payment/gateway/callback/**, /media/**, /static/**, /sitemap.xml ──► Firefly
              └─ /robots.txt, /s/<code> (route handlers)
```

- The browser **never** calls the Firefly API directly. The API key is a server-only environment variable.
- **BFF route** `/api/bff/[...path]`. It forwards an allow-listed set of API paths. It adds `X-API-Key`,
  `Authorization` (from the httpOnly access-token cookie), `X-Cart-Token` (from the httpOnly cart cookie,
  for guests), `Idempotency-Key` (passed through) and `X-Forwarded-For` (the visitor IP from the trusted edge
  header). It also:
  - refreshes the access token once on `401 token_not_valid`, or before the call when the token is expired,
    then retries;
  - takes `data.tokens` out of auth responses, stores them as httpOnly cookies, and removes them from the
    body the browser receives;
  - stores `data.token` from guest cart responses in the cart cookie, and drops it after a merge;
  - clears cookies on logout, `user_inactive` or `user_not_found`;
  - streams multipart uploads (avatar, card-transfer receipt);
  - protects against CSRF: non-GET requests must come from the same origin (`Origin` check) and carry a
    custom header. Cookies are `SameSite=Lax`.
- **Cookies:** `ff_at` (access token, 15 min), `ff_rt` (refresh token, 7 or 30 days depending on
  remember-me), `ff_cart` (guest cart token). All are httpOnly, `Secure` in production and `SameSite=Lax`.
  A non-sensitive `ff_auth=1` flag tells the UI instantly that a session exists.
- **`proxy.ts`** runs on page requests. It:
  1. resolves backend redirect rules (`/redirects/resolve/`, never cached), and answers 301, 302 or 410;
  2. refreshes an expired access token before Server Components run, so account pages render with a valid
     token;
  3. forwards the bank callback, `/media/`, `/static/` and `/sitemap.xml` to the backend with paths and
     methods kept intact.

  Its matcher excludes `_next`, assets and the BFF.

### 5.3 Rendering and caching

- **No build-time dependency on the API.** The Docker image builds without any backend reachable, and all
  shop configuration is read at **runtime**. The one exception is the image host allow-list for
  `next/image`, which Next.js reads at build. It comes from the `FIREFLY_API_URL` build argument.
- Pages are rendered on the server per request. Public API data is cached in Next's Data Cache
  (`fetch` with `next.revalidate` and `next.tags`) with per-resource lifetimes, for example: settings, menus
  and feature status 300 s; homepage 60 s; product detail 60 s; listings 60 s; blog 300 s; pages 300 s.
  React `cache()` deduplicates within one render, so metadata and page share one request.
- **Never cache** user-specific responses or counted endpoints: cart, account, search (logged), redirects
  resolve, short links, payment status. **Do not refetch blog post detail** more than once per render: the
  backend counts a view on every GET.
- Personalised bits on public pages are hydrated in the client through the BFF and TanStack Query, so the
  public HTML stays cacheable and identical for everyone. These bits are wishlist hearts, the cart badge, the
  user menu and reading-list badges.
- Streaming with `loading.tsx` and Suspense skeletons on heavy pages.

### 5.4 API client layer

`src/lib/api/` contains one typed client:

- `server.ts` (`server-only`): `apiFetch<T>(path, { method, body, token, cartToken, revalidate, tags,
  forwardedFor })`. It always appends the trailing slash, checks `Content-Type` before parsing, handles 204,
  unwraps the envelope, and throws a typed `ApiError { status, code, errors, detail, retryAfter, feature }`.
- `client.ts`: the same contract, calling `/api/bff/...` from the browser.
- `endpoints/*.ts`: one typed module per domain (`catalog`, `cart`, `checkout`, `order`, `payment`,
  `wallet`, `account`, `auth`, `content`, `blog`, `faq`, `dashboard`, `notification`, `settings`, `seo`).
  Each function is used by both server and client code through a small transport parameter, so contracts are
  written once.
- `types/*.ts`: response types taken from the digests and the OpenAPI schema. Where the schema and real
  responses disagree, the real responses win; the digests note each disagreement.
- Error presentation helpers: `fieldErrors(err)` maps `attr` (including dotted names such as
  `receiver.mobile` and `non_field_errors`) onto form fields. `toUserMessage(err)` gives one Persian sentence.

### 5.5 Project structure

```
src/
  app/                     # routes only: thin pages that compose feature components
    (shop)/                # header + footer layout: home, catalog, product, blog, pages, cart…
    (checkout)/            # minimal header layout: checkout, payment result, pay-link
    (auth)/                # auth pages (login, register, forgot password)
    account/               # customer dashboard (auth-guarded layout)
    api/bff/[...path]/     # BFF
    robots.txt/ s/[code]/ manifest.ts sitemap proxy …
  features/                # one folder per domain: components, hooks, server loaders, utils
    catalog/ product/ cart/ checkout/ payment/ auth/ account/ wallet/ orders/
    content/ (home sections, menus, rich text, pages) blog/ faq/ search/ compare/ recently-viewed/
    notifications/ contact/ linker/ seo/ pwa/
  components/
    ui/                    # design-system primitives (Button, Input, Sheet, Dialog, Tabs, Price…)
    layout/                # Header, MegaMenu, MobileNav, Footer, Breadcrumbs, AnnouncementBar
  lib/                     # api client, formatting (fa digits, toman, jalali), cookies, env, utils
  config/                  # runtime env schema (zod), store config, theme presets
  styles/                  # globals.css (Tailwind v4 @theme, tokens), rich-content.css
tests/
  unit/ e2e/               # vitest + playwright
docs/
  backend-integration/     # API digests (contracts and gotchas)
  superpowers/             # specs and plans
  CUSTOMIZATION.md DEPLOYMENT.md ARCHITECTURE.md BACKEND-ISSUES.md
```

Conventions: Server Components by default and `"use client"` only at interaction leaves. Feature folders own
their components. `app/` files only compose them. Named exports. Absolute imports through `@/`. No component
file over about 250 lines.

## 6. Multi-store theming and customisation

### 6.1 What comes from the backend (operator-managed in the panel)

Store name, slogan, logo, alternate logo, favicon, phone numbers, email, address, map link, support hours,
footer text, copyright, announcement bar, terms and legal-age texts, app download links, social links, menus
(`main`, `header`, `footer`, `blog-sidebar`), homepage sections, linker page, content pages, dynamic content
blocks, extra snippets (analytics and pixels, placed by position), robots, redirects, short links, auth
methods, feature switches, dashboard banners, and interface-label translations. The storefront renders all of
these. A missing value hides its slot gracefully instead of leaving a gap.

### 6.2 What comes from the storefront (developer or deployer managed)

`src/config/store.config.ts` defines typed defaults. Runtime environment variables override them per
deployment, validated by zod at boot.

| Variable | Purpose |
|---|---|
| `STORE_PRESET` | `default` · `digital` · `agro` · `boardgame` · `carpet` · `paint` |
| `THEME_PRIMARY`, `THEME_ACCENT` | brand colours (hex). The full 50–950 scale is generated in OKLCH. |
| `THEME_RADIUS` | `sm` · `md` · `lg` · `xl` |
| `THEME_FONT` | `vazirmatn` (default) · `custom` (a licensed `font.woff2` placed at `public/fonts/custom/font.woff2`) |
| `NESHAN_MAP_KEY` | enables Neshan tiles and search; otherwise OpenStreetMap |
| `FIREBASE_*` | optional web push (see 8.12) |
| `FEATURE_COMPARE`, `FEATURE_QUICK_VIEW`, `FEATURE_RECENTLY_VIEWED`, `FEATURE_PWA` | frontend extras on or off |

**Presets.** Each preset sets colour, radius, shadow softness, motion liveliness, card style, hero style, an
empty-state illustration tone and a few copy defaults.

- `digital` (phones and gadgets): crisp blue with an orange "deal" accent, crisp shadows, compare prominent.
- `agro` (seeds and fertilizer): fresh green with a warm earth accent, softer shapes, flat cards.
- `boardgame`: playful violet with a sunny yellow accent, larger radius, livelier micro-interactions.
- `carpet`: deep burgundy with a gold accent, generous whitespace, calm motion, premium tone.
- `paint`: teal with a coral accent, livelier motion. The variant picker on the product page shows colour
  swatches.
- `default`: indigo with an amber accent.

Presets are data, not code branches. A new shop type means one new preset file.

**Ruling (images):** every product, gallery and variant image the backend exposes is a 500×500 square crop,
and there is no larger original. Product frames are therefore always **square** in every preset, there is no
per-preset image ratio, and the lightbox shows images at their natural size, with no zoom beyond it. Brand
logos are 70×70. Larger images would need a backend change. This is reported in `BACKEND-ISSUES.md`.

### 6.3 Mechanism

The root layout reads the resolved runtime config and writes CSS custom properties
(`--brand-50 … --brand-950`, `--accent-*`, `--radius-*`, `--shadow-*`) into a `<style>` tag. Tailwind v4
`@theme inline` maps utilities (`bg-brand-600`, `rounded-card`…) to these variables. No rebuild is needed to
change colours. Client components receive the non-secret config through a React context provider.

## 7. Experience design

### 7.1 Principles

- **Familiar structure:**
  - desktop: sticky header with a large central search, mega-menu from the `main` menu, a short-links row
    from `header`, then the announcement bar;
  - mobile: compact header with search, plus a **bottom navigation** (home, categories, cart with count,
    account).
- **Fewest clicks:**
  - add to cart from cards when a product has a single variant or a default variant;
  - quick view for the rest;
  - for signed-in users with a default address, checkout pre-fills the destination and the shop's
    default shipping (the first available option the sender pays for, in the operator's order; with
    none, the user chooses), so the user can pay in one confirmation step;
  - sticky "add to cart" and "continue" bars on mobile;
  - remembered sort and filter state in the URL.
- **Readable for everyone:**
  - 16 px minimum body text, 44 px touch targets, high-contrast text (WCAG AA);
  - labelled icons on primary actions, plain Persian wording, clear empty and error states with a next step;
  - no auto-advancing carousels without pause; motion respects `prefers-reduced-motion`.
- **Numbers the Iranian way:** Persian digits everywhere, `٬` thousands separator, «تومان» suffix, Jalali
  dates (for example «۲۴ مهر ۱۴۰۵»), relative times where they help, mobile numbers shown as `۰۹۱۲ ۱۲۳ ۴۵۶۷`.
  Inputs accept Persian, Arabic or Latin digits and normalise them.
- **Motion with purpose:**
  - fade and slide on route segment changes;
  - spring feedback on add-to-cart (the badge bumps, a mini-cart toast shows the line);
  - skeleton shimmer while loading; smooth sheet and drawer transitions;
  - carousel momentum; animated countdowns on timed discounts; the heart animates on wishlist.
  - View Transitions are used where supported, for example product image to product page.
- **Accessibility:** semantic landmarks, focus rings, keyboard-reachable menus, `aria-live` for cart
  updates, labelled form errors, `lang="fa" dir="rtl"`.

### 7.2 Layout system

Container widths: 100% with a 16 px gutter on mobile and a 1280–1440 px max on desktop. Breakpoints:
`sm` 640, `md` 768 (tablet), `lg` 1024, `xl` 1280. Product grids use 2 columns on phone, 3 on tablet and
4–5 on desktop. Filters show as a sidebar from `lg` up and as a bottom sheet below that.

## 8. Feature scope (every backend capability → storefront)

### 8.1 Global shell

- Header and mega-menu (`menu/main`), header links (`menu/header`), footer columns (`menu/footer`), store
  identity, contact block, socials, app badges, footer text and copyright, and an announcement bar that can
  be dismissed for the session.
- Feature status read on load. Each feature-dependent control is hidden when its feature is off, and
  `503 feature_disabled` is handled everywhere with the operator's message.
- Extra snippets injected at their declared positions (head, body start, body end).
- Interface labels: local Persian dictionary merged with the backend `fa` translation dictionary.
- Global error boundary, `not-found` page (with search and popular categories), and offline page (PWA).

### 8.2 Home (`/`)

Renders the backend homepage sections in order: `slider`, `banner_group`, `product_carousel`,
`category_grid`, `post_carousel` and `rich_text`. Unknown types are skipped. Each section links "see all" by
the backend rules. The first image is the LCP image. SEO comes from the homepage fields. Extras: a recently
viewed strip, shown only when non-empty.

### 8.3 Catalog

- **Category** `/product-category/<path…>/`. Fetch by the last slug and canonicalise to `data.path` with a
  308 when they differ. Show the header with image and short description, sub-category chips, the product
  grid, filters (price range, brand, attributes, in stock, discounted, special), sorting, pagination with
  real links plus a "load more" enhancement, rich content below the fold, and breadcrumbs with JSON-LD.
- **Brand** `/brand/<slug>/`, **curated list** `/product/list/<slug>/`, **generic listing**
  `/product/list/?…` (forwards allow-listed query params; `noindex, follow`) and **brands index**
  `/brand/`.
- Product card. It shows **only the data the list API returns**, with no extra request per card: image,
  badge, discount percent, timed-discount countdown, rating, price with strike-through, in-stock state, the
  representative variant's attribute labels as small chips (for example «۲۵۶ گیگابایت»), wishlist heart,
  compare toggle and quick view.
- **Ruling (one-tap add):** a `simple` product adds to cart directly from the card. A `variable` product
  opens quick view with the representative variant preselected, so the shopper always sees which variant they
  are buying. That costs one more tap and never adds a variant the shopper did not see.

### 8.4 Product page `/product/<slug>/`

- Gallery: swipe on mobile, thumbnails on desktop, lightbox with zoom and pinch.
- Title, brand, categories, rating summary, badge, short attributes.
- **Variant picker** following the backend algorithm: an exact-set match on attribute values; colour
  swatches for colour attributes; unavailable combinations disabled but explained.
- Price box: final price, original price and discount percent, a timed-discount countdown, order minimum
  and maximum, a quantity stepper, add to cart, and buy now (add and go to checkout).
- **Ruling (wholesale):** checkout never applies wholesale prices, so the storefront never shows a wholesale
  price. For products with wholesale enabled, it shows a note: «برای خرید عمده (از N عدد) با ما تماس
  بگیرید», with the store phone. This follows the backend guide's own recommendation.
- Out of stock: "notify me when available" (backend rule: only when no variant is buyable; feature
  `stock_notifications`).
- Tabs or sections: description (rich HTML), specifications table, reviews (rating breakdown, sorting,
  replies, owner answers, buyer badge, submit), questions and answers, collection or bundle items, related
  products, and recently viewed.
- Wishlist, compare, share (Web Share API with copy-link fallback).
- Mobile: a sticky bottom bar with price and add to cart.
- SEO: metadata from the backend SEO fields; backend JSON-LD (Product and BreadcrumbList) embedded safely.

### 8.5 Search

- Header search with suggestions (250 ms debounce, at least 2 characters, request cancellation; products,
  categories and brands with images). On mobile it opens as a full-screen overlay with recent searches stored
  locally.
- Results page `/search/?q=` with the five groups (products, categories, brands, posts, pages) and "see all"
  links. The search API is called only on submit.

### 8.6 Cart `/cart/`

- Guest and user carts. Lines with image, variant attributes, stepper honouring limits, remove, price
  changes, issue states, and once-only notices (merge adjustments, detached coupon).
- Coupon apply and remove (feature `coupons`).
- Summary: every amount straight from the API (goods, discounts, shipping, tax, total, savings).
- Empty state with suggestions. Mini-cart drawer from the header.

### 8.7 Checkout `/checkout/` (one page, progressive steps; mobile sticky summary)

1. **Receiver and destination.** A signed-in user picks a saved address (default preselected) or adds one in
   a sheet with map, province and city. A guest fills the receiver form (feature `guest_checkout`; otherwise
   the user is asked to log in, keeping the cart).
2. **Shipping.** Options for this cart with cost, ETA in business days and cash on delivery. The shop's
   default is selected automatically: the first available option, in the operator's order, whose sender
   pays the fare (never a free pickup or a door-paid fare picked silently); with none, the shopper
   chooses. Fares collected at the door are not labelled as free.
3. **Payment method.** Gateway, wallet, wallet plus gateway, card-to-card and pay on delivery, each shown
   only when allowed by the backend and the feature switches. The gateway list is shown when there is more
   than one.
4. **Review and place.** Terms and legal-age checkboxes (texts from settings), `expected_total`, and an
   `Idempotency-Key` per attempt. Then the payment intent is created and the browser is redirected to the bank
   or shown the next step.

The checkout re-validates shipping selection before paying, as the backend clears it on many changes.

### 8.8 Payment and orders

- Bank redirect (GET or form-POST handoff), the result page at `/payment/callback/` (reads
  `/payment/<uuid>/status/`; never trusts query params; polls while pending, no more than every 15 s with
  backoff), card-to-card instructions with receipt upload, wallet payment, pay on delivery, payment links
  `/order/pay/<token>`, and guest order tracking `/order/track/`.
- **Pure pay-on-delivery orders** (online amount 0) are confirmed by creating a `pay_on_delivery` intent
  right after placement. Otherwise they auto-cancel after 72 h. Any non-zero online share is paid online
  first.
- Before redirecting to a bank, the context (payment uuid, order code or uuid, link token, kind) is saved in
  `sessionStorage` and a short-lived cookie, so the result page can offer the right next action.
- An open payment attempt (`409 payment_attempt_open`) offers "continue" or "abandon".
- The same result page handles wallet top-ups.
- The exact flows follow `order-payment.md`.

### 8.9 Authentication (`/login/`, `/register/`, `/forgot-password/`)

Forms are built **only** from `auth-settings`:

- password login by email or phone;
- OTP login by email, SMS or Telegram as enabled;
- Google sign-in when enabled (Google Identity Services);
- registration (start, verify OTP, complete) by the enabled methods;
- the TOTP second step when `requires_totp`;
- password reset (request, verify OTP, confirm).

OTP inputs use six boxes with auto-advance and paste support, show resend countdowns from the API, and
normalise Persian digits. "Remember me" sets the session length. After login the guest cart is merged and the
user returns to where they were.

### 8.10 Account `/account/…` (the nine backend pages plus notifications)

| Page | Contents |
|---|---|
| Dashboard | Summary counters, wallet, recent purchases, dashboard banners |
| Orders | Tabs from `summary.orders.groups`, list, detail (items, timeline, shipping, payments, QR code), cancel, pay again, buy again |
| Profile | Name, avatar upload, birthday and other fields; password change; email and phone change with OTP; TOTP 2FA setup, enable and disable with QR; logout from all devices |
| Wishlist | List, remove, add to cart |
| Addresses | CRUD, default address, map picker |
| Wallet | Balance, frozen state, transactions (filters), top-up (gateway), withdrawals (request, cancel, list), payment history and detail |
| Reading list | Saved blog posts |
| My comments | All three subject types, status, withdraw |
| Awaiting review | Delivered purchases waiting for a review; submit review |
| Notifications | Inbox with read state, unread badge, mark read and mark all read; optional web push opt-in |

Sidebar badges come from one summary call. The layout is a sidebar on desktop and a list hub with sub-pages
on mobile.

### 8.11 Content

- Blog home, post list, category pages, post detail (TOC from headings, reading time, author, comments and
  questions, reading-list toggle, related posts, JSON-LD) and the `blog-sidebar` menu.
- Content pages `/page/<slug>/` with three layouts and comments.
- FAQ `/faq/` (accordion grouped by category, FAQPage JSON-LD).
- Contact `/contact-us/` (form with subjects, honeypot, store contact details, map link).
- Linker `/links/` (link-in-bio page with its own theme from the API).
- Dynamic content blocks, for example terms and return policy, wherever the storefront defines slots.

### 8.12 Frontend extras

- **Compare** `/compare/`: up to 4 products of compatible categories, a specification union table with
  "differences only", and persisted locally.
- **Recently viewed**: the last 20 products, stored locally.
- **Quick view**: a dialog on desktop and a bottom sheet on mobile, with gallery, variant picker and add to
  cart.
- **PWA**: dynamic `manifest` from store settings; a hand-written service worker that precaches the offline
  page, caches static assets and images, and uses network-first navigations with an offline fallback.
- **Web push (optional)**: when `FIREBASE_*` variables are set, signed-in users can opt in. Devices are
  registered with `POST /devices/` (type `web`) and unregistered on logout or opt-out. The service worker
  handles click-through to `/account/notifications/`. With no Firebase config, nothing is loaded.

### 8.13 SEO

- `metadataBase` from `SITE_URL`.
- Per page: title template («… | store name»), description, keywords, canonical (backend value or the self
  URL), meta tags from the backend (with `og:` tags as `property`), Open Graph and Twitter fallbacks
  synthesised from page data, and `robots` (`noindex` on cart, checkout, account, auth, search, filtered or
  paginated generic listings, payment pages).
- JSON-LD: backend `structured_data` and breadcrumbs when present, escaped for `<`; otherwise synthesised
  Organization, WebSite with SearchAction, Product, BreadcrumbList, Article, FAQPage and CollectionPage.
- `/robots.txt` from `/robots/` (byte-exact), `/sitemap.xml` forwarded to the backend, redirects and 410s via
  `proxy.ts`, and short links `/s/<code>` as 302.
- `trailingSlash: true`. Persian slugs are safely encoded and decoded. Category paths are canonicalised.
- Server-rendered HTML for all indexable content. Clean heading hierarchy and descriptive `alt` text.

## 9. Testing and quality

- **Unit and component (Vitest):** formatting (digits, Toman, Jalali, phone), env and theme config, the API
  client (envelope, errors, 204, retries), BFF cookie and token handling, variant resolution, filter and URL
  state, cart-summary rendering, form validation, and the compare and recently-viewed stores.
- **End-to-end (Playwright):** against the local backend with sample data, on a mobile (Pixel 7), tablet
  (iPad) and desktop project. Critical journeys:
  - browse home, category, filter and product, then add to cart;
  - search and suggestions;
  - the guest cart, coupon, destination, shipping, then placing an order with pay on delivery or card-to-card;
  - login, cart merge and account pages;
  - address CRUD, wishlist, compare, quick view;
  - blog, pages, FAQ and contact;
  - redirects, short links, robots and sitemap.
- **Checks on every change:** `tsc --noEmit`, ESLint, Prettier, unit tests and build. A GitHub Actions
  workflow runs these on every push to `main`.
- **Ruling (end-to-end tests in CI):** CI does not run Playwright, because it needs a backend with sample data
  and the backend repository is separate. Playwright runs locally against the sample-data backend before each
  push. `docs/DEPLOYMENT.md` explains how.
- **Visual review:** screenshots at 375, 768 and 1440 px for every page type, reviewed by hand.
- **Performance:** Lighthouse runs on key pages with budgets checked.

## 10. Deployment

- Docker multi-stage build (`node:22-alpine`, `output: 'standalone'`, `sharp`). Build argument
  `FIREFLY_API_URL` sets the image host allow-list. Everything else is runtime environment.
- An nginx example in front of the storefront: TLS, the `X-Real-IP` and `X-Forwarded-For` header, gzip and
  brotli, and long-lived caching for `/_next/static`.
- **Required backend configuration for each shop** (environment only, no code change):
  - `STOREFRONT_URL` and `SITE_DOMAIN` set to the storefront domain;
  - `TRUSTED_PROXY_IPS` including the storefront server. If the API sits behind its own reverse proxy, that
    proxy must pass on the storefront's `X-Forwarded-For`, and the proxy's own address must be trusted too.
    `DEPLOYMENT.md` shows both topologies. Cached public fetches carry no visitor IP, so `THROTTLE_ANON`
    should be raised for busy shops.
  - `GATEWAY_RESULT_URL_ALLOWED_HOSTS` including the storefront host;
  - the gateway result URL in the panel set to `https://<storefront>/payment/callback/`;
  - an API key created in the panel for the storefront.
- `DEPLOYMENT.md` documents all of this. `CUSTOMIZATION.md` explains presets and variables.

## 11. Left to the builder

Exact component APIs, animation curves, illustration choices, file names inside feature folders, test file
layout, and the specific skeleton designs, as long as they follow this document and the integration digests.

## 12. Backend issues

Problems found in the backend during research and development are collected in `docs/BACKEND-ISSUES.md` and
reported to the owner. They are not fixed in the backend, because this project may not change backend code.
Where possible the storefront works around them.
