# Firefly Core — storefront digest: SEO edge (robots / redirects / short links / sitemap), SEO fields, caching, deployment

Scope: `storefront-seo.txt` (read completely), `content-seo-backend.txt`, `panel-seo-marketing.txt`, `site-cache.txt`,
`deployment.txt`, plus backend code under `/home/user/firefly_core_backend` (read-only) and live calls to the dev server.

**Dev environment facts (affect every live sample below):** `.env` has `DEBUG=True`, `DJANGO_DEVELOPMENT=True`
(X-API-Key gate OFF), `SITE_DOMAIN=localhost`, `STOREFRONT_URL=http://localhost:3000`, no Redis (site cache OFF).
So live samples show `http://localhost:3000/...` (built from STOREFRONT_URL) and `https://localhost/...` (built from
SITE_DOMAIN). In production both would normally be `https://firefly-core.ir/...`.

Legend: **[live]** = verified against the running server; **[code]** = verified by reading backend source (file:line);
**[doc]** = stated by the Persian guide only.

---------------------------------------------------------------------------------------------------------------------

## 0. The ten things that will bite you

1. **Every SEO-edge behaviour needs a server layer** (Next.js proxy/middleware, route handlers, rewrites, or nginx).
   The API key never goes to the browser (`FIREFLY_API_KEY`, no `NEXT_PUBLIC_`). A pure SPA cannot do 301/302/410,
   short links, or robots/sitemap correctly. [doc]
2. **`trailingSlash: true` in next.config** — every backend-built storefront path ends with `/` (sitemap `<loc>`,
   `get_absolute_url`, menu `url`, JSON-LD). Exceptions that do NOT end with `/`: `/s/<code>` and `/order/pay/<token>`
   (cost: one extra 308 hop). [code]
3. **The storefront host must forward `/api/v1/payment/gateway/callback/<gateway>/<token>/` (GET *and* POST) to
   Django**, with the trailing slash preserved. The bank return URL is literally `STOREFRONT_URL + reverse(...)`
   (`payment/services/intent.py:338`). Missing slash ⇒ Django 301 on GET, **500 on POST** [live]. Without the proxy,
   paid orders only settle via the 15-minute reconcile cron.
4. **Payment result page** = operator setting `GatewaySetting.result_url` (fixture: `https://firefly-core.ir/payment/callback/`),
   Django appends `?result=success|failed|pending&payment=<uuid>&code=<err>`. Its host must be in
   `GATEWAY_RESULT_URL_ALLOWED_HOSTS` or every payment intent fails with `gateway_result_url_invalid` (503) — this is
   currently the case in the dev env [live].
5. **JSON-LD (`structured_data`, `breadcrumb_structured_data`) is built from `https://{SITE_DOMAIN}` — not from
   STOREFRONT_URL and not from the request host** — including image/logo URLs under `/media/` and `/static/`. So:
   set `SITE_DOMAIN` = the storefront's public domain, and make that domain serve (proxy) `/media/` and `/static/`. [live+code]
6. **Image URLs in normal API fields are built from the request `Host`** (`request.build_absolute_uri`). Node's `fetch`
   **silently ignores a custom `Host` header** [verified on Node 22]. If SSR calls Django on an internal hostname
   (`http://web:8000`) every image URL becomes `http://web:8000/media/...`, ALLOWED_HOSTS rejects unknown hosts (400
   DisallowedHost), and with `USE_HTTPS=True` Django 301s plain-HTTP calls to https. ⇒ SSR must call the **public**
   API origin (or a single-origin path-routed setup).
7. **All SSR traffic comes from one IP** ⇒ shared guest throttle (`THROTTLE_ANON` default 2000/hour for the whole
   shop; `payment_status` scope only 240/hour). Fix = backend trusts the storefront's `X-Forwarded-For`
   (`TRUSTED_PROXY_IPS`, exact IP match, no CIDR) and storefront forwards the visitor IP from its own edge
   (`X-Real-IP`) — never from a browser-supplied header.
8. **There is NO backend → storefront webhook / revalidation hook** (grep for revalidate/webhook/STOREFRONT callbacks:
   nothing) [code]. Storefront freshness is purely time-based ISR (`revalidate`) or storefront-internal
   `revalidateTag`. The backend's own Redis response cache (12 endpoints, 5/10/30 min caps) is write-invalidated and
   sends **no** Cache-Control/ETag headers [live].
9. **Never cache `redirects/resolve/` or `shortener/<code>/`** (every 200 is counted), never 301 a short link, and
   note that **`GET /api/v1/blog/post/<slug>/` increments `view_count` on every call** (incl. HEAD, ISR revalidations,
   duplicate generateMetadata fetches) [code].
10. **`meta_tags` (og:/twitter:/custom) exist only on `pages/<slug>/` and `homepage/`**, even though the admin offers the
    meta-tag inline on products, categories, brands, product lists, blog posts and blog categories (silently dropped).
    No noindex / og / twitter / hreflang fields exist anywhere else — the storefront synthesizes them. [code+live]

---------------------------------------------------------------------------------------------------------------------

## 1. Shared conventions

### 1.1 Envelope
```jsonc
// success
{ "msg": "درخواست با موفقیت انجام شد.", "code": 200, "data": { ... } }
// error
{ "msg": "<generic HTTP sentence>", "code": 404,
  "data": { "type": "client_error" | "validation_error",
            "errors": [ { "code": "redirect_not_found", "detail": "<Persian>", "attr": null | "<param>" } ] } }
```
Branch on `data.errors[0].code`, never on text. Paginated lists:
`data = { count, total_pages, current_page, page_size, next, previous, results[] }`; `limit` default 20, max 100
(silently clamped); page past the end ⇒ 404 `not_found` ("صفحه نامعتبر") [live].

### 1.2 Server-only env + helper (from the guide; same file used by content-api guide)
```
FIREFLY_API_URL=https://api.firefly-core.ir    # public API origin (see §12 for why "public")
FIREFLY_API_KEY=<project key>                  # never NEXT_PUBLIC_
```
`lib/firefly.ts` (start with `import 'server-only'`) exports:
- `fireflyFetch(path, init)` — sets `X-API-Key`, keeps caller headers.
- `forwardedHeaders(incoming)` — JSON content-type, passes `Authorization`, maps edge `x-real-ip` → `X-Forwarded-For`.
- `refuseForeignForm(req)` — 403 if `Origin` host ≠ `Host`, 415 if body not `application/json` (CSRF guard for form
  route handlers; requires the proxy to pass `Host` unchanged: `proxy_set_header Host $host`).
- `errorCode(res)` → `body.data.errors[0].code`.
- `statusPage(status, title, message)` → small RTL HTML page with a real status (404/410/503).

### 1.3 Headers
- All four SEO API endpoints: `GET`, `HEAD`, `OPTIONS` only (`Allow: GET, HEAD, OPTIONS`); others ⇒ 405
  `method_not_allowed` [live]. **HEAD counts like GET** (resolve/shortener) [doc].
- `X-API-Key` required on `/api/v1/*` (401 `api_key_missing` / `api_key_invalid`). A disabled key may still pass for
  up to 60 s (validation cache). `/sitemap.xml` and the payment callback are **outside** the key gate.
- No `Authorization` needed for SEO endpoints (nothing user-specific).

---------------------------------------------------------------------------------------------------------------------

## 2. FULL STOREFRONT URL MAP (the storefront must serve all of these)

### 2.1 Paths the backend code generates or hard-assumes

| # | Storefront path | Built by (backend) | Where it surfaces | Slash | Storefront implementation | API to call |
|---|---|---|---|---|---|---|
| 1 | `/` | JSON-LD breadcrumb root `https://{SITE_DOMAIN}/` (`product/services/structured_data.py:207`, `blog/services/structured_data.py:118`) | breadcrumbs JSON-LD | yes | `app/page.tsx` | `GET /api/v1/homepage/` |
| 2 | `/product/{slug}/` | `Product.get_absolute_url` (`product/models.py:725`) | sitemap, JSON-LD `offers.url`, menu `url`, search-suggest `url`, redirect/short-link targets, **back-in-stock SMS `product_link`** (`https://{SITE_DOMAIN}/product/{slug}/`, `product/services/notifications.py:135`) | yes | `app/product/[slug]/page.tsx` | `GET /api/v1/product/detail/{slug}/` (+ `/variants/`) |
| 3 | `/product-category/{path}/` (path = slug chain root→leaf, e.g. `digital/mobile-phone`) | `Category.get_absolute_url` (`product/models.py:201`) | sitemap, menu, JSON-LD breadcrumbs, homepage links | yes | `app/product-category/[...path]/page.tsx` | `GET /api/v1/product/category/{LAST slug}/` (lookup is by slug only; `digital/mobile-phone` ⇒ Django 404 [live]) — compare `data.path` to the URL path, 308 to canonical if different |
| 4 | `/product/list/{slug}/` | `ProductList.get_absolute_url` (`product/models.py:307`) | sitemap, menu, homepage, short links | yes | `app/product/list/[slug]/page.tsx` | `GET /api/v1/product/list-page/{slug}/` + `GET /api/v1/product/list/?...` |
| 5 | `/brand/{slug}/` | `Brand.get_absolute_url` (`product/models.py:2931`) | sitemap, menu, JSON-LD | yes | `app/brand/[slug]/page.tsx` | `GET /api/v1/product/brand/{slug}/` |
| 6 | `/blog/` | `BLOG_INDEX_PATH = '/blog/'` (`blog/services/structured_data.py:11`) | blog JSON-LD breadcrumbs + `CollectionPage.isPartOf.url`; homepage section link (fixture) | yes | `app/blog/page.tsx` | `GET /api/v1/blog/home/`, `/blog/post/list/` |
| 7 | `/blog/{slug}/` | `Post.get_absolute_url` (`blog/models.py:372`) | sitemap, JSON-LD, homepage slides | yes | `app/blog/[slug]/page.tsx` | `GET /api/v1/blog/post/{slug}/` (**writes view_count**) |
| 8 | `/blog/category/{path}/` | blog `Category.get_absolute_url` (`blog/models.py:94`) | sitemap, JSON-LD, menu | yes | `app/blog/category/[...path]/page.tsx` | `GET /api/v1/blog/category/{LAST slug}/` (compare `data.path`) |
| 9 | `/page/{slug}/` | `Page.get_absolute_url` (`pages/models.py:82`); API `url` field | sitemap, menu, `pages/list/` | yes | `app/page/[slug]/page.tsx` | `GET /api/v1/pages/{slug}/` |
| 10 | `/s/{code}` | `SHORT_LINK_BASE_URL + code` (`settings.py:106`, `shortener/models.py:109`); default `{STOREFRONT_URL}/s/` | panel list, QR PNG, SMS/print campaigns. **Not** in any API response | **no** | `app/s/[code]/route.ts` (§5) | `GET /api/v1/shortener/{code}/` |
| 11 | `/order/pay/{token}` | `payment_link_url()` (`order/services/payment_link.py:127`) | SMS variable `payment_link` (events `order_awaiting_payment`, `payment_failed`, `order_amendment_payment_required`), order API `payment_url` | **no** | `app/order/pay/[token]/page.tsx` (dynamic, noindex) | `GET /api/v1/order/pay/{token}/`, `POST …/cancel/` |
| 12 | `/api/v1/payment/gateway/callback/{gateway_code}/{callback_token}/` | `_absolute_callback_url` = `STOREFRONT_URL + reverse('payment:gateway_callback')` (`payment/services/intent.py:332-338`) | handed to the bank as return URL | **yes, mandatory** | edge proxy (nginx `location`) or Next rewrite → Django, GET+POST, no key needed (view is key-exempt) | — |
| 13 | payment result page — fixture `/payment/callback/` | `GatewaySetting.result_url` (panel "آدرس نتیجهٔ پرداخت"); Django 302s there with `?result=…&payment=<uuid>&code=…` (`payment/views.py:218-243`) | after every gateway return (orders, wallet top-up, amendment) | as configured | `app/payment/callback/page.tsx` (dynamic, noindex) | `GET /api/v1/payment/{uuid}/status/` (throttle scope `payment_status` 240/h) |
| 14 | `/sitemap.xml` | robots `Sitemap:` line = `{STOREFRONT_URL}/sitemap.xml` (`robots/services/rendering.py:63`) | robots.txt | n/a | rewrite/proxy → `{API}/sitemap.xml` (§6) | — |
| 15 | `/robots.txt` | crawler convention; content from panel | — | n/a | `app/robots.txt/route.ts` (§3) | `GET /api/v1/robots/` |
| 16 | `/media/**`, `/static/**` **on SITE_DOMAIN** | JSON-LD `image`/publisher `logo` (`https://{SITE_DOMAIN}/media/...`, placeholder `/static/defaults/default.png`), push-notification image for Firebase (`notification/models.py:240`) | JSON-LD in product/blog responses; FCM | n/a | if SITE_DOMAIN = storefront domain: proxy both prefixes to Django (nginx) | — |

Live confirmation of #12/#13 (dev):
```
GET  /api/v1/payment/gateway/callback/zarinpal/unknowntoken123/  → 302 https://firefly-core.ir/payment/callback/?result=failed&code=gateway_callback_invalid
POST /api/v1/payment/gateway/callback/zarinpal/unknowntoken123/  → 302 (same)
GET  …/unknowntoken123   (no slash)                               → 301 to slash version
POST …/unknowntoken123   (no slash)                               → 500
```
Result-page query semantics (order-api guide): `result` = success|failed|pending; `payment=<uuid>` always except
unknown token; `code` on failed/pending (`gateway_rejected`, `gateway_verification_pending`,
`gateway_capture_not_bookable`, `gateway_capture_parked`, `gateway_amount_mismatch`, `gateway_callback_invalid`,
`gateway_transaction_state_invalid`, `gateway_capture_refunded`). **Never trust the query; read
`/api/v1/payment/{uuid}/status/`.** Unknown-token returns carry no `payment`.

### 2.2 Paths assumed by shipped data (fixtures; operator-editable, but expect them)
- `/product/list/?has_discount=true` — a **generic product listing at `/product/list/` taking the API's own filter
  param names** (homepage section "view all", a slide, a menu item). Also: homepage `sections[].listing_query` and
  search groups' `listing_query` are dicts of `GET /api/v1/product/list/` params meant for the "view all" link ⇒
  implement `app/product/list/page.tsx` that forwards (whitelisted) query params to `/api/v1/product/list/`.
  (storefront-seo guide's example uses `/products/?has_discount=true` — an operator-typed redirect target; either add
  an alias or keep operators on `/product/list/`.)
- `/contact-us/` — `SiteGlobalSetting.support_link = https://firefly-core.ir/contact-us/` (content-api guide builds
  the form at `/contact/`, and a content page exists at `/page/contact-us/` ⇒ add `/contact-us/` or a redirect rule).
- `/cart/`, `/checkout/` — robots fixture `Disallow: /cart/`, `Disallow: /checkout/` (name the routes accordingly).
- Redirect fixture sources: `/product/samsung-galaxy-s23-ultra` (301 → `/product/samsung-galaxy-s25-ultra/`),
  `/festival` (302 → `/product-category/digital/mobile-phone/`), `/product/nokia-3310-classic` (410). [live]
- Short-link fixtures: `phone-fest` → `/product/list/flagship-phones/`, `box2026` → `/product/samsung-galaxy-s25-ultra/`.
- Homepage/menu fixture links: `/product-category/...`, `/brand/apple/`, `/product/list/flagship-phones/`,
  `/blog/`, `/blog/<slug>/`, `/product/<slug>/` — all covered by 2.1.

### 2.3 Paths the guides recommend (not generated by backend)
`/links/` (linker page), `/contact/` (contact form), `/search/?q=` (search page), Next route handlers
`/api/contact/`, `/api/search-suggest/`, `/api/page-comments/[slug]/`. If you also proxy `/api/v1/` at the edge,
keep your own handlers outside `/api/v1/`.

### 2.4 Things the backend does NOT generate (verified)
- No password-reset or email-verification links: flows are OTP-based. An email template `password_reset_link`
  with `{{ link }}` exists (`email_center/models.py:127,159`) but **no code ever sends it** [code].
- No order-tracking URL in SMS (`order_dispatched` vars: customer_name, order_code, tracking_code, carrier_name).
- Google login uses GIS `id_token` (client-side) ⇒ only needs the storefront origin in the Google client's
  authorized JS origins, no redirect path.
- Dashboard banners/menu/homepage links are operator-typed (`/path` or absolute http(s), validated by
  `utils.links.validate_link`).

### 2.5 Routing hazards
- Product slug `list` would map to `/product/list/` (collides with the product-list namespace); blog post slug
  `category` would map to `/blog/category/`. Only `pages` reserves a slug (`list`) — no validation for these [code].
- Category paths change when a category is moved (MPTT); old `/product-category/a/b/` still resolves by last slug ⇒
  canonicalize (308) to `data.path`.
- Slugs may be Persian (`SlugField(allow_unicode=True)`). Decode params defensively, re-encode with
  `encodeURIComponent` when calling the API.
- Admin "View on site" (Django default `view_on_site=True`, no sites framework) redirects to the **API host** path
  (`shortcut()` → `http://localhost:8000/product/samsung-galaxy-s25-ultra/`) [live] — 404 in split-domain setups.

### 2.6 Suggested app tree
```
app/
  layout.tsx                     # metadataBase, html lang="fa" dir="rtl", menus, extra snippets
  page.tsx                       # /
  robots.txt/route.ts            # §3
  s/[code]/route.ts              # §5
  product/[slug]/page.tsx
  product/list/page.tsx          # generic listing (?has_discount=true …)
  product/list/[slug]/page.tsx
  product-category/[...path]/page.tsx
  brand/[slug]/page.tsx
  blog/page.tsx
  blog/[slug]/page.tsx
  blog/category/[...path]/page.tsx
  page/[slug]/page.tsx
  order/pay/[token]/page.tsx     # dynamic, noindex
  payment/callback/page.tsx      # = result_url path, dynamic, noindex
  contact-us/ cart/ checkout/ search/ links/ ...
proxy.ts                         # Next 16 name for middleware.ts (redirects + optional short-domain + slash)
next.config.js                   # trailingSlash: true, rewrites (sitemap, callback, media/static if needed)
```

---------------------------------------------------------------------------------------------------------------------

## 3. robots.txt

### 3.1 `GET /api/v1/robots/` (public, key required)
Query `format`: `json` (default) | `txt`. `Accept: text/plain` also yields text. Any other format ⇒ 404 `not_found`
**as JSON**. `Accept` that allows neither JSON nor text (e.g. only `text/html`) ⇒ 406 `not_acceptable` (JSON), even
with `?format=txt` [live].

**[live] JSON (dev data):**
```json
{ "msg": "درخواست با موفقیت انجام شد.", "code": 200, "data": {
  "rules": [
    { "user_agent": "*", "crawl_delay": null, "directives": [
        { "directive": "disallow", "path": "/cart/" },
        { "directive": "disallow", "path": "/checkout/" },
        { "directive": "disallow", "path": "/*?sort=" },
        { "directive": "allow",    "path": "/*?page=" } ] },
    { "user_agent": "Bingbot", "crawl_delay": "2.0", "directives": [
        { "directive": "disallow", "path": "/cart/" },
        { "directive": "disallow", "path": "/checkout/" } ] } ],
  "sitemaps": [ "http://localhost:3000/sitemap.xml" ],
  "content": "User-agent: *\nDisallow: /cart/\nDisallow: /checkout/\nDisallow: /*?sort=\nAllow: /*?page=\n\nUser-agent: Bingbot\nDisallow: /cart/\nDisallow: /checkout/\nCrawl-delay: 2\n\nSitemap: http://localhost:3000/sitemap.xml\n" } }
```
**[live] `?format=txt`:** `200`, `Content-Type: text/plain; charset=utf-8`, body = `content` byte-for-byte.

Object reference:
- `RobotsDocument { rules: RobotsGroup[] (never empty), sitemaps: string[] (absolute; [] when block_all_crawlers), content: string (ends with "\n") }`
- `RobotsGroup { user_agent: string ('*' or bot; one group per UA case-insensitively; never '#'), crawl_delay: string|null ("2.5"; text drops ".0"), directives: RobotsDirective[] (≥1) }`
- `RobotsDirective { directive: 'allow'|'disallow', path: string (starts '/' or '*'; '*' and '$' wildcards; case-sensitive; '#' never present, real '#' as %23; empty only in allow-all group) }`

Generation rules: operator order kept; inactive rules and rule-less groups skipped; no active rule ⇒
`User-agent: *\nDisallow:\n` (allow all); `Sitemap:` lines = storefront `/sitemap.xml` (if "include sitemap" on,
default) + operator extras. **`block_all_crawlers`** (panel, for staging) ⇒ content exactly
`User-agent: *\nDisallow: /\n`, `sitemaps: []`.

Errors: 401 `api_key_missing`/`api_key_invalid`, 404 `not_found` (bad format), 405, 406 `not_acceptable`, 429
`throttled` (Retry-After). **In text mode errors are text** with real status (e.g. `401` + Persian sentence) — never
serve that as robots.txt: a 4xx robots.txt = "allow everything" for Google.

### 3.2 Recommended implementation — route handler (byte-exact, preserves operator order)
```ts
// app/robots.txt/route.ts
import { fireflyFetch } from '@/lib/firefly';
export const revalidate = 300;
export async function GET() {
  const res = await fireflyFetch('/api/v1/robots/', { next: { revalidate } });
  if (!res.ok) throw new Error(`robots answered ${res.status}`);   // throw ⇒ Next keeps last good file
  const { data } = await res.json();
  return new Response(data.content, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
}
```
- Alternative `app/robots.ts` (MetadataRoute.Robots) works but Next reorders Allow before Disallow per group
  (fine for Google/Bing longest-match; changes first-match crawlers). Keep only one of the two files.
- With `revalidate = 300` the file is prerendered at **build** ⇒ API must be reachable at build (intentional).
- nginx alternative (no Next): `location = /robots.txt { set $args ''; proxy_pass https://api…/api/v1/robots/?format=txt;
  proxy_set_header Host api…; proxy_set_header X-API-Key "…"; proxy_set_header Accept "text/plain";
  proxy_ssl_verify on; proxy_ssl_verify_depth 2; proxy_ssl_trusted_certificate /etc/ssl/certs/ca-certificates.crt;
  proxy_ssl_server_name on; proxy_intercept_errors on; error_page 400 401 403 404 405 406 429 = @robots_unavailable; }`
  `location @robots_unavailable { add_header Retry-After 3600 always; return 503; }`
- Staging: turn on `block_all_crawlers` on the staging backend **and** add HTTP auth or `X-Robots-Tag: noindex` on
  all staging responses (robots Disallow ≠ noindex).
- Suggest to operators (panel rules): also disallow `/order/pay/`, `/payment/callback/`, `/search/`, `/api/`.

---------------------------------------------------------------------------------------------------------------------

## 4. Redirects

### 4.1 Matching rules (backend normalizes both stored rule and query) [doc+code]
| Request path | Equivalent rule | Why |
|---|---|---|
| `/product/old-name/` | `/product/old-name` | trailing slash stripped (except `/`) |
| `/product/old-name/?utm_source=sms` | `/product/old-name` | query not compared; **carried to target** |
| `//product//old-name` | `/product/old-name` | duplicate slashes collapsed |
| `https://<storefront host>/yalda/` (also `www.`; any scheme [live]) | `/yalda` | own absolute URL → path |
| `/blog/%DA%A9…` | `/blog/کفش-زمستانی` | percent-decoded (both spellings match) |
| `/a%2Fb` | NOT `/a/b` | `%2F %3F %23 %25` stay encoded |
| `/Product/Old-Name/` | NOT `/product/old-name` | case-sensitive [live: `/Festival` → 404] |
| `https://example.com/…` | none | foreign host ⇒ `redirect_not_found` |

No chains: panel refuses a rule whose target is another active rule's source or a gone rule ⇒ one hop is final.
Panel never auto-creates redirects on slug change/delete (operators must) [doc].

### 4.2 `GET /api/v1/redirects/resolve/?path=<encodeURIComponent(pathname+search)>` — never cache
Each 200 increments `hit_count`/`last_hit_at`; 404 counts nothing. `path` ≤ 2000 chars.

**[live] samples:**
```jsonc
// ?path=%2Fproduct%2Fsamsung-galaxy-s23-ultra%2F%3Futm_source%3Dsms%26utm_campaign%3Dx
{"code":200,"data":{"source_path":"/product/samsung-galaxy-s23-ultra",
  "target":"/product/samsung-galaxy-s25-ultra/?utm_source=sms&utm_campaign=x","redirect_type":"permanent","status_code":301}}
// ?path=%2Ffestival
{"code":200,"data":{"source_path":"/festival","target":"/product-category/digital/mobile-phone/","redirect_type":"temporary","status_code":302}}
// ?path=http%3A%2F%2Flocalhost%3A3000%2Ffestival%2F%3Fa%3D1
{"code":200,"data":{"source_path":"/festival","target":"/product-category/digital/mobile-phone/?a=1","redirect_type":"temporary","status_code":302}}
// ?path=%2Fproduct%2Fnokia-3310-classic%2F
{"code":200,"data":{"source_path":"/product/nokia-3310-classic","target":"","redirect_type":"gone","status_code":410}}
// no rule
{"msg":"موردی با این مشخصات پیدا نشد.","code":404,"data":{"type":"client_error","errors":[{"code":"redirect_not_found","detail":"برای این مسیر ریدایرکتی تعریف نشده است.","attr":null}]}}
// missing / blank path
{"code":400,"data":{"type":"validation_error","errors":[{"code":"required","detail":"این مقدار لازم است.","attr":"path"}]}}
{"code":400,"data":{"type":"validation_error","errors":[{"code":"blank","detail":"این مقدار نباید خالی باشد.","attr":"path"}]}}
```
Query carry: request query is appended to target **unless target already has its own query** (then request query is
dropped). Unsafe chars in carried query are percent-encoded (`%20`, `%0D%0A`, stray `%`→`%25`) ⇒ put `target` in
`Location` as-is (no re-encode; CRLF-safe). **Encode `path`**: raw `?path=/x/?a=1&b=2` loses `b` (API's own `&`).
Errors: 400 `required|blank|max_length|null_characters_not_allowed…` (treat any 400 on `path` as "no rule"), 401,
404 `redirect_not_found` (not an error: render normally), 405, 429.

`RedirectRule { source_path: string (normalized, no trailing slash), target: string ('' for gone; storefront path
or absolute http(s)), redirect_type: 'permanent'|'temporary'|'gone', status_code: 301|302|410 }` — use
`status_code` directly; resolve relative targets with `new URL(target, request.url)`.

### 4.3 `GET /api/v1/redirects/list/?limit=100&page=N` — cacheable (60–300 s)
Active rules (incl. gone), oldest first, paginated; read until `next === null`. Counts nothing. [live]:
```json
{"code":200,"data":{"count":3,"total_pages":1,"current_page":1,"page_size":100,"next":null,"previous":null,"results":[
 {"source_path":"/product/samsung-galaxy-s23-ultra","target":"/product/samsung-galaxy-s25-ultra/","redirect_type":"permanent","status_code":301},
 {"source_path":"/festival","target":"/product-category/digital/mobile-phone/","redirect_type":"temporary","status_code":302},
 {"source_path":"/product/nokia-3310-classic","target":"","redirect_type":"gone","status_code":410}]}}
```

### 4.4 Recommended: `proxy.ts` (Next 16; `middleware.ts` + `export function middleware` on ≤15)
Pattern from the guide (tested on Next 16.3): keep an in-memory `Set` of `source_path`s from `list/` (TTL 5 min,
stale-while-refresh, first request waits), normalize the incoming pathname the same way the backend does, and call
`resolve/` **only** for paths in the set (zero API cost for normal pages).
```ts
// proxy.ts (condensed from storefront-seo §3; Node runtime, list kept per server process)
const RULE_LIST_TTL_MS = 5 * 60 * 1000;
let ruleSources: Set<string> | null = null, loadedAt = 0, refreshing: Promise<void> | null = null;
async function loadRuleSources() { /* page through /api/v1/redirects/list/?limit=100&page=N with cache:'no-store',
  AbortSignal.timeout(3000); add rule.source_path; stop at data.next === null; throw on !ok */ }
async function knownSources() { if (Date.now() - loadedAt > RULE_LIST_TTL_MS) {
  refreshing ??= loadRuleSources().then(s => { ruleSources = s; }).catch(e => console.error(e))
    .finally(() => { loadedAt = Date.now(); refreshing = null; });
  if (ruleSources === null) await refreshing; } return ruleSources ?? new Set(); }
function ruleSpelling(pathname: string): string | null {           // same rule as backend normalize_path
  if (/%(?:25|2f|3f|23)/i.test(pathname)) return null;
  let path: string; try { path = decodeURIComponent(pathname); } catch { return null; }
  if (/[\s\p{Cc}]/u.test(path)) return null;
  path = path.replace(/\/{2,}/g, '/');
  return path.length > 1 ? path.replace(/\/+$/, '') || '/' : path;
}
export async function proxy(request: NextRequest) {
  if (request.method !== 'GET' && request.method !== 'HEAD') return NextResponse.next();
  const spelled = ruleSpelling(request.nextUrl.pathname);
  if (spelled !== null && !(await knownSources()).has(spelled)) return NextResponse.next();
  const url = request.nextUrl.clone(); url.searchParams.delete('_rsc');
  let res: Response;
  try { res = await fireflyFetch(`/api/v1/redirects/resolve/?path=${encodeURIComponent(url.pathname + url.search)}`,
          { cache: 'no-store', signal: AbortSignal.timeout(1000) }); }
  catch { return NextResponse.next(); }                              // API down ⇒ behave as "no rule"
  if (!res.ok) { if (res.status !== 404 && res.status !== 400) console.error('resolve', res.status); return NextResponse.next(); }
  const { data } = await res.json();
  if (data.status_code === 410) return statusPage(410, 'این صفحه حذف شده است', 'این صفحه دیگر وجود ندارد و جایگزینی هم ندارد.');
  return NextResponse.redirect(new URL(data.target, request.url), data.status_code);   // 301 | 302
}
export const config = { matcher: [{
  source: '/((?!_next/static|_next/image|api/|s/|media/|static/|favicon.ico|robots.txt|sitemap.xml).*)',
  missing: [{ type: 'header', key: 'next-router-prefetch' }, { type: 'header', key: 'purpose', value: 'prefetch' }] }] };
```
Notes:
- *Superseded in this storefront (Plan 4 Task 4): the matcher no longer drops prefetches. They reach the proxy,
  which only marks them with their route kind and skips the redirect lookup and the session refresh
  (`isQuietPrefetch()`, `src/proxy.ts`); see docs/ARCHITECTURE.md «Payment credentials in URLs».*
- Do it in proxy/middleware, **not** in `page.tsx` on not-found: pages can only emit 307/308, cannot emit 410, and a
  streamed response turns redirects into meta refresh.
- Trailing slash: Next normalizes before proxy. With `trailingSlash: true` the slashed old URL gets one 301; the
  unslashed one gets 308 then 301 (both reach the same rule since the backend ignores the trailing slash).
- Build-time alternative (`redirects()` in next.config from `list/`) for mass migrations: no hit counting, no 410,
  Next merges queries differently (`/sale?utm=x` → `/products/?utm=x&has_discount=true`), needs both raw and
  percent-encoded `source` spellings (escape `(){}:*+?`), applies only on rebuild. Can coexist (config redirects run
  before proxy).

---------------------------------------------------------------------------------------------------------------------

## 5. Short links `/s/{code}`

### 5.1 `GET /api/v1/shortener/{code}/` — never cache; each 200 counts a visit (HEAD too)
Code: `[a-z0-9_-]{3,50}`, stored lowercase, lookup case-insensitive; a saved link's code never changes; target may change.
```jsonc
// [live] GET /api/v1/shortener/PHONE-FEST/
{"msg":"درخواست با موفقیت انجام شد.","code":200,"data":{"code":"phone-fest","target_url":"http://localhost:3000/product/list/flagship-phones/"}}
// [live] unknown OR disabled (indistinguishable on purpose)
{"code":404,"data":{"type":"client_error","errors":[{"code":"short_link_not_found","detail":"این لینک کوتاه وجود ندارد.","attr":null}]}}
// [doc] expired
{"msg":"مهلت این درخواست به پایان رسیده است.","code":410,"data":{"type":"client_error","errors":[{"code":"short_link_expired","detail":"مهلت این لینک به پایان رسیده است.","attr":null}]}}
```
`target_url` is always absolute (storefront paths are prefixed with STOREFRONT_URL server-side).

### 5.2 Route handler
```ts
// app/s/[code]/route.ts
export const dynamic = 'force-dynamic';
export async function GET(_req: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;                       // Next 14: params is a plain object
  let res: Response;
  try { res = await fireflyFetch(`/api/v1/shortener/${encodeURIComponent(code)}/`, { cache: 'no-store', signal: AbortSignal.timeout(3000) }); }
  catch { return statusPage(503, 'لحظه‌ای بعد دوباره امتحان کنید', 'این لینک الان در دسترس نیست.'); }
  if (res.ok) { const { data } = await res.json(); return NextResponse.redirect(data.target_url, 302); }  // NEVER 301
  const reason = await errorCode(res);
  if (reason === 'short_link_expired')   return statusPage(410, 'این کمپین تمام شده', 'مهلت این لینک به پایان رسیده است.');
  if (reason === 'short_link_not_found') return statusPage(404, 'این لینک پیدا نشد', 'لینک کوتاهی با این نشانی وجود ندارد.');
  console.error('shortener answered', res.status, reason);
  return statusPage(503, 'لحظه‌ای بعد دوباره امتحان کنید', 'این لینک الان در دسترس نیست.');
}
```
- 302 only (301 is browser-cached ⇒ uncounted, stale target, no "campaign ended" page).
- Panel URLs have no trailing slash: with `trailingSlash: true` you get 308 `/s/x` → `/s/x/` then 302 (still counted
  once). To remove the hop: `skipTrailingSlashRedirect: true` + add the slash yourself in proxy for everything except
  `/s/` (`if (!pathname.endsWith('/') && !/\.\w+$/.test(pathname)) return NextResponse.redirect(new URL(`${pathname}/${search}`, request.url), 308)`).
  Build the URL with `new URL`, not `nextUrl.clone()` (clone re-strips the slash).
- Dedicated short domain: backend `SHORT_LINK_BASE_URL=https://fly.example/s/` (same route, just DNS+TLS) or
  `https://fly.example/` + first lines of proxy: `if (request.headers.get('host')?.split(':')[0] === 'fly.example')
  return NextResponse.rewrite(new URL(`/s${request.nextUrl.pathname}`, request.url));` (use `Host`, not
  `nextUrl.hostname`, which is `localhost` behind `next start`).
- Never link `/s/...` from inside the storefront (Next prefetch would count visits). Link-preview bots count.
- Every short-link hit is an API call ⇒ coordinate THROTTLE_ANON before big SMS campaigns.

---------------------------------------------------------------------------------------------------------------------

## 6. Sitemap

### 6.1 `GET {API}/sitemap.xml` — plain Django view: no X-API-Key, no DRF throttle
[live] headers: `200`, `Content-Type: application/xml`, `Last-Modified: <newest lastmod>`,
`X-Robots-Tag: noindex, noodp, noarchive` (keep it; applies to the XML file only), `Vary: origin, Cookie`. No
Cache-Control. Single `<urlset>` (no sitemap index); `?p=N` paging at 50 000 URLs per section, out-of-range ⇒ 404
[live `?p=2` → 404]. Dev data: 169 URLs — 74 `/product/`, 32 `/product-category/`, 30 `/brand/`, 19 `/blog/`,
7 `/blog/category/`, 5 `/page/`, 2 `/product/list/`; all end with `/`.
```xml
<url><loc>http://localhost:3000/blog/upcoming-campaign-preview/</loc><lastmod>2026-09-13</lastmod><changefreq>weekly</changefreq><priority>0.9</priority></url>
...
<url><loc>http://localhost:3000/page/terms/</loc><lastmod>2026-09-20</lastmod><changefreq>monthly</changefreq><priority>0.5</priority></url>
```
Sections (order): blog_posts (published, schedule reached, newest first; empty when blog switch off; weekly/0.9),
blog_categories (weekly/0.8), products (weekly/0.9), product_categories (published, no draft ancestor; weekly/0.8),
product_lists (weekly/0.8), product_brands (weekly/0.9), content_pages (by slug; monthly/0.5). `<loc>` host+scheme
from STOREFRONT_URL (`utils/sitemaps.py::StorefrontSitemap`), never from the request host. Every URL is one the API
answers 200 for. No hreflang `xhtml:link` entries.

### 6.2 Storefront
```js
// next.config.js
module.exports = {
  trailingSlash: true,
  async rewrites() { return [
    { source: '/sitemap.xml', destination: `${process.env.FIREFLY_API_URL}/sitemap.xml` },
    // see §8/§12: payment callback (+ /media, /static if SITE_DOMAIN is this host)
  ]; },
};
```
- External rewrite proxies with `Host` = destination host (accepted by ALLOWED_HOSTS). Delete any `app/sitemap.ts` /
  `public/sitemap.xml` (they win over afterFiles rewrites).
- nginx: `location = /sitemap.xml { proxy_pass https://api…/sitemap.xml; proxy_set_header Host api…; proxy_ssl_verify on; … }`
- Optional short CDN/nginx cache (minutes); backend builds it per request and does not cache it.
- Robots `Sitemap:` line already points at the storefront's `/sitemap.xml`; if the operator turns "include sitemap"
  off, submit it in Search Console manually.

---------------------------------------------------------------------------------------------------------------------

## 7. SEO fields per resource (all read server-side; verified keys [live])

### 7.1 Matrix
| Resource (API) | page_title | page_description | page_keywords | canonical_link | meta_tags | structured_data | breadcrumb_structured_data | UI breadcrumb | is_unpublished |
|---|---|---|---|---|---|---|---|---|---|
| Product `GET /product/detail/{slug}/` | ✓ | ✓ | ✓ | ✓ | ✗ | `[Product]` (array of 1) | `BreadcrumbList` object | `breadcrumb[]` {id,name,slug,**path**,parent_id} (category chain, not the product) | ✓ |
| Product category `GET /product/category/{slug}/` | ✓ | ✓ | ✓ | ✓ | ✗ | ✗ | ✓ | `breadcrumb[]` incl. self, with `path` | ✗ |
| Brand `GET /product/brand/{slug}/` | ✓ | ✓ | ✓ | ✓ | ✗ | ✗ | ✓ | ✗ | ✗ |
| Product list page `GET /product/list-page/{slug}/` | ✓ | ✓ | ✓ | ✓ | ✗ | ✗ | ✓ (home→category chain→list) | ✗ (`product_category` {id,name,slug,parent_id}) | ✗ |
| Blog post `GET /blog/post/{slug}/` | ✓ | ✓ | ✓ | ✓ | ✗ | `[BlogPosting]` | ✓ (home→/blog/→categories) | `breadcrumb[]` {id,name,slug,parent_id} **no path** | ✓ |
| Blog category `GET /blog/category/{slug}/` | ✓ | ✓ | ✓ | ✓ | ✗ | `[CollectionPage]` | ✓ | `breadcrumb[]` incl. self, no path; top-level `path` | ✗ |
| Content page `GET /pages/{slug}/` | ✓ | ✓ | ✓ | ✓ | ✓ `[{field,value}]` | ✗ | ✗ | ✗ | ✓ |
| Home `GET /homepage/` | ✓ (fallback site name) | ✓ (fallback slogan, else '') | ✓ | ✓ | ✓ | ✗ | ✗ | ✗ | ✗ |
| Blog home `/blog/home/`, post list, product list, linker, menus | — no SEO fields — | | | | | | | | |

Semantics (common to `seo.models.AbstractBaseSeoModel`):
- `page_title`: operator `search_engine_title` else entity name (`name`/`title`); always a string. Operators often
  already append the shop name (`"گوشی موبایل | فروشگاه فایرفلای"` [live]) ⇒ use `title: { absolute: page_title }`,
  not a `"%s | shop"` template.
- `page_description`, `page_keywords`: operator value else `''` — no model has a non-empty default (pages: description
  falls back to the page `description`; home: slogan). Sample blog keywords like `"بررسی, کامل, گلکسی, S25, اولترا؛, آیا"`
  are fixture data, not generated; a blog signal only auto-fills the post's body `description` from content, not the
  SEO fields. **Empty string ⇒ omit the tag/key** (and in Next don't set the key to `undefined` — that wipes the
  layout default).
- `canonical_link`: absolute URL string or `null` (Django URLField). `null` ⇒ self-canonical on the storefront
  origin (`alternates.canonical = '/product/{slug}/'` with `metadataBase = STOREFRONT origin`).
- `meta_tags`: ordered by id (operator order), same `field` may repeat (two `og:image`). Fields seen in docs:
  `og:type`, `og:image`, `twitter:card`. Render `og:`/`article:`/`product:`/`profile:`/`book:`/`fb:` with
  `property=`, everything else with `name=` (Next `metadata.other` always writes `name=`, so emit property tags as JSX
  `<meta property>` in the page; React 19 hoists them into `<head>`).
- `is_unpublished`: only a staff JWT gets drafts (`true`); everyone else gets 404 ⇒ when `true`: banner, `robots:
  { index:false, follow:false }`, `cache: 'no-store'`, never ISR.
- **No fields exist for:** robots/noindex, Open Graph, Twitter, hreflang/alternates, og:image, `lastmod` on detail
  (use `updated`), `published_at` (blog post has it). `/global/languages/` lists `en` + `fa` UI label translations,
  but content is Persian-only (`LANGUAGES=[fa]`, modeltranslation registrations commented out) ⇒ **no hreflang**;
  `<html lang="fa" dir="rtl">`.

### 7.2 JSON-LD details [live]
- Product `structured_data[0]`: `@context "https://schema.org/"`, `@type Product`, `name`, `image`
  (`https://{SITE_DOMAIN}/media/CACHE/...` or `/static/defaults/default.png`), `description` (= page_description,
  may be ''), `sku`/`mpn` (representative variant SKU), `offers` = `AggregateOffer {url, priceCurrency:"IRR",
  lowPrice, highPrice, offerCount, availability}` for multi-variant or `Offer {url, priceCurrency, price, availability}`;
  `brand {@type Brand, name}` (site name if none); `review[]` ≤5 approved root comments (key absent if none); **no
  aggregateRating** by design. **Prices in JSON-LD are Rials (API Toman × 10)** — never display them.
- `breadcrumb_structured_data`: `{ "@context":"https://schema.org", "@type":"BreadcrumbList", "itemListElement":[
  {"@type":"ListItem","position":1,"name":"خانه","item":"https://{SITE_DOMAIN}/"}, …] }` — object, not array.
  Product/category chains use `/product-category/<path>/`; blog chains insert `بلاگ` → `/blog/`.
- Blog post `structured_data[0]`: `BlogPosting { mainEntityOfPage {@id url}, headline, description, image,
  publisher {Organization name, logo ImageObject url}, datePublished, dateModified, articleBody (**raw HTML**),
  author {Person}, commentCount, comment[] }`.
- Blog category: `CollectionPage { name "دسته‌بندی: …", description, url, isPartOf {Blog name, url ".../blog/"},
  publisher }`.
- FAQ: backend has `faqs.models.FAQ.structured_data()` (FAQPage) but **does not expose it**. Build FAQPage yourself
  from `GET /api/v1/faq/category/list/` (`results[].items[] {id,question,answer,…}`) and from `question_answers[]`
  `{question, answer}` on product / product category / list page.
- Organization/WebSite JSON-LD: not provided; build from `GET /api/v1/global/settings/` (`name, slogan, logo, logo2,
  favicon, phone, phone2, email, address, postal_code, map, support_link, web_application_link, …`).
- Embedding: `<script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(x).replace(/</g, '\\u003c') }} />`
  — mandatory escaping: `articleBody` carries HTML, a `</script>` in content would break out. (The product guide's
  `{JSON.stringify(...)}`-as-children snippet is not safe/correct in React.)
- Host consistency: JSON-LD URLs are `https://{SITE_DOMAIN}` (forced https, no port); sitemap/canonicals use
  STOREFRONT_URL. If they differ, rewrite the origin of page URLs before embedding (and keep `/media/` reachable).

### 7.3 generateMetadata recipe (product; same shape for category/brand/list/post/blog-category/page)
```ts
const getProduct = cache(async (slug: string) => {
  const res = await fireflyFetch(`/api/v1/product/detail/${encodeURIComponent(slug)}/`, { next: { revalidate: 120, tags: [`product:${slug}`] } });
  if (res.status === 404) return null;                     // → notFound()
  if (!res.ok) throw new Error(`product ${res.status}`);   // throw ⇒ ISR keeps last good page
  return (await res.json()).data as ProductDetail;
});
export async function generateMetadata({ params }): Promise<Metadata> {
  const p = await getProduct((await params).slug);
  if (!p) return {};
  const m: Metadata = {
    title: { absolute: p.page_title },
    alternates: { canonical: p.canonical_link ?? `/product/${p.slug}/` },
    openGraph: { type: 'website', title: p.page_title, url: `/product/${p.slug}/`, images: p.image ? [p.image] : undefined, siteName, locale: 'fa_IR' },
  };
  if (p.page_description) { m.description = p.page_description; m.openGraph!.description = p.page_description; }
  if (p.page_keywords) m.keywords = p.page_keywords;
  if (p.is_unpublished) m.robots = { index: false, follow: false };
  return m;
}
```
- Category pages: `slug = path.at(-1)`; if `data.path !== path.join('/')` ⇒ `permanentRedirect('/product-category/' + data.path + '/')`.
  Blog category: same with blog `data.path`. Blog-post UI breadcrumb links: cumulative join of `breadcrumb[].slug`.
- Pages: see content-api guide (`page/[slug]` with `meta_tags` split by property/name).
- noindex policy to apply storefront-side: `is_unpublished`, `/search/`, filtered/sorted listing variants
  (robots fixture already disallows `?sort=`), `/cart/`, `/checkout/`, `/order/pay/*`, payment result page, account
  pages, error/status pages.
- Blog disabled (`feature_disabled` 503 on all blog endpoints): render a 503 with Retry-After (temporary) and hide blog
  links using `/api/v1/global/feature-status/`; sitemap drops blog automatically.

### 7.4 Marketing snippets — `GET /api/v1/global/extra-snippets/` [live]
```json
{"code":200,"data":{"count":2,"total_pages":1,"current_page":1,"page_size":20,"next":null,"previous":null,"results":[
 {"id":10002,"description":"نماد اعتماد الکترونیکی","position":"bottom_of_body","type":"script",
  "snippet":"<!-- نمونه اسنیپت نماد اعتماد -->\n<script>console.log('enamad placeholder');</script>"},
 {"id":10001,"description":"کد رهگیری گوگل آنالیتیکس","position":"in_head","type":"script",
  "snippet":"<!-- نمونه اسنیپت تحلیلی؛ شناسه واقعی جایگزین شود -->\n<script>window.dataLayer=window.dataLayer||[];</script>"}]}}
```
- `position`: `in_head | top_of_body | bottom_of_body | outside_of_body`; `type`: `style | link | script | meta`
  (stored + filterable only). Filters `?position=…&position=…`, `?type=…` (repeatable; unknown value ⇒ empty list).
- **Paginated (20/page)** — use `?limit=100` and follow `next`. Ordered by `position, type, id` (alphabetical:
  bottom_of_body before in_head) ⇒ group by position, keep response order inside a group.
- Snippet is raw, unsanitized HTML (sample already contains `<script>`); if it starts with `<` treat as full HTML,
  else wrap by `type`. `description` is an internal note (may be emitted as an HTML comment).
- Inject in `app/layout.tsx` (server): head snippets → parse (e.g. `node-html-parser`) into `<script>/<meta>/<link>/<style>`
  React elements inside `<head>` (no wrapper div allowed in head); body snippets → `<div hidden dangerouslySetInnerHTML>`
  at body start/end (scripts in server HTML execute on the initial document load; layout persists across client
  navigations so they run once). `outside_of_body` ⇒ treat as end of body. A CSP must allow these (nonce or
  `'unsafe-inline'`). Cache with revalidate 300.
- Other marketing surfaces exposed to the storefront: linker page `GET /api/v1/linker/` (`name, bio, logo,
  avatar_letter, theme, social_links_position, thumbnail_position, show_footer, rounded_edges, links[], social_links[]`;
  unnamed page ⇒ `notFound()`), short links (§5), homepage sections. Search reports, ignored words, redirect/short
  link categories are panel-only.

---------------------------------------------------------------------------------------------------------------------

## 8. Payment callback + result page (deployment-critical)

- Proxy at the storefront host (prefer nginx; Next rewrite works too):
  ```nginx
  location /api/v1/payment/gateway/callback/ {      # GET and POST, key-exempt, no body rewriting
      proxy_pass https://api.firefly-core.ir;         # keeps the full URI incl. trailing slash
      proxy_set_header Host api.firefly-core.ir;
      proxy_ssl_server_name on; proxy_ssl_verify on; proxy_ssl_trusted_certificate /etc/ssl/certs/ca-certificates.crt;
  }
  ```
  Next (if no nginx): `{ source: '/api/v1/payment/gateway/callback/:gw/:token/', destination: `${API}/api/v1/payment/gateway/callback/:gw/:token/` }`
  — write the trailing slash explicitly in the destination and verify with `curl -i -X POST` (expect 302, not 301/500).
  Exclude the prefix from proxy.ts matcher (already: `api/`).
- Panel: set `GatewaySetting.result_url` (Settings › gateway settings › "بازگشت از بانک") to the storefront result
  page, e.g. `https://firefly-core.ir/payment/callback/`; host must be in `GATEWAY_RESULT_URL_ALLOWED_HOSTS`
  (default `[SITE_DOMAIN, host(STOREFRONT_URL)]`). The URL is snapshotted onto each transaction at intent time.
- Result page: `dynamic = 'force-dynamic'`, noindex, read `payment` uuid → poll `/api/v1/payment/{uuid}/status/`
  (scope `payment_status` = 240/hour per IP for guests ⇒ forward visitor IP, or call with the customer's JWT).
- Pay-link page `/order/pay/{token}` (+ `/order/pay/{token}/` after slash redirect): dynamic, noindex, no caching.

---------------------------------------------------------------------------------------------------------------------

## 9. Backend response cache (`site_cache`) — what it means for the storefront

### 9.1 What is cached [doc + code `site_cache_timeout`]
| Endpoint | View | Cap |
|---|---|---|
| `/api/v1/homepage/` | homepage.HomePageView | 10 min |
| `/api/v1/product/list/` | ProductListView | 10 min |
| `/api/v1/product/detail/{slug}/` | ProductDetailView | 10 min |
| `/api/v1/product/detail/{slug}/variants/` | ProductVariantsView | 10 min |
| `/api/v1/product/filters/` | ProductFiltersMetadataView | 10 min |
| `/api/v1/product/category/list/` | CategoryListView | 30 min |
| `/api/v1/product/brand/list/` | BrandListView | 30 min |
| `/api/v1/blog/home/` | BlogHomeView | 10 min |
| `/api/v1/blog/post/list/` | PostListView | 10 min |
| `/api/v1/global/settings/` | SiteGlobalSettingDetailView | 30 min |
| `/api/v1/menu/{key}/` | MenuDetailView | 30 min |
| `/api/v1/search/suggest/` | SearchSuggestView | 5 min |

NOT cached: blog post detail (view_count write), `/search/` (records terms), `redirects/resolve/`, `shortener/`
(counters), comment lists (per-viewer `is_current_user`), anything authenticated/transactional (cart, order, account),
`/global/feature-toggles/`, all other public reads (1–3 queries), `/sitemap.xml` (not DRF), robots, redirects list,
category/brand/list-page/page details.

### 9.2 Semantics
- **Correctness promise:** a hit is byte-identical to a live answer. Invalidation is per **table version**: any
  committed write (any path: admin, ORM `.update()`, cron, MPTT moves, F() counters) bumps the table token ⇒ next
  request misses. Time gates (discount windows, `Post.schedule`, homepage section windows, cart/reservation expiry,
  payment-link expiry, short-link expiry…) cap entry lifetime to the next boundary. Effective staleness ≈ 0.
- Cart activity invalidates product/homepage/blog-home/suggest entries (stock shown subtracts holds); every login
  (`account_user.last_login`) invalidates homepage/blog lists; every blog post view invalidates blog lists + homepage.
  Measured hit rates: ~92% no writes; 56% with 1 write/50 reads; settings/menus/categories/brands ~96–100%.
- Key = SHA-256(format version, code fingerprint, view class, **scheme + host**, path, **raw query string**). So
  `?a=1&b=2` ≠ `?b=2&a=1`, and `?utm_source=x` is its own entry. Query strings > 512 chars bypass the cache.
- Bypassed: staff users (always live; drafts visible), non-GET/HEAD, inside transactions, store back-off.
- Viewer flags (`is_in_wishlist`, `is_in_reading_list`) are placeholders filled per request (guest = false).
- **No HTTP caching headers** (no Cache-Control/ETag/Last-Modified; `Vary: origin, Cookie`) [live]. Throttles, API
  key, auth and feature gates still run on hits ⇒ hits still consume the storefront's throttle budget.
- Ops: `python manage.py clear_site_cache` (or panel "Settings › site cache", superuser) after: Redis restore/failover,
  re-enabling `SITE_CACHE_ENABLED` (twice), **any env change such as `SITE_DOMAIN`/`STOREFRONT_URL`** (not in the code
  fingerprint; JSON-LD embeds SITE_DOMAIN in cached product responses), out-of-band DB/media edits. Dedicated Redis
  (`SITE_CACHE_REDIS_URL`, `maxmemory` + `allkeys-lru`, no persistence). Dev env: cache OFF (no Redis).

### 9.3 Revalidation hooks
None. No webhook, no `STOREFRONT_URL` callback, no revalidate call anywhere in backend code [code grep]. Options:
time-based ISR; storefront-internal `revalidateTag` after storefront-initiated writes (e.g. contact subjects on
`contact_subject_unavailable`, comments after submit); or (future backend work) an outbound "content changed" hook.

---------------------------------------------------------------------------------------------------------------------

## 10. Next.js caching / ISR strategy

| Storefront route / call | Recommendation | Rationale |
|---|---|---|
| `robots.txt` | route, `revalidate = 300`, throw on error | rare change; keep last good |
| `redirects/list` | in-memory 5 min (proxy) | counts nothing |
| `redirects/resolve` | `no-store` | counts hits; disabled rules must stop at once |
| `shortener/{code}` | `force-dynamic` + `no-store` | counts visits |
| `/sitemap.xml` | pass-through rewrite; optional CDN few min | backend builds per request |
| layout: `global/settings`, `menu/{key}`, `extra-snippets`, `feature-status` | `revalidate: 300` | change rarely; backend cached 30 min but write-invalidated |
| `/` homepage | `revalidate = 60` | section windows open/close per minute; stock in carousels |
| product detail | ISR 60–300 s for HTML/SEO; live price/stock/variants client-side via a route handler (`no-store`) or accept staleness (cart re-validates) | backend entries die on every cart write anyway; stock shown can be stale for the ISR window; `discount_end_time` may expire inside the window |
| product category / brand / list page / generic listing | `revalidate: 60–300`; normalize query (whitelist + sort keys, drop `utm_*`/`gclid`/`fbclid`) before calling API | raw query is part of backend key |
| blog home / post list | `revalidate: 300` | |
| blog post detail | ISR `revalidate: 300` (accept view-count under-count = 1 count per revalidation) **or** `no-store` (accurate counts, every visit = API call + invalidates backend blog/home caches) — pick explicitly | GET increments `view_count` |
| content page `/page/{slug}/` | `revalidate: 300` | |
| `search/` | `no-store` | records search terms |
| `search/suggest/` | `revalidate: 60` via route handler | per-visitor key if XFF forwarded |
| `/order/pay/*`, payment result, cart, checkout, account | `force-dynamic`, `no-store` | personal/transactional |

Rules:
- Wrap fetchers in React `cache()` so `generateMetadata` and the page share one request (critical for the blog post
  view counter).
- 404 from API ⇒ `notFound()` (ISR then serves 404); other failures ⇒ throw (ISR keeps the previous good page).
- Do **not** send `Authorization` or per-visitor `X-Forwarded-For` on fetches that use `revalidate` (Next's data-cache
  key includes headers ⇒ per-visitor cache entries, and personal data in a shared cache). Personal flags
  (`is_in_wishlist`) ⇒ separate client-side/route-handler call.
- Staff previews (JWT present) ⇒ `cache: 'no-store'` + noindex.
- Pages with `revalidate` are prerendered at build ⇒ API must be reachable during `next build`, or use
  `dynamic = 'force-dynamic'` with fetch-level `revalidate`.
- Worst-case visible staleness = Next window (+ one request); backend adds ≈ 0.

---------------------------------------------------------------------------------------------------------------------

## 11. SSR, throttling and proxies

### 11.1 Throttles (per IP for guests via `utils.user_agent.get_ip_address`, per user when authenticated)
`anon 2000/hour`, `user 5000/hour`, `search_suggest 1800/hour` (own scope only), `payment_status 240/hour`
(payment/method/list, payment/gateway/list, payment status, card-transfer instructions), `comment_submit 10/hour`,
`contact_message_submit 10/hour`, `order_tracking 20/min`, `order_payment_link 30/min`, `payment_attempt 30/hour`,
`auth_attempt 20/min`, `auth_otp_request 10/min`, … (env `THROTTLE_*`). 429 `throttled` + `Retry-After` +
`data.retry_after`. SEO endpoints have no scoped throttle (anon/user only). `/sitemap.xml` is not throttled.

### 11.2 How the backend picks the client IP [code `utils/user_agent.py`]
- Trusts `X-Forwarded-For` **only if `REMOTE_ADDR` ∈ `TRUSTED_PROXY_IPS`** (exact string match, no CIDR).
- Client = entry `TRUSTED_PROXY_HOPS` (default 1) from the **right**; header shorter than that ⇒ peer address.
- Non-IP entry ⇒ client unknown (logged once), throttles fall back to the peer.

### 11.3 Making per-visitor throttling work through SSR
- Storefront edge writes the visitor IP: nginx `proxy_set_header X-Real-IP $remote_addr;` (overwrite, never pass a
  browser value). Route handlers/server code set `X-Forwarded-For: <x-real-ip>` only on `no-store` calls.
- If the Next server connects **directly** to Django: put the Next server's IP in `TRUSTED_PROXY_IPS`
  (HOPS=1). Pin the container IP — a changed IP silently drops trust (firefly.W003 only warns when the list is empty).
- If it goes **through the API's reverse proxy** (usual): that proxy must trust XFF from the storefront host
  (nginx `set_real_ip_from <storefront-ip>; real_ip_header X-Forwarded-For;`, Traefik `forwardedHeaders.trustedIPs`)
  and Django trusts the proxy. Just adding the storefront IP to TRUSTED_PROXY_IPS is not enough behind an appending proxy.
- Otherwise ask backend to raise `THROTTLE_ANON` (+ `THROTTLE_SEARCH_SUGGEST`, `THROTTLE_PAYMENT_STATUS`) to
  whole-shop size — before launch and before big SMS campaigns (short links = 1 API call per click).

### 11.4 Host / scheme pitfalls for SSR
- Node `fetch` ignores a custom `Host` header ⇒ the URL host is what Django sees. Internal URLs (`http://web:8000`)
  ⇒ (a) must be in `ALLOWED_HOSTS` via `EXTRA_ALLOWED_HOSTS` else 400 DisallowedHost (HTML, not JSON) [live],
  (b) every `image`/media URL in responses becomes `http://web:8000/...`, (c) with `USE_HTTPS=True`
  (`SECURE_SSL_REDIRECT`) plain-HTTP calls 301 to https unless you send `X-Forwarded-Proto: https`, (d) separate
  backend cache entries per host. ⇒ Call the public API origin (or use a single-origin topology where the public
  host is also what SSR calls).
- `next/image`: add the API (or storefront, in single-origin) host + `/media/**` to `images.remotePatterns`.

---------------------------------------------------------------------------------------------------------------------

## 12. Deployment

### 12.1 Backend env relevant to a separate storefront
| Var | Effect | Recommendation |
|---|---|---|
| `SITE_DOMAIN` (default `firefly-core.ir`, silent) | ALLOWED_HOSTS, CORS + CSRF origins (https+http), default STOREFRONT_URL, default result-URL allowlist, **JSON-LD page+image URLs**, back-in-stock SMS link, FCM image URL | = storefront public domain |
| `STOREFRONT_URL` (no trailing slash; default `https://SITE_DOMAIN`) | pay link, sitemap `<loc>`, bank callback URL, robots `Sitemap:`, short-link base, linker/shortener absolute targets | storefront origin |
| `SHORT_LINK_BASE_URL` (default `STOREFRONT_URL/s/`) | panel/QR short URLs | leave default or short domain |
| `EXTRA_ALLOWED_HOSTS` | extra Host values | add API host (e.g. `api.firefly-core.ir`) in split setup, internal names if used |
| `TRUSTED_PROXY_IPS` / `TRUSTED_PROXY_HOPS` | XFF trust | proxy IP(s) (+ storefront IP if direct) |
| `GATEWAY_RESULT_URL_ALLOWED_HOSTS` | result-page host allowlist | default usually fine |
| `USE_HTTPS=True` | SSL redirect, secure cookies, HSTS (3600 default) | required in prod |
| `DEBUG=False` | default is True! | required |
| `REDIS_URL` / `SITE_CACHE_REDIS_URL` | throttle counters / response cache | two separate Redis instances |
| `THROTTLE_ANON` etc. | §11 | size for SSR |
| `DOCUMENTATION_REQUIRE_STAFF` | `/api/v1/docs/` visibility | optional |
CORS/CSRF lists are `SITE_DOMAIN` (+ localhost:3000/8000) only — no env to extend, no `www.` variant, STOREFRONT_URL
host not added. Irrelevant if all API calls are server-side (recommended); matters for any browser→API call.

### 12.2 Topology A — single public origin, path-routed (simplest; matches backend assumptions)
```nginx
server { server_name firefly-core.ir;                       # SITE_DOMAIN = firefly-core.ir, STOREFRONT_URL default
  location /api/v1/            { proxy_pass http://web:8000; proxy_set_header Host $host;
                                 proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for; proxy_set_header X-Forwarded-Proto https; }
  location = /sitemap.xml      { proxy_pass http://web:8000; proxy_set_header Host $host; ... }
  location /media/             { alias /app/media/;   # volume media_data
                                 add_header X-Content-Type-Options nosniff;
                                 add_header Content-Security-Policy "default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; sandbox"; }
  location /static/            { proxy_pass http://web:8000; }          # WhiteNoise (Next uses /_next/)
  location /secureAccessPanel/ { proxy_pass http://web:8000; ... }      # admin; /ckeditor/ too
  location /                   { proxy_pass http://next:3000; proxy_set_header Host $host; proxy_set_header X-Real-IP $remote_addr; }
}
```
- Bank callback, sitemap, JSON-LD images, FCM images, admin "View on site" all work without extra rewrites.
- Keep storefront route handlers outside `/api/v1/`. robots.txt via Next route (or nginx → `/api/v1/robots/?format=txt`
  with key + `Accept: text/plain`).
- SSR calls `https://firefly-core.ir/api/v1/...` (public) ⇒ correct image hosts; trust chain per §11.3.

### 12.3 Topology B — split hosts (`firefly-core.ir` Next, `api.firefly-core.ir` Django)
- Backend: `SITE_DOMAIN=firefly-core.ir`, `STOREFRONT_URL=https://firefly-core.ir` (or unset), `EXTRA_ALLOWED_HOSTS=api.firefly-core.ir`.
- Storefront host must proxy to API: `/api/v1/payment/gateway/callback/` (GET+POST, slash), `/sitemap.xml`,
  `/media/` and `/static/` (JSON-LD/FCM images on SITE_DOMAIN). Next `/static/*` rewrite conflicts with a
  `public/static` folder — don't use one.
- API `image` fields point at `api.firefly-core.ir/media/...` (request host) — fine for browsers.
- Admin "View on site" lands on the API host (404).
- If you choose `SITE_DOMAIN=api.firefly-core.ir` instead: JSON-LD page URLs and back-in-stock SMS links point at
  the API host (wrong) and must be rewritten storefront-side — avoid.

### 12.4 Other deployment facts
- `/media/` is never served by Django with `DEBUG=False`; the proxy must serve volume `media_data` (+ the two headers
  above; SVGs/ckeditor uploads can carry scripts). Comment in docker-compose claiming WhiteNoise serves media is wrong.
- Web service only `expose`s 8000 (never publish it: `X-Forwarded-Proto` is trusted from anyone under USE_HTTPS).
- Proxy body limit > largest multipart (5 MB images; JSON limit 2.5 MB ⇒ 413 `request_too_large`).
- API key: panel "تنظیمات › کلید های دسترسی API" (superuser-only page, even if permission granted). One key per
  client (web, Android, iOS) so each can be disabled independently; deleted keys can't be restored; disable takes ≤60 s.
- Health: Django `/` redirects to Swagger; scheduler container reports unhealthy by design.
- Run `python manage.py check --deploy` (W003 empty TRUSTED_PROXY_IPS, W001/W070 Redis, E022 gateway key…).
- After changing SITE_DOMAIN/STOREFRONT_URL: `clear_site_cache`.

---------------------------------------------------------------------------------------------------------------------

## 13. Implementation checklists

**General**
- [ ] `FIREFLY_API_URL` = public API origin, `FIREFLY_API_KEY` server-only; `lib/firefly.ts` starts with `import 'server-only'`.
- [ ] `trailingSlash: true`; `metadataBase = new URL(STOREFRONT origin)`; `<html lang="fa" dir="rtl">`.
- [ ] Logic branches on `data.errors[0].code`.
- [ ] Throttle plan agreed (XFF trust or raised `THROTTLE_*`), storefront edge sets `X-Real-IP`.
- [ ] Every path in §2.1 answers (200/redirect/404 as appropriate); `/product/list/` generic listing; `/contact-us/`.

**robots.txt** — [ ] one of route handler / robots.ts; [ ] errors throw (never served as file); [ ] staging:
`block_all_crawlers` + auth/X-Robots-Tag; [ ] nginx variant forces `Accept: text/plain`, API `Host`, TLS verify.

**Redirects** — [ ] proxy.ts with list set + resolve only for listed paths; [ ] `path` = encoded pathname+search;
[ ] 301/302 via `NextResponse.redirect`, 410 via status page; [ ] failures ⇒ `NextResponse.next()`; [ ] resolve
never cached; [ ] matcher excludes `_next`, `api/`, `s/`, `media/`, `static/`, robots, sitemap, prefetch
*(prefetch superseded: prefetches reach the proxy and are only marked, see the note under §4.4)*.

**Short links** — [ ] `app/s/[code]/route.ts` force-dynamic, 302, 404/410/503 mapping; [ ] no internal links to `/s/`;
[ ] optional `skipTrailingSlashRedirect`; [ ] short domain DNS/TLS + `SHORT_LINK_BASE_URL` aligned.

**Sitemap** — [ ] rewrite/proxy `/sitemap.xml`; [ ] no `app/sitemap.ts`/`public/sitemap.xml`; [ ] all `<loc>` patterns routed.

**Payments** — [ ] callback prefix proxied (GET+POST, slash kept; curl-verified 302); [ ] `result_url` set to storefront
result page and host allowed; [ ] result page reads `/payment/{uuid}/status/`, noindex, dynamic; [ ] `/order/pay/[token]` dynamic, noindex.

**SEO metadata** — [ ] `title.absolute = page_title`; [ ] omit empty description/keywords; [ ] canonical =
`canonical_link ?? own path`; [ ] JSON-LD both blocks, `<` escaped, never use its prices; [ ] meta_tags (pages/home)
property vs name; [ ] synthesized OG/Twitter elsewhere; [ ] noindex for drafts and private/transactional routes;
[ ] category path canonicalization (308); [ ] FAQPage/Organization JSON-LD built by storefront; [ ] extra snippets
injected by position, all pages fetched.

**Caching** — [ ] `cache()` dedupe; [ ] revalidate table §10; [ ] 404 ⇒ notFound, other errors ⇒ throw; [ ] no
Authorization/XFF on revalidated fetches; [ ] normalized query strings; [ ] decision recorded for blog view counting.

**Deployment** — [ ] SITE_DOMAIN = storefront domain; [ ] `/media/` + `/static/` reachable on SITE_DOMAIN;
[ ] EXTRA_ALLOWED_HOSTS for API host; [ ] TRUSTED_PROXY_IPS pinned; [ ] `next/image` remotePatterns;
[ ] `clear_site_cache` after env changes; [ ] separate API keys per client.

---------------------------------------------------------------------------------------------------------------------

## 14. Suspected backend bugs / inconsistencies (verified)

1. **Two different "storefront origins".** JSON-LD (`product/services/structured_data.py:20-21`,
   `blog/services/structured_data.py:14-15`) and the back-in-stock SMS link (`product/services/notifications.py:135`)
   use `https://{SITE_DOMAIN}`; sitemap, pay link, bank callback, robots Sitemap line, short links and linker use
   `STOREFRONT_URL`. Live (dev): JSON-LD `offers.url = https://localhost/product/samsung-galaxy-s25-ultra/` vs sitemap
   `<loc>http://localhost:3000/product/samsung-galaxy-s25-ultra/</loc>`. Any deployment where
   `STOREFRONT_URL ≠ https://SITE_DOMAIN` (port, scheme, other host) publishes JSON-LD/SMS links to the wrong origin.
   The `utils/sitemaps.py` docstring assumes they are equal.
2. **JSON-LD images are on SITE_DOMAIN, API images on the request host.** Product `image` =
   `http://localhost:8000/media/...` while `structured_data[0].image = https://localhost/media/...` [live]; same for blog
   publisher logo. Requires `/media/` + `/static/` to be served on SITE_DOMAIN — not documented as a storefront requirement.
3. **Admin offers meta tags that are never published.** `SeoAdminMixin.inlines = (MetadataAdminInline,)` is attached
   to Category, ProductList, Product, Brand (`product/admin.py:315,363,666,2889`), blog Category and Post
   (`blog/admin.py:71,141`) and Page; only `pages/serializers.py` and `homepage` serialize `meta_tags`. Product/
   category/brand/list/blog responses have no `meta_tags` key [live] ⇒ operator OG tags silently ignored.
4. **Admin "View on site" points at the API host.** `view_on_site=True` (default) + no `django.contrib.sites` ⇒
   `contenttypes.views.shortcut` returns `302 http://localhost:8000/product/samsung-galaxy-s25-ultra/` [live, via
   shortcut()] instead of STOREFRONT_URL — 404 for split-domain deployments.
5. **Stale docs/comments about STOREFRONT_URL.** `firefly_core/settings.py:93-99` ("The API builds exactly one
   outward-facing URL -- the pay-by-link page") and `.env.example:45-47` ("Only the pay-by-link URL") are wrong:
   it also drives sitemap, bank callback, robots, short links, linker (deployment guide flags .env.example only).
6. **Trailing-slash contract broken for two generated URLs.** storefront-seo guide: "every storefront URL the backend
   builds ends with /", but `payment_link_url` → `/order/pay/<token>` (`order/services/payment_link.py:127`) and
   `short_url` → `/s/<code>` have none ⇒ extra 308 on every SMS click with `trailingSlash: true` (the guide only
   mentions the short-link case).
7. **Dev fixture result URL is not allowed in the dev env.** `GatewaySetting.result_url =
   https://firefly-core.ir/payment/callback/` while `GATEWAY_RESULT_URL_ALLOWED_HOSTS = ['localhost']`
   (`result_url_is_allowed(...) == False` [live]) ⇒ starting any gateway payment in this dev setup fails with
   `gateway_result_url_invalid` (503), and callbacks redirect to the production domain [live].
8. **Gateway callback without trailing slash returns 500 on POST** (`APPEND_SLASH` + POST) [live]. Banks always get
   the slashed URL, but any proxy that strips the slash breaks POST-returning gateways.
9. **Unicode slugs in sitemap are not percent-encoded.** A Persian product slug yields
   `<loc>http://localhost:3000/product/کفش-زمستانی/</loc>` (verified with an in-memory ProductSitemap) — sitemaps.org
   requires RFC 3986-escaped URLs. Not visible with the ASCII-only sample data.
10. **No reserved-slug protection for storefront namespaces.** Product slug `list` ⇒ `/product/list/` and blog post slug
    `category` ⇒ `/blog/category/` collide with `/product/list/<slug>/` and `/blog/category/<path>/`; only pages reserve
    `list` (`pages/models.py:16`).
11. **FAQ structured data exists but is unreachable.** `faqs/models.py:93 structured_data()` returns FAQPage JSON
    (as a string) but no serializer/endpoint exposes it.
12. **CORS/CSRF origins ignore STOREFRONT_URL** (`settings.py:170-195`): only SITE_DOMAIN (+ localhost) and no env
    override; a storefront on a host ≠ SITE_DOMAIN (or `www.` variant) cannot call the API from the browser.
13. **Dead email template.** `password_reset_link` (vars `email`, `link`) is declared in `email_center/models.py` and
    documented in the panel guide generator, but no code sends it (reset is OTP-only).
14. **Doc contradiction on server caching.** settings-api guide (§1 line 244) says global JSON responses "are not
    cached server-side; every request reads the DB"; site_cache caches `/global/settings/` (and 11 others) for up to
    30 min (write-invalidated, so observable freshness is the same).
15. **Docs example inconsistency on listing route.** storefront-seo uses `/products/?has_discount=true` as a redirect
    target while fixtures (homepage/menu) use `/product/list/?has_discount=true`; neither is generated by code, but
    the storefront must pick and support one (or both).

---------------------------------------------------------------------------------------------------------------------

## 15. Quick reference — SEO edge endpoints

| Method | Path | Key | Cache (storefront) | Counts | Success shape |
|---|---|---|---|---|---|
| GET | `/api/v1/robots/` (`?format=txt`) | yes | 60–300 s | no | `{rules[], sitemaps[], content}` / text |
| GET | `/api/v1/redirects/resolve/?path=` | yes | never | hit_count | `{source_path, target, redirect_type, status_code}` |
| GET | `/api/v1/redirects/list/?limit=&page=` | yes | 60–300 s | no | paginated `RedirectRule[]` |
| GET | `/api/v1/shortener/{code}/` | yes | never | visit_count | `{code, target_url}` |
| GET | `/sitemap.xml` (`?p=`) | **no** | optional CDN | no | XML urlset |
| GET/POST | `/api/v1/payment/gateway/callback/{gw}/{token}/` | **no** | never | settles payment | 302 → result_url?result&payment&code |
| GET | `/api/v1/global/extra-snippets/` | yes | 300 s | no | paginated `{id, description, position, type, snippet}` |
| GET | `/api/v1/global/settings/` | yes | 300 s | no | site name/logo/favicon/contact |
