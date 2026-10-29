# Firefly Core — Product / Catalog API: Frontend Integration Digest

Scope: `product-api.txt` (read in full), plus the storefront-relevant facts from `catalog-inventory-backend.txt`.
Everything below was checked three ways: against the guide, against `schema.yaml`, and against the live dev server
at `http://localhost:8000` (Oct 15 2026 data). I also read the backend code (`product/*.py`, `comment/*.py`,
`category/*.py`, `seo/models.py`, `utils/*`) wherever the docs were ambiguous.
Legend: **[V]** = verified live. **[C]** = verified in code. **[D]** = guide only (could not reproduce, e.g. no
active discounts or staff token in dev).

---------------------------------------------------------------------------------------------------------------------

## Update 2026-10-29 (backend `new-requests`; product-api §4, §7, §9)

| change | storefront |
|---|---|
| `GET /product/list/?has_timed_discount=true` lists only products whose card counts down: the representative variant's discount in force **ends** (a `TimedDiscount`, or a manual discount with an end). `false` lists the rest. Same `true/false/1/0` rule as the other booleans. | Listing param, a switch in the filter panel, chip «فقط پیشنهادهای شگفت‌انگیز», generic title «پیشنهادهای شگفت‌انگیز» (§6.4, §6.5). |
| Category detail: `banner_style` (`style_1`…`style_4`, always present) and `banners[]` (`{id, title, image, mobile_image, alt, link}`; active, in order; `[]` for none; only on the detail, not the list). `image` never null and never resized; `mobile_image` null → `image`; `link` null → not a link. | `CategoryBanners` under the category's head, above the listing, in the homepage banner styles (grid, carousel, cards, mosaic). |
| `comment_count` / `question_count` (PDP) count **replies at any depth**, the shop's included, none under a hidden parent. The comment list's `count` is still root threads. | Tab badges unchanged; the summary's «N دیدگاه» counts replies too. |

---------------------------------------------------------------------------------------------------------------------

## 0. TL;DR: the 20 things that will bite you

1. **Storefront routes are fixed by the backend** (sitemap, JSON-LD, menus, breadcrumbs, homepage links). You must
   serve exactly these, each with a trailing slash:
   - `/product/<slug>/`
   - `/product-category/<path>/`, where `<path>` is the slug chain from the root, e.g. `digital/mobile-phone`
   - `/brand/<slug>/`
   - `/product/list/<slug>/`
   - **`/product/list/?<query>`**: a generic listing page with no slug, used by menus and homepage "view all" links
   (§2).
2. Every response is `{msg, code, data}`. Show the text in `data.errors[0].detail` and branch on
   `data.errors[0].code`. Never use `msg` for either, except for 3 write endpoints whose 201 `msg` is a ready-made
   success sentence.
3. Pagination: build the pager from `total_pages` and `page_size`. A page out of range, `page=0` or `page=abc` gives
   **404 `not_found` with "صفحه نامعتبر"**, not an empty array. `next` and `previous` are absolute **API** URLs, so
   don't give them to the browser.
4. Do not hardcode the page size. `GET /product/settings/` → `paginator_number` (12 in the guide, **24 in dev**).
   `limit` is capped at 100.
5. Prices are integer **Toman**. Show `final_price`, and strike through `price` only when `has_discount`. The JSON-LD
   `offers.*price` values are in **Rial (×10)**, so never read prices from `structured_data`.
6. `discount_time_remaining` is the **end timestamp in ms**, not a duration.
7. The **ID you add to the cart is `variant.id`**, never `product.id`. Start the quantity at `order_limit_min`.
   `order_limit_max === 0` means **no cap**.
8. Cards **don't carry variants**. For `type === 'variable'`, fetch `GET /product/detail/<slug>/variants/` when the
   buy button is clicked. The PDP already has `variants` and `variant_options` inline.
9. To resolve a variant, the set of selected value ids must equal `attribute_value_ids` exactly. The selection may
   not exist, in which case show "این ترکیب موجود نیست".
10. `has_available_variant` is **static**. It doesn't account for the current selection, so compute dynamic
    availability client-side (§5.2).
11. In-stock is computed live, after holds in other carts are subtracted. Variant `in_stock` is the only flag that
    tells you whether a variant can be bought. `low_stock_quantity` is **marketing text only**: never use it as a
    quantity cap, and remember that `0` is falsy.
12. **Notify-me is per product, not per variant.** It is refused with 400 `stock_notification_already_in_stock` if
    **any** variant can be bought, so show it only when the **product-level** `in_stock` is false. The guide's §17.2
    snippet is wrong on this point; see §11.
13. `major_price`, `major_min_order_limit` and `enable_major` are **display only**. Checkout never applies them, so
    don't render them, or render "contact us for wholesale".
14. Unknown `category`, `brand` or `list` slug: `/product/list/` returns **200 with `count: 0`**, but `/product/filters/`
    returns **404**. Validate slugs through the detail endpoints.
15. Invalid `attribute_values` and boolean params are **silently ignored or return 0 results**. An invalid `sort` or
    `min_price`/`max_price` returns **400**.
16. `product_count` in `/category/list/` counts **direct products only** (parents usually show 0).
    `/filters/` counts the whole subtree.
17. `default_sorting` on a category or list page is **not applied** by the server. Send it yourself as `sort`.
18. SEO: `page_description` and `page_keywords` come back as `""` when unset, so omit those tags. If
    `canonical_link` is null, self-canonicalize. `structured_data` is an **array** and `breadcrumb_structured_data` is
    an **object**. Use `noindex` when `is_unpublished`.
19. Slugs may be **Persian** (`allow_unicode=True`). Next.js may give you `params` still percent-encoded, so call the
    API with `encodeURIComponent(decodeURIComponent(slug))`.
20. With SSR or a BFF, every guest shares your server's IP. That means one 2000/h anon budget and **one 10/h
    comment-submit budget for the whole shop** unless backend ops add your server to `TRUSTED_PROXY_IPS` and you
    forward `X-Forwarded-For` (§9).

---------------------------------------------------------------------------------------------------------------------

## 1. Global contract (applies to every endpoint here)

### 1.1 Headers
| Header | When | Notes |
|---|---|---|
| `X-API-Key` | every request | Missing → 401 `api_key_missing`; invalid or disabled → 401 `api_key_invalid` (a disabled key still works for up to 60 s because of caching). Checked before the token. **Keep it server-side** (BFF / Route Handler). Disabled in dev. |
| `Authorization: Bearer <access>` | optional, but **required for the wishlist** | On public endpoints an **invalid or expired token is silently treated as a guest** (no 401). Effects: identity on comment submit and notify, `is_current_user` on comments, `is_in_wishlist` on cards and the PDP, staff preview of drafts. On wishlist endpoints a bad token returns 401 `token_not_valid` **[V]**. |
| `Content-Type: application/json` | POSTs | |

Gotcha **[V]**: if a logged-in user's token has expired, comment submit treats them as a guest. They get 400
`invalid`/`name` ("وارد کردن نام برای کاربران مهمان الزامی است."). Refresh the token before submitting.

### 1.2 Envelope
```ts
interface ApiEnvelope<T> { msg: string; code: number; data: T }   // msg = fixed Persian sentence per HTTP status
interface ApiErrorData {
  type: 'validation_error' | 'client_error' | 'server_error';
  errors: { code: string; detail: string; attr: string | null }[];
  retry_after?: number;        // on 429
  feature?: string;            // on 503 feature_disabled, e.g. "stock_notifications"
  feature_name?: string;       // Persian feature name, on 503
}
```
- `validation_error`: `attr` is the field or query-param name. Show the message under that field. Array items use
  an indexed name, e.g. `positive_points.0` **[V]**.
- `client_error`: `attr` is null; show a general message.
- `server_error`: in this API it only appears as **503 `feature_disabled`**, which is intentional, not a crash.
- The success `msg` is meant for display in exactly 3 places: comment submit 201, notify 201, and wishlist POST
  201/200.
- **204** (wishlist DELETE) has **no body and no envelope**, so don't call `.json()` on it.

### 1.3 Pagination (every list endpoint)
```ts
interface Paginated<T> {
  count: number;          // total results (for comments: ROOT threads only)
  total_pages: number;    // >= 1, even for an empty list
  current_page: number;   // 1-based
  page_size: number;      // the size actually applied
  next: string | null;    // absolute API URL, e.g. "http://localhost:8000/api/v1/product/list/?limit=1&page=2"
  previous: string | null;
  results: T[];
}
```
- Query params are `page` (default 1) and `limit` (default 20; `/product/list/` defaults to settings
  `paginator_number`; max 100; silently capped).
- `limit=0`, `limit=-3`, `limit=null` and `limit=abc` all fall back to the default **[V]**.
- `page=99`, `page=0` and `page=abc` return **404** `not_found` with detail "صفحه نامعتبر" **[V]**. Redirect the user to
  page 1.

### 1.4 Data conventions
- **Money**: integer Toman everywhere, with no decimals or separators. Format on the client, e.g.
  `new Intl.NumberFormat('fa-IR').format(n) + ' تومان'`.
- **Dates**: ISO-8601 with a server offset, e.g. `2026-09-02T12:11:47.738164+03:30`. Some values have no fraction:
  `2025-08-14T15:00:00+03:30` **[V]**.
- **Images**: absolute URLs built from the **request's Host header**. In dev that is `http://localhost:8000/...`.
  There is no `USE_X_FORWARDED_HOST`, so your BFF **must call the API using its public hostname**. If it uses an
  internal docker hostname, image URLs will point at that hostname **[C]**. Add the API host to
  `images.remotePatterns` if you use `next/image`.
- **Image null rules**: product, category (image and icon), brand, gallery and bundle-item images are **never null**.
  If unset they fall back to `<api>/static/defaults/default.png` (an 800×800 placeholder). **Only `variant.image` can be
  null**; when it is, fall back to `product.image`.
- **Image sizes [C]**:
  - Product, gallery, variant and category images: **500×500 JPEG crops** (ResizeToFill, quality 60).
  - Brand logo: **70×70 JPEG crop**.
  - Category icon: re-encoded as **JPEG**, quality 70, so **transparency is lost**.
  - Attribute `pattern`: original file.
  - **No full-resolution or zoom image is exposed** anywhere.
- **Dev caveat [V]**: in dev the `/media/CACHE/...` URLs return **404** because there is no `media/` folder.
  Implement an `onError` image fallback.
- **Rich HTML**: product `content`, category/brand/list-page `content` and `consider_before_buying.text`.
  - `src`, `href`, `poster`, `data-src` and `srcset` attributes that point at `/media/` or `/static/` are already
    absolute (API host).
  - Internal storefront links such as `/product/x/` and `/page/terms/` are **left relative**. Intercept them for
    client-side navigation.
  - External and `//cdn` URLs are untouched.
  - The HTML is admin-authored (CKEditor). Render it with `dangerouslySetInnerHTML`; sanitizing it is still advisable.
- **Plain text**: comment `review`, `title`, `name` and the points must be **escaped** because they are not HTML.
  `description` (product, category, brand, list-page) is plain text.
- **Publication**: every product, category, brand and list page is published or draft. A draft returns **404**,
  indistinguishable from a missing record **[V]**. The only exception is PDP and variants for staff (§3.10).
  A **draft category hides its whole subtree** from the category list, its detail page, product listing by category,
  breadcrumbs and the sitemap. The one place drafts still appear is the card's `categories[]` array.

### 1.5 Server-side response cache
The following are cached by the backend (`site_cache`) until something they read changes:
- `/product/list/`, `/detail/<slug>/` and `/variants/`: up to 600 s
- `/filters/`: up to 600 s
- `/category/list/` and `/brand/list/`: up to 1800 s

The cache lifetime is shortened automatically at time boundaries such as a discount window. The backend sends **no
`Cache-Control` or `ETag`** **[V]**, so storefront caching (`revalidate`) is your own decision. `is_in_wishlist` is
per-viewer even when the response is cached: the server substitutes it per viewer. Still, never share a
token-bearing response with other users in your own cache.

Observation **[V]**: during my session, product images were attached to the data (`updated` = 22:41 local). For a
few minutes afterwards the list kept serving placeholder images, and detail showed `variant.image: null`, before it
converged. Probably the seeding bypassed signals. Not claimed as a bug.

---------------------------------------------------------------------------------------------------------------------

## 2. Storefront URL patterns (exact; the backend assumes these)

### 2.1 Canonical routes (all end in `/`)

| Entity | Storefront path | Built from | Next.js file | Evidence |
|---|---|---|---|---|
| Product | `/product/<slug>/` | `slug` | `app/product/[slug]/page.tsx` | `Product.get_absolute_url` [C]; sitemap [V]; JSON-LD `offers.url` [V]; menu `link_type: product` [V] |
| Product category | `/product-category/<path>/`, e.g. `/product-category/digital/mobile-phone/` | `path` (slug chain from the root) | `app/product-category/[...path]/page.tsx` (catch-all) | `Category.get_absolute_url` [C]; sitemap [V]; breadcrumb JSON-LD [V]; menu [V] |
| Brand | `/brand/<slug>/` | `slug` | `app/brand/[slug]/page.tsx` | `Brand.get_absolute_url` [C]; sitemap [V]; homepage fixture `"/brand/apple/"` |
| Product list page (curated landing) | `/product/list/<slug>/` | `slug` | `app/product/list/[slug]/page.tsx` | `ProductList.get_absolute_url` [C]; sitemap [V]; menu [V] |
| **Generic product listing** | **`/product/list/?<any /api/v1/product/list/ params>`** | query string forwarded unchanged | `app/product/list/page.tsx` | header menu fixture `"/product/list/?has_discount=true"` [V]; homepage `link_url` and carousel "view all" = `/product/list/?${new URLSearchParams(listing_query)}` (content guide) |

Other storefront paths in the same family (covered by other digests, listed for routing completeness):
- `/page/<slug>/`
- `/blog/<slug>/`
- `/blog/category/<path>/` (catch-all)
- `/search/?q=`, plus `/search/categories/`, `/search/brands/`, `/search/posts/` and `/search/pages/`
- `/s/<code>` (short links)
- `/order/pay/<token>`
- `/cart/` and `/checkout/` (marketing fixtures)
- The bank callback path `/api/v1/payment/gateway/callback/...` must be proxied from the storefront host to the API.

### 2.2 Live sitemap breakdown
`/sitemap.xml` is served outside `/api/v1/`, needs no key, and uses `STOREFRONT_URL` (`http://localhost:3000` in dev)
**[V]**. It contains 169 URLs:
- 74 × `/product/<slug>/`
- 2 × `/product/list/<slug>/` (`best-selling-digital`, `flagship-phones`)
- 8 × `/product-category/<root>/` and 24 × `/product-category/<root>/<child>/`
- 30 × `/brand/<slug>/`
- 5 × `/page/<slug>/`
- 19 + 7 blog URLs

`lastmod` is each record's `updated`.

### 2.3 Rules and gotchas
- Set **`trailingSlash: true`** in `next.config`. Every backend-generated URL ends in `/`.
- **Category route**: the API looks a category up by its **last slug only**: `GET /api/v1/product/category/<slug>/`.
  - Category slugs are globally unique.
  - Take the last segment of `[...path]` and fetch it.
  - If `data.path !== requestedPath.join('/')`, the category was moved. Do a 308 redirect to
    `/product-category/${data.path}/`. This is my recommendation, not a backend requirement.
- **Unicode slugs** are allowed for products, categories, brands and list pages (`SlugField(allow_unicode=True)`)
  **[C]**.
  - `<Link>` encodes them correctly.
  - Next.js may hand `params` to you still percent-encoded, so decode and then re-encode for the API:
    `encodeURIComponent(decodeURIComponent(slug))`.
  - A malformed `%` sequence causes a Next.js 500. The content guide recommends a `proxy.ts`/`middleware.ts` guard
    that returns 404.
- **Slug `list` collision** (see §11): `/product/list/` is the generic listing, so a product whose slug is literally
  `list` cannot be reached at `/product/list/`. The backend does **not** reserve `list` for products.
- **JSON-LD and SMS URLs use `https://<SITE_DOMAIN>`, not `STOREFRONT_URL`** **[V]**:
  - Breadcrumb JSON-LD items: `https://localhost/product-category/...` in dev.
  - `offers.url`: `https://localhost/product/<slug>/`.
  - Back-in-stock SMS link: `https://SITE_DOMAIN/product/<slug>/` (catalog guide §10).
  - The sitemap uses `http://localhost:3000/...`.

  In production, make sure `STOREFRONT_URL === https://SITE_DOMAIN`, or the two sets of URLs disagree.
- **JSON-LD `image` is `https://<SITE_DOMAIN>/media/CACHE/...`** **[V]**: it points at the storefront domain, not the
  API domain. If the storefront (Next.js) runs on SITE_DOMAIN, it must **proxy or rewrite `/media/*` and `/static/*`
  to the API**, or a reverse proxy must do it. Otherwise the structured-data images return 404.
- **Internal links inside rich HTML** are relative storefront paths. Route them with the router.

---------------------------------------------------------------------------------------------------------------------

## 3. Endpoint reference

Base: `/api/v1/product/`. All endpoints are public with `X-API-Key`, except the 3 wishlist endpoints, which require
a Bearer token. 17 endpoints in total:

| # | Method | Path | Auth | Paginated | Server cache |
|---|---|---|---|---|---|
| 1 | GET | `/api/v1/product/settings/` | key | no | no |
| 2 | GET | `/api/v1/product/category/list/` | key | yes (default 20) | 1800 s |
| 3 | GET | `/api/v1/product/category/<slug>/` | key | no | no |
| 4 | GET | `/api/v1/product/brand/list/` | key | yes (20) | 1800 s |
| 5 | GET | `/api/v1/product/brand/<slug>/` | key | no | no |
| 6 | GET | `/api/v1/product/list-page/list/` | key | yes (20) | no |
| 7 | GET | `/api/v1/product/list-page/<slug>/` | key | no | no |
| 8 | GET | `/api/v1/product/list/` | key (token optional) | yes (`paginator_number`) | 600 s |
| 9 | GET | `/api/v1/product/filters/` | key | no | 600 s |
| 10 | GET | `/api/v1/product/detail/<slug>/` | key (token optional; staff can preview drafts) | no | 600 s |
| 11 | GET | `/api/v1/product/detail/<slug>/variants/` | key (staff can preview drafts) | no | 600 s |
| 12 | GET | `/api/v1/product/detail/<slug>/comment/list/` | key (token optional) | yes (20, roots only) | no |
| 13 | POST | `/api/v1/product/detail/<slug>/comment/submit/` | key (token optional) | — | — |
| 14 | POST | `/api/v1/product/detail/<slug>/notify/` | key (token optional) | — | — |
| 15 | GET | `/api/v1/product/wishlist/list/` | key + **token** | yes (20) | no |
| 16 | POST | `/api/v1/product/detail/<slug>/wishlist/` | key + **token** | — | — |
| 17 | DELETE | `/api/v1/product/detail/<slug>/wishlist/` | key + **token** | — | — |

Suggested call order for a listing page:
1. Fetch settings once per app load and cache them in memory.
2. Fetch the category list once to build the menu, following every page because `limit` is capped at 100.
3. On a category page, fetch these 3 in parallel:
   - `category/<slug>/`
   - `filters/?category=<slug>`
   - `list/?category=<slug>`
4. On a filter change, re-fetch **only** `list/`.

### 3.1 `GET /product/settings/` — storefront catalog config
No params. Never writes. If the configuration row has never been saved, defaults are returned.
```ts
interface ProductSettings {
  paginator_number: number;              // default page size of /product/list/ (dev: 24; guide sample: 12)
  show_out_of_stock_label: boolean;      // show the «ناموجود» label on cards with in_stock=false (dev: true; default false)
  related_items_display_status: boolean; // global switch for the related-products section (dev: true)
  related_items_number: number;          // max related products (dev: 8; default 10)
}
```
Live dev response **[V]**: `{"paginator_number":24,"show_out_of_stock_label":true,"related_items_display_status":true,"related_items_number":8}`.
Cache it in memory per app load and re-read it occasionally. Don't persist it forever.

### 3.2 `GET /product/category/list/` — all published categories, in tree order
Query params:
- `search` (string): word match on the name. Persian/Arabic digits and the letters «ی» and «ک» are normalized.
- `parent` (category **slug**): returns **direct children only**. An unknown slug gives `count 0`.
- `show_in_homepage` (`true|false|1|0`; any other value is ignored **[V]**).
- `page`, `limit` (default 20, max 100).

Order: tree order (`tree_id`, `lft`), so a **parent always precedes its children**. Sibling order is set by the
admin (insertion by `created`, plus manual moves).
```ts
interface CategoryListItem {
  id: number; name: string; slug: string;
  path: string;                       // "digital/mobile-phone" — use for the URL
  parent_id: number | null;
  short_description: string | null;
  image: string;                      // 500x500 jpg or placeholder; never null
  icon: string;                       // jpg (no alpha) or placeholder; never null
  show_in_homepage: boolean;
  default_sorting: SortValue | null;  // schema also allows "" — treat "" as null
  product_count: number;              // DIRECTLY attached published products only (roots usually 0)
  created: string; updated: string;
}
```
Build the tree in one pass with `Map<id, node>`. Dev has 32 published categories (8 roots and 24 children, depth 2),
so you need `limit=100` or 2 pages. Depth is unlimited in the model (MPTT, no cap) **[C]**.

### 3.3 `GET /product/category/<slug>/` — category page content (no products)
Path `slug` is the category's own slug (the last path segment), not the full path. It returns 404 `not_found` if the
category is unknown, is a draft, or has a draft ancestor **[V]**.
```ts
interface CategoryDetail {
  id: number; name: string; slug: string; path: string; parent_id: number | null;
  short_description: string | null;
  description: string | null;         // plain text
  content: string | null;             // HTML
  image: string; icon: string;
  breadcrumb: CategoryBreadcrumbNode[];   // root → this category (last item = self)
  default_sorting: SortValue | null;
  consider_before_buying: ConsiderBeforeBuying | null; // only when text exists AND the "show on category page" flag is set
  question_answers: QuestionAnswer[];     // admin FAQ (may be [])
  banner_style: 'style_1' | 'style_2' | 'style_3' | 'style_4'; // 2026-10-29; unknown → style_1
  banners: CategoryBanner[];              // 2026-10-29; active, operator order; [] for none
  page_title: string;                     // falls back to name
  page_description: string;               // "" when unset → omit the meta tag
  page_keywords: string;                  // "" when unset
  canonical_link: string | null;          // admin override; null → self-canonical
  breadcrumb_structured_data: BreadcrumbListJsonLd; // Home → ancestors → self
  created: string; updated: string;
}
interface CategoryBreadcrumbNode { id: number; name: string; slug: string; path: string; parent_id: number | null }
interface ConsiderBeforeBuying { title: string | null; text: string /* HTML */; button: string | null }
interface QuestionAnswer { question: string; answer: string }
interface CategoryBanner {                // one = a single banner, several = a group; the style picks the design
  id: number; title: string /* "" = none */; image: string /* never null, not resized */;
  mobile_image: string | null /* null → image */; alt: string /* "" = none */;
  link: { url: string; title: string } | null /* null → no link */;
}
```
Products for the category: `GET /product/list/?category=<slug>` (includes every published descendant).

### 3.4 `GET /product/brand/list/`
Params: `search`, `page`, `limit`.

Order is "by name", but in practice **Unicode code-point order** **[V]**: پ, چ, ژ and گ sort after ی. The dev list ends
with "…هایسنس, پاناسونیک, چای احمد, چرم مشهد". If you need a real Persian A–Z, re-sort on the client with
`Intl.Collator('fa')`.
```ts
interface BrandListItem { id: number; name: string; slug: string; image: string /* 70x70 */; product_count: number; created: string; updated: string }
```
`product_count` counts all published products of the brand. Dev has 30 brands.

### 3.5 `GET /product/brand/<slug>/`
Returns 404 if the brand is unknown or a draft.
```ts
interface BrandDetail {
  id: number; name: string; slug: string; image: string; // 70x70 jpg crop only
  description: string | null; content: string | null;
  page_title: string; page_description: string; page_keywords: string; canonical_link: string | null;
  breadcrumb_structured_data: BreadcrumbListJsonLd;   // Home → Brand
  created: string; updated: string;
}
```
There is **no `product_count`** here. Use `count` from `/product/list/?brand=<slug>`.

### 3.6 `GET /product/list-page/list/`
Only `page` and `limit` are accepted. Published list pages are returned newest first.
```ts
interface ProductListPageListItem { id: number; name: string; slug: string; product_category_id: number | null; default_sorting: SortValue | null; created: string; updated: string }
```
Dev **[V]**:
- `best-selling-digital`: category 10001 (`digital`), sort `sale`
- `flagship-phones`: category 10002 (`mobile-phone`), sort `sale`
- Drafts: `amazing-offers` and `draft-product-list` (both 404)

### 3.7 `GET /product/list-page/<slug>/`
```ts
interface ProductListPageDetail {
  id: number; name: string; slug: string;
  description: string | null; content: string | null;
  product_category: CategoryLight | null;   // {id,name,slug,parent_id} — NO path! (see §11)
  show_category_filter: boolean;            // false → filters?list= returns categories: []
  default_sorting: SortValue | null;
  question_answers: QuestionAnswer[];
  page_title: string; page_description: string; page_keywords: string; canonical_link: string | null;
  breadcrumb_structured_data: BreadcrumbListJsonLd; // Home → category chain → this list page
  created: string; updated: string;
}
interface CategoryLight { id: number; name: string; slug: string; parent_id: number | null }
```
**What a list page is**: an admin-curated landing page defined by a set of attribute values, optionally scoped to a
category branch.
- **Membership [C]**: a product belongs if **at least one of its variants carries any one of the list's attribute
  values**. All values are ORed, regardless of attribute. Only values on variants count; spec-sheet values don't.
- If `product_category` is set, the product must also be in that category's **published subtree**.
- A list page with no values cannot be published.
- Products: `GET /product/list/?list=<slug>`. Filters: `GET /product/filters/?list=<slug>`.
- The list page response has **no `breadcrumb` array** (unlike category and product). Build the visible crumb from
  `breadcrumb_structured_data.itemListElement`, or from your category tree.

### 3.8 `GET /product/list/` — product cards, with filters and sorting
Used for category, brand, list-page and generic listing pages, the "view all" of homepage carousels, and the
products group of search. It is **not** used for the main search page (that is `/api/v1/search/`).

#### 3.8.1 Query params
| Param | Type / values | Semantics | Bad value behaviour |
|---|---|---|---|
| `search` | string | Word match: every word must appear in `name` **or** `extra_detail`, in any order, case-insensitive. Fa/Ar/Latin digits are unified, Arabic ي/ى/ك map to Persian ی/ک, ZWNJ counts as a space, kashida is ignored. Only the first 8 distinct words are used. Descriptions, content and specs are not searched. | empty means no filter |
| `category` | one slug | That category plus all **published** descendants. Commas are **not** supported (`digital,laptop` gives 0 **[V]**). | unknown or draft gives `count 0`, 200 **[V]** |
| `brand` | slug list, comma-separated | ORed across brands; blank entries ignored (`,samsung` works **[V]**) | unknown gives 0 |
| `list` | list-page slug | restricts to the list definition (§3.7) | unknown or draft gives 0 **[V]** |
| `attribute_values` | comma-separated value ids from `/filters/` | Same attribute: **OR**. Different attributes: **AND**, and the conditions must be met by **a single variant**. A group is also satisfied if the value appears in the product's **spec sheet** (§6.3). | `abc` or an unknown id gives 0, not an error **[V]**; empty means no filter |
| `min_price`, `max_price` | number (Toman) | At least one **purchasable** variant must have `final_price` inside the **whole** range (both bounds applied to the same variant). Discounts count only while active. | `abc` gives **400 `invalid`** with `attr` `min_price`/`max_price` **[V]**; negatives are accepted and give 0 results **[V]** |
| `in_stock` | `true\|false\|1\|0` (case-insensitive) | live purchasability, after holds in other carts are subtracted. `false` returns only unbuyable products (dev: 2 **[V]**). | any other value is **silently ignored** **[V]** |
| `is_special` | bool | special (admin flag) or non-special only | ignored if invalid |
| `special_first` | bool, default `true` | `true`: special products are pinned first under every sort. `false`: they are ranked like any other product. Homepage carousels send `false`. | invalid value keeps the pin |
| `has_discount` | bool | uses the **default/representative variant's** active discount only. A product without variants counts as not discounted. | ignored if invalid |
| `has_timed_discount` | bool (2026-10-29) | the representative variant's discount in force **ends** (`discount_end_time` non-null): exactly the cards with a countdown. `false`: every other product (no discount, an endless one, no variants). | ignored if invalid |
| `sort` | `date-desc` (default), `date-asc`, `price-desc`, `price-asc`, `sale` | see 3.8.2 | **400 `invalid_choice`**, `attr: "sort"` **[V]** |
| `page`, `limit` | int | default `limit` is `paginator_number`; max 100 | §1.3 |

All filters are combined with AND.

#### 3.8.2 Ordering (all sorts)
Products are ordered by these keys, in this order:
1. `is_special_product` DESC (dropped when `special_first=false`)
2. **purchasable now** DESC (always applied)
3. The chosen key:
   - `date-*` uses `created`.
   - `price-*` uses the representative variant's `final_price`.
   - `sale` counts units sold in **paid** orders (processing, packing, sent, delivered) over the last N days. N is
     the admin's `best_selling_window_days`, default 90; 0 means all time.
4. `id` DESC as a tie-break (ASC for `date-asc`), so pagination stays stable.

**[V]** `sort=price-asc` lists the 7 special products first, then the cheapest non-special product.
`sort=price-asc&special_first=false` starts at 180,000.

The **representative ("default") variant** is chosen by these rules, in order:
1. purchasable before not purchasable
2. admin-flagged "default"
3. has an active discount
4. lowest `final_price`
5. lowest `id`

This one variant supplies the card's prices and limits, the price sort and `has_discount`.

#### 3.8.3 Response: `Paginated<ProductCard>`
```ts
interface ProductCard {
  id: number;                       // internal product id (show product_code on the PDP instead)
  name: string;
  slug: string;
  extra_detail: string | null;      // subtitle line; searchable
  image: string;                    // 500x500, never null
  type: ProductType;                // 'simple' | 'variable' | 'downloadable' | 'virtual'
  badge: Badge | null;
  brand: BrandLight | null;
  categories: CategoryLight[];      // DIRECT categories, INCLUDING drafts → never build links from this
  in_stock: boolean;                // ≥1 variant purchasable right now (live, minus holds in other carts)
  is_special_product: boolean;
  is_collection: boolean;           // bundle
  enable_major: boolean;            // display-only wholesale flag
  rating: number;                   // 0..5, one decimal; 0 = no ratings yet → show «بدون امتیاز»
  rating_count: number;             // approved ROOT reviews that have a rating
  default_variant_id: number | null;            // null = product has no variants → disable buying
  default_variant_attributes: VariantAttributeLabel[]; // labels of the representative variant; [] for non-variable
  price: number | null;             // representative variant, before discount
  final_price: number | null;       // what will be charged; null only when there are no variants
  has_discount: boolean;
  discount_percent: number;         // rounded; 0 when no discount
  discount_end_time: string | null;
  discount_time_remaining: number | null; // END timestamp in ms (float), e.g. 1789936140000.0
  order_limit_min: number | null;   // start add-to-cart quantity here (1 = no minimum)
  order_limit_max: number | null;   // 0 = unlimited
  is_in_wishlist: boolean;          // viewer-specific; always false for guests
  created: string; updated: string;
}
interface Badge { id: number; name: string; badge_color: string /* #HEX background */; text_color: string /* #HEX */ }
interface BrandLight { id: number; name: string; slug: string; image: string }
interface VariantAttributeLabel { attribute_name: string; name: string }  // e.g. {attribute_name:"رنگ", name:"مشکی"}
```
Cards **do not** include `variants`, `variant_options`, `description`, `content`, `gallery`, `specifications`,
`breadcrumb`, `product_code`, comment counts, `rating_breakdown`, `bundle_items` or SEO fields.

Card guidance:
- Under the name, render `default_variant_attributes.map(a => \`${a.attribute_name}: ${a.name}\`).join('، ')` so the
  user knows which combination the price belongs to.
- Show the out-of-stock label only when `!in_stock && settings.show_out_of_stock_label`.
- Buy button:

```ts
async function onBuyClick(card: ProductCard) {
  if (card.default_variant_id == null) return;                    // nothing to sell → button disabled
  if (card.type !== 'variable') return addToCart(card.default_variant_id, card.order_limit_min ?? 1);
  const picker = await getVariants(card.slug);                     // cache per slug (refresh before checkout)
  if (picker.options.length === 0) return addToCart(picker.default_variant_id!, card.order_limit_min ?? 1);
  openVariantSheet(picker);                                        // §5.2
}
```

Edge responses **[V]**:
- An empty result is `{"count":0,"total_pages":1,"current_page":1,"page_size":24,"next":null,"previous":null,"results":[]}`.
- `limit=1000` gives `page_size` 100.

### 3.9 `GET /product/filters/` — facet metadata for one context
Send **at most one** of `category`, `brand` or `list`. If several are sent, only the first found is used, in the
priority order category > brand > list **[V]**. With none, the context is the whole store.

**An unknown or draft slug gives 404 `not_found`** **[V]**. This differs from `/product/list/`, which returns 200 with
`count 0`.
```ts
interface FiltersMetadata {
  categories: FilterCategoryOption[];
  brands: FilterBrandOption[];          // ordered by name (code-point order)
  attributes: FilterAttribute[];
  price: { min: number; max: number };  // final_price over PURCHASABLE variants of the context; both 0 if none
  sort_options: { value: SortValue; label: string }[]; // always all 5, with Persian labels — build the dropdown from this
}
interface FilterCategoryOption { id: number; name: string; slug: string; image: string; icon: string; product_count: number }
interface FilterBrandOption { id: number; name: string; slug: string; image: string }
interface FilterAttribute { id: number; name: string; input_type: InputType | null; values: FilterAttributeValue[] }
interface FilterAttributeValue { id: number; name: string; color: string | null; pattern: string | null /* absolute URL */ }
```

How the response varies by context **[V]**:

| Context | `categories` | `brands` | `attributes` |
|---|---|---|---|
| `?category=X` | **direct published children** of X. Each count covers that child's whole subtree within this context. A leaf has `[]`. | brands present in X's subtree | only attributes the admin marked **filterable on X itself**, **not inherited** from ancestors. A parent like `digital` returns `[]` **[V]**. Values are those actually present in products (on a variant or in the spec sheet), ordered by `display_priority` then name. Attributes are ordered by attribute name. |
| `?brand=X` | **all root categories** of the store, each counting X's products in its subtree. Zero-count roots are included (e.g. `samsung`: digital 4, all others 0). | always `[]` | always `[]` (so a brand page has no attribute facets) |
| `?list=X` | children of the list's category, counted within the list's definition. Only present if `show_category_filter` is set **and** a category is set; otherwise `[]`. | brands present in the list | exactly the attributes and values the admin configured as filterable for the list. They are **not** checked against the products. |
| none | all root categories with full subtree counts (dev: digital 26, home-appliance 12, …) | all published brands that have products | always `[]` |

Notes:
- The `product_count` of every option equals the `count` of `/product/list/` for the same combination.
- Options with **0 are not removed**, so hide or disable them yourself.
- **Facet counts are static per context.** They do not change as the user picks brands, attributes or price. Only
  re-fetch `/product/list/`.
- The values in `attributes[].values` are "offered" but **not necessarily in stock**.
- Use `price.min` and `price.max` as the slider bounds.

### 3.10 `GET /product/detail/<slug>/` — full PDP payload
This endpoint takes no query params. It returns 404 if the product is unknown or a draft. **Staff** (`is_staff` or
superuser token) also receive drafts, with `is_unpublished: true`. Show a warning banner and `noindex`.
```ts
interface ProductDetail {
  id: number;
  product_code: string;              // zero-padded id for display («شناسه محصول»), e.g. "010001" (string!)
  name: string; slug: string;
  extra_detail: string | null;
  description: string | null;        // plain text
  content: string | null;            // HTML («نقد و بررسی»)
  image: string;                     // featured image (NOT part of gallery)
  type: ProductType;
  content_type: 'general' | 'fragile_or_liquid' | 'documents'; // packaging for shipping; rarely shown
  badge: Badge | null;
  brand: BrandLight | null;
  categories: CategoryLight[];       // direct, may include drafts — don't link
  breadcrumb: CategoryBreadcrumbNode[]; // deepest FULLY-published chain, root → leaf; [] if none. Does NOT include the product.
  gallery: GalleryImage[];           // may be []
  variants: Variant[];               // ALL variants incl. out of stock; ordered: admin-default first, then id
  variant_options: VariantOption[];  // [] for non-variable products
  default_variant_id: number | null;
  specifications: ProductSpecification[];             // full table, sorted by display_priority, id
  highlighted_specifications: ProductSpecification[]; // subset with show_in_product_description=true (duplicates!)
  related_products: ProductCard[];   // card shape; [] when disabled
  consider_before_buying: ConsiderBeforeBuying | null; // product's own, else inherited from its first category
  question_answers: QuestionAnswer[];// admin FAQ (NOT user Q&A)
  comment_count: number;             // visible reviews, REPLIES INCLUDED at any depth (2026-10-29)
  question_count: number;            // visible questions with their answers
  rating: number;                    // one decimal; 0 = none
  rating_count: number;
  rating_breakdown: { score: 5 | 4 | 3 | 2 | 1; count: number; percent: number }[]; // always 5 rows, 5→1; percents rounded (may sum to 99)
  in_stock: boolean;
  is_special_product: boolean;
  is_collection: boolean;
  bundle_items: BundleItem[];        // [] unless is_collection
  enable_major: boolean;
  page_title: string; page_description: string; page_keywords: string; canonical_link: string | null;
  structured_data: ProductJsonLd[];  // ARRAY with exactly 1 element
  breadcrumb_structured_data: BreadcrumbListJsonLd; // OBJECT
  is_unpublished: boolean;
  is_in_wishlist: boolean;
  created: string; updated: string;
}
interface GalleryImage { id: number; image: string; alt: string /* never empty: falls back to product name */ }
interface ProductSpecification {
  id: number; attribute_id: number; attribute_name: string;
  values: string[];                       // may be []
  custom_attribute_value: string | null;  // free text
  show_in_product_description: boolean;
  display_priority: number;
}
interface BundleItem { variant: number; product_name: string; variant_name: string | null; quantity: number; image: string /* never null */ }
```
Related products are chosen in this order:
1. Return `[]` if `related_items_display_status` (global or per product) is off, or the number is 0.
2. Manual picks that are published and in stock, by priority.
3. If autofill is on (a panel-only setting), the newest published, in-stock products from the product's category
   subtree, widening to parent categories.
4. The newest in-stock products in the whole store.

So the section is usually **full and sometimes off-topic** **[V]**: `online-course-seo` lists car accessories. Selection
uses the stored stock flag, but each card's `in_stock` is live, so drive the button from the card.

### 3.11 `GET /product/detail/<slug>/variants/` — variant picker
Returns 404 for unknown or draft products (staff preview is allowed). Simple products answer too, with
`options: []` and one variant.
```ts
interface ProductVariants {
  product_id: number;
  type: ProductType;
  in_stock: boolean;
  default_variant_id: number | null;
  options: VariantOption[];   // == detail.variant_options
  variants: Variant[];        // == detail.variants (identical objects; verified equal on 12 products [V])
}
interface VariantOption {
  attribute_id: number;
  attribute_name: string;
  input_type: InputType;               // 'radio' | 'pattern' | 'color' | 'select'
  values: VariantOptionValue[];        // ONLY values used by this product's variants; sorted display_priority, name
}
interface VariantOptionValue {
  id: number; name: string;
  color: string | null;                // HEX for 'color'
  pattern: string | null;              // absolute image URL for 'pattern'
  display_priority: number;
  has_available_variant: boolean;      // STATIC: some purchasable variant carries this value
}
interface Variant {
  id: number;                          // ← send THIS to the cart
  sku: string | null;
  variant_name: string | null;         // "رنگ: مشکی | حافظه داخلی: ۲۵۶ گیگابایت | حافظه رم: ۱۲ گیگابایت"; null for simple
  image: string | null;                // 500x500; null → use product image
  attribute_value_ids: number[];       // [] for simple products
  price: number;                       // before discount
  final_price: number;                 // charged; floor 0
  discount: number | null;             // amount off right now; price - discount === final_price
  has_discount: boolean;               // === (discount !== null)
  discount_percent: number;            // 0..100 rounded (Python round: half-to-even)
  discount_start_time: string | null;  // of the APPLIED discount
  discount_end_time: string | null;
  discount_time_remaining: number | null; // END timestamp (ms)
  in_stock: boolean;                   // the ONLY buyability flag
  low_stock_quantity: number | null;   // "only n left" marketing number; 0 ≠ null
  order_limit_max: number;             // 0 = unlimited
  order_limit_min: number;             // 1 = no minimum
  packing_factor: number;              // ≥1 units per pack
  unit_name: string | null;            // «عدد», «بسته», ... (null → «عدد»)
  weight_grams: number | null;         // grams (old `weight` kg field is gone); 0 seen on virtual product [V]
  length_cm: number | null; width_cm: number | null; height_cm: number | null;
  major_price: number | null;          // wholesale — DISPLAY ONLY, never charged
  major_min_order_limit: number | null;
}
```
- Axis order is the order in which values are first met while walking the variants (default variant first). Render
  the axes in array order.
- An axis can have a **single value** (e.g. RAM "12GB" only on S25 Ultra). Render it preselected, or as static text.
- `type === 'variable'` does **not** guarantee that `options` is non-empty. Decide whether to *fetch* using `type`,
  and whether to *render the picker* using `options.length`.
- Cache the picker per slug. Stock is live, so refresh before checkout.

### 3.12 `GET /product/detail/<slug>/comment/list/` — approved reviews and Q&A as trees
Returns 404 if the product is unknown or a draft. **Staff cannot read comments of drafts either.**

Params:
- `comment_type` (`comment` or `question`; omit for both; an invalid value gives **400 `invalid_choice`** **[V]**)
- `page`
- `limit` (default 20)

Pagination counts **root threads only**. All replies are nested under their root, unpaginated.

Ordering:
- Roots: newest first **[V]**.
- `replies`: also **newest first**, at any depth. Reverse them for chronological display.

Withdrawn or unapproved comments are excluded.
```ts
interface ProductComment {
  id: number;                     // use as `parent` when replying
  name: string;                   // author display name; nameless phone-only accounts show «کاربر»; email never returned
  title: string | null;           // only on root reviews
  review: string;                 // ≤4096 chars, PLAIN TEXT → escape
  rating: 1 | 2 | 3 | 4 | 5 | null;   // null on replies/questions and on unrated reviews
  positive_points: string[];      // never null (schema leaves it untyped)
  negative_points: string[];
  comment_type: 'comment' | 'question';  // replies inherit the parent's type
  is_user_admin: boolean;         // official shop reply (written in the panel) → «پاسخ فروشنده» styling
  is_verified_buyer: boolean;     // «خریدار» badge (set automatically, see §8)
  is_current_user: boolean;       // the viewer wrote it → «شما»; always false for guests
  parent_id: number | null;
  replies: ProductComment[];      // recursive
  created: string;
}
```
Use the PDP's `comment_count` and `question_count` for the tab badges, not `count` from this list (which mixes both
types when unfiltered). Load this lazily, e.g. when the reviews tab scrolls into view, or with
`?comment_type=comment` and `?comment_type=question` per tab.

### 3.13 `POST /product/detail/<slug>/comment/submit/` — review, reply or question
Body (JSON):
```ts
interface CommentSubmitBody {
  review: string;                 // REQUIRED always, ≤4096
  name?: string;                  // REQUIRED for guests (≤255); ignored when the token is valid (account name used)
  email?: string | null;          // optional for guests; must be a valid email if sent; ignored for logged-in users
  comment_type?: 'comment' | 'question';   // default 'comment'; ignored on replies (parent's type is used)
  parent?: number | null;         // id of an APPROVED comment of THE SAME product
  rating?: number | null;         // 1..5, ROOT reviews only; omit or null for "no rating" (0 is an error)
  title?: string;                 // ≤255, root reviews only
  positive_points?: string[];     // ≤10 items, each 1..255 chars non-blank; root reviews only; duplicates silently removed
  negative_points?: string[];     // same rules
  website?: string;               // HONEYPOT — render hidden and leave empty
}
```
Success response:
```json
{"msg":"نظر شما با موفقیت ثبت شد و پس از تأیید نمایش داده می شود.","code":201,"data":{}}
```
**[V]** Show `msg` and close the form. **Do not re-fetch the list**: the new entry is queued for moderation, and the
rating won't change until it is approved.

- A filled honeypot gets the same 201, nothing is saved, and no quota is used **[V]**.
- A staff user posting from the site gets a normal queued comment, not an admin reply.
- Throttle (success-only): 10 per hour per user or IP, **shared with blog comments**. Over the limit you get 429
  `throttled` with `data.retry_after` and a `Retry-After` header.
- When the feature is off: **503 `feature_disabled`**, with `data.feature`, `data.feature_name`, operator text in
  `errors[0].detail`, and a `Retry-After` header that is advisory only. Hide the form. Reading comments is never
  blocked. To check ahead of time, use `/api/v1/global/feature-status/`.

Errors, all verified live **[V]** unless marked otherwise:

| Case | Status | `code` / `attr` | Persian `detail` |
|---|---|---|---|
| guest with no `name` | 400 | `invalid` / `name` | وارد کردن نام برای کاربران مهمان الزامی است. |
| no `review` (also `{}`) | 400 | `required` / `review` | این مقدار لازم است. |
| `rating: 7` | 400 | `max_value` / `rating` | این مقدار باید کوچکتر یا مساوی با 5 باشد. |
| `rating: 0` or negative | 400 | `min_value` / `rating` | این مقدار باید بزرگتر یا مساوی با 1 باشد. |
| `rating: "abc"` | 400 | `invalid` / `rating` | یک مقدار عددی معتبر لازم است. |
| rating, title or points on a reply or question | 400 | `invalid` / each of `rating`, `title`, `positive_points`, `negative_points` | این فیلد فقط برای ثبت نظر روی محصول قابل استفاده است. |
| more than 10 chips | 400 | `max_length` / `positive_points` | اطمینان حاصل کنید که این فیلد بیش از 10 عنصر ندارد. |
| a chip longer than 255 [D] | 400 | `max_length` / `positive_points.0` | طول این مقدار نباید بیشتر از 255 نویسه باشد. |
| a blank chip | 400 | `blank` / `positive_points.0` | این مقدار نباید خالی باشد. |
| points sent as a string | 400 | `not_a_list` / `positive_points` | باید یک لیست از مقادیر ارسال شود اما یک «str» دریافت شد. |
| title, name or review too long [D] | 400 | `max_length` / that field | طول این مقدار نباید بیشتر از … نویسه باشد. |
| `comment_type: "bogus"` | 400 | `invalid_choice` / `comment_type` | "bogus" یک انتخاب معتبر نیست. |
| `parent` missing or not approved | 400 | `does_not_exist` / `parent` | موردی با شناسهٔ «999999» یافت نشد. |
| `parent` belongs to another product [D] | 400 | `invalid` / `parent` | نظر والد متعلق به این محصول نیست. |
| bad email | 400 | `invalid` / `email` | پست الکترونیکی صحیح وارد کنید. |
| product unknown or draft | 404 | `not_found` | یافت نشد. |
| feature off [D] | 503 | `feature_disabled` | operator text or default |
| throttled [D] | 429 | `throttled` | `data.retry_after` |

Two quirks:
- Validation is **two-phase** **[V]**. Field-level errors are returned together first. The guest-name rule is checked
  only after every field passes: `{}` reports only `review`. Validate the name on the client.
- Error `attr` values for chips are indexed (`positive_points.0`). Split on `.` to map them to the form.

### 3.14 `POST /product/detail/<slug>/notify/` — back-in-stock SMS request
```ts
interface StockNotifyBody {
  first_name?: string;    // required for guests, ≤200
  last_name?: string;     // required for guests, ≤200
  mobile_number?: string; // required for guests; "09121234567" or "+989121234567" (normalized to E.164)
}
// Logged-in: {} is enough (name & mobile from account). A nameless phone-only account must send first/last name (else 400 invalid/first_name).
```
Success response:
```json
{"msg":"درخواست شما با موفقیت ثبت شد، در صورت موجود شدن کالا به شما اطلاع خواهیم داد.","code":201,"data":{}}
```
- A duplicate request for the same product and phone also gets 201. No new row is created, and a closed request is
  re-opened.
- There is no endpoint to track a request's status.
- When stock returns, one SMS is queued per open request and the request is closed. The SMS template is
  **disabled by default** on fresh installs, so nothing is sent until the admin enables it.

Errors, verified live **[V]** unless marked otherwise:

| Case | Status | `code` / `attr` | `detail` |
|---|---|---|---|
| **Product is currently purchasable** (any variant) | 400 | `stock_notification_already_in_stock` / `null` (`type: client_error`) | این کالا هم‌اکنون موجود است و می‌توانید آن را سفارش دهید. This is checked **before** identity, so an empty body on an in-stock product also gets it. |
| guest, no mobile (also `{}`) | 400 | `invalid` / `mobile_number` | شماره موبایل ضروری است. |
| malformed mobile, e.g. `"12"` | 400 | `invalid` / `mobile_number` | یک شماره تماس معتبر وارد نمایید. |
| guest with mobile but no name | 400 | `invalid` / `first_name` (then `last_name`, one at a time) | نام ضروری است. |
| name longer than 200 | 400 | `max_length` / `first_name` or `last_name` | طول این مقدار نباید بیشتر از 200 نویسه باشد. |
| product unknown or draft | 404 | `not_found` | یافت نشد. |
| feature `stock_notifications` off [D] | 503 | `feature_disabled` (`data.feature: "stock_notifications"`) | hide the button |

There is no dedicated throttle, only the global one. When you get `already_in_stock`, refresh the PDP and show
add-to-cart instead.

### 3.15 Wishlist (all require a token)
Without a token you get **401 `not_authenticated`**; with an expired or bad token, **401 `token_not_valid`** **[V]**.
Unlike the rest of this API, a bad token is **not** treated as a guest here. On `not_authenticated`, send the user to
login. On `token_not_valid`, refresh the token and retry once.

**`GET /product/wishlist/list/`** returns `Paginated<WishlistProductCard>`.

Params:
- `search`: words of the name only; `extra_detail` is not searched
- `in_stock` (bool; an invalid value is ignored)
- `sort`: `added-desc` (default) or `added-asc`. Anything else gives 400 `invalid_choice`/`sort`.
- `page`, `limit` (default 20, max 100)

Products the shop has unpublished are hidden, but the saved row is kept and reappears if the product is republished.
```ts
interface WishlistProductCard extends ProductCard { is_in_wishlist: true; added_at: string }
```

**`POST /product/detail/<slug>/wishlist/`** takes no body. It returns `201` if newly saved and `200` if already
saved. `added_at` is unchanged on a re-save. Out-of-stock products can be saved. Draft or unknown products give 404.
```json
{"msg":"محصول به علاقه‌مندی‌ها اضافه شد.","code":201,"data":{"is_in_wishlist":true}}
```

**`DELETE /product/detail/<slug>/wishlist/`** always returns **204 with no body**, even if the product is not saved,
the slug is unknown, or the product was unpublished. **Don't parse JSON.**

Throttle: POST and DELETE share the `saved_items` budget of **60/min per customer**, together with the blog reading
list. Reading the list only counts against the global limit. Over the limit you get 429 `throttled`.

`is_in_wishlist` on cards and the PDP is false for guests. For pages you cache publicly, fetch them **without** a
token. Then fill in the hearts on the client: either fetch your wishlist ids once (paging
`/wishlist/list/?limit=100`), or repeat the listing request with the token. Never cache a token-bearing response for
other users.

---------------------------------------------------------------------------------------------------------------------

## 4. Shared enums and JSON-LD types
```ts
type SortValue = 'date-desc' | 'date-asc' | 'price-desc' | 'price-asc' | 'sale';
// labels (from /filters/ sort_options): جدیدترین / قدیمی ترین / گران ترین / ارزان ترین / پرفروش ترین
type ProductType = 'simple' | 'variable' | 'downloadable' | 'virtual';
// simple: 1 variant, no picker. variable: picker. downloadable/virtual: published type only —
// NO digital delivery / download link flow exists in the backend (treat like simple; don't promise downloads).
type InputType = 'radio' | 'pattern' | 'color' | 'select';
// radio = text chip; pattern = swatch with background image `pattern`; color = colored circle `color`
// (always add name as title/aria-label); select = <select> for many values.
type CommentType = 'comment' | 'question';
interface BreadcrumbListJsonLd {
  '@context': 'https://schema.org'; '@type': 'BreadcrumbList';
  itemListElement: { '@type': 'ListItem'; position: number; name: string; item: string }[]; // position 1 = «خانه» https://SITE_DOMAIN/
}
interface ProductJsonLd {
  '@context': 'https://schema.org/'; '@type': 'Product';
  name: string; image: string /* https://SITE_DOMAIN/media/... */; description: string /* = page_description, may be "" */;
  sku: string; mpn: string;   // representative variant sku, else "<product_id:06>-<variant_id:06>", else product id
  offers:
    | { '@type': 'Offer'; url: string; priceCurrency: 'IRR'; price: string /* RIAL = toman×10; "0" if no variants */; availability: string }
    | { '@type': 'AggregateOffer'; url: string; priceCurrency: 'IRR'; lowPrice: string; highPrice: string; offerCount: number; availability: string };
  brand?: { '@type': 'Brand'; name: string };   // product brand, else site name
  review?: { '@type': 'Review'; author: { '@type': 'Person'; name: string }; datePublished: string /* YYYY-MM-DD */; reviewBody: string }[]; // ≤5 root reviews; no reviewRating, no aggregateRating
}
```
- `AggregateOffer` is used when the product is variable and **more than one variant is purchasable**. The range covers
  purchasable variants only, unless none is purchasable, in which case it covers all variants. Dev S25 Ultra
  **[V]**: `lowPrice` "785000000", `highPrice` "869000000", `offerCount` 3, `InStock`.
- `availability` is `https://schema.org/InStock` or `https://schema.org/OutOfStock`.
- The `Offer` `price` is the representative variant's final price ×10.

---------------------------------------------------------------------------------------------------------------------

## 5. Product page (PDP) behaviour

### 5.1 Data loading
- On the server: `GET /detail/<slug>/` without a token so it can be cached. A suitable `revalidate` is about 60–300 s,
  since stock and prices are live.
- On the client, lazily: `GET /detail/<slug>/comment/list/`. Fetch wishlist state with the token.
- The variants endpoint is **not** needed on the PDP; use `variants` and `variant_options` from the detail.
- On 404, render `notFound()`.
- If `is_unpublished` is true (staff preview), show a banner "این صفحه هنوز منتشر نشده است" and
  `robots: noindex, nofollow`.

### 5.2 Variant selection algorithm
Model: each variant has `attribute_value_ids`, normally one value per axis. Each axis (`VariantOption`) lists only
the values that this product's variants use. Combinations are often **sparse** **[V]**:
- `men-classic-shirt`: 4 variants out of 9 combinations.
- `nike-air-zoom-pegasus`: 6 out of 12, one of them out of stock.
- `samsung-galaxy-s25-ultra`: 4 out of 9; variant 10004 (silver, 1 TB) is out of stock, so silver and 1 TB have
  `has_available_variant: false`.

```ts
type Selection = Map<number /*attribute_id*/, number /*value_id*/>;

// (1) Initial state: ALWAYS from default_variant_id (never "first in-stock" computed locally).
function initialSelection(options: VariantOption[], variants: Variant[], defaultId: number | null): Selection {
  const sel: Selection = new Map();
  const v = variants.find(x => x.id === defaultId);
  if (!v) return sel;                                   // null → no variants → disable buy
  const axisOf = new Map<number, number>();
  options.forEach(o => o.values.forEach(val => axisOf.set(val.id, o.attribute_id)));
  v.attribute_value_ids.forEach(id => { const a = axisOf.get(id); if (a !== undefined) sel.set(a, id); });
  return sel;
}

// (2) Resolve: exact SET equality (guide 10.4).
function resolveVariant(variants: Variant[], sel: Selection): Variant | null {
  const want = new Set(sel.values());
  return variants.find(v => v.attribute_value_ids.length === want.size &&
                            v.attribute_value_ids.every(id => want.has(id))) ?? null;
}

// (3) Dynamic state of each value given the OTHER axes' current picks (guide 10.5, extended to 3 states).
type ValueState = 'buyable' | 'out_of_stock' | 'no_such_combo';
function valueState(variants: Variant[], sel: Selection, axisId: number, valueId: number): ValueState {
  const fixed = [...sel].filter(([a]) => a !== axisId).map(([, v]) => v);
  const matches = variants.filter(v => v.attribute_value_ids.includes(valueId) &&
                                       fixed.every(id => v.attribute_value_ids.includes(id)));
  if (matches.length === 0) return 'no_such_combo';
  return matches.some(v => v.in_stock) ? 'buyable' : 'out_of_stock';
}
```
UI rules:
- **First render**: you may use the server's `has_available_variant` (static). After the first user click, switch
  to `valueState`.
- **Never hide values.** Show `out_of_stock` values struck through but still selectable, so the user can see "out of
  stock". Show `no_such_combo` values disabled, or allow the click and auto-adjust (next rule).
- **Recommended auto-adjust** (my recommendation, not in the guide): if a click makes the combination nonexistent,
  pick the variant containing the clicked value with the most matches to the current selection. Prefer `in_stock`
  variants, then the server's order (default first, then id). Re-seed the selection from that variant.
- If `resolveVariant` returns null, disable the buy button and show "این ترکیب موجود نیست".
- Axis renderers by `input_type`:
  - `color`: a circle using `color`. A legacy value may have null `color`, so render it as a text chip. Always set
    `aria-label`/`title` to `name`.
  - `pattern`: a background image from `pattern`. It may be null on legacy data.
  - `radio`: chips.
  - `select`: a dropdown.
- When the selection changes, update: price block, image (`variant.image ?? product.image`), stock/low-stock text,
  quantity limits, `variant_name`, sku. No network call is needed.
- A **simple, downloadable or virtual** product, or any product with empty options, gets no picker; use
  `default_variant_id`. Even if stale attribute rows exist on such a product, the server returns `options: []` and
  `default_variant_attributes: []`.

### 5.3 Price, discount and countdown
```ts
function PriceBlock(v: Variant) {
  if (v.has_discount) {
    strike(v.price);                         // old price
    main(v.final_price);                     // charged price
    badge(`${v.discount_percent}٪`);         // or `٪${n}` in RTL
    if (v.discount_time_remaining != null) countdownTo(new Date(v.discount_time_remaining)); // END instant
  } else main(v.final_price);                // === price
}
```
- The discount rule is the same everywhere, including the cart: one discount applies at a time. A **timed campaign**
  (`TimedDiscount`) wins inside its window; otherwise the variant's **manual discount** applies inside its own window.
  A blank window boundary means that side is open.
- Every response field describes the discount that is actually applied: `price - discount === final_price`, and
  `has_discount === (discount != null)`.
- **No "upcoming deal" data**: a discount whose window hasn't started yet has `has_discount: false` and null times.
- When the countdown reaches 0, re-fetch the product (the server cache entry expires at that moment too).
- **`final_price` can be 0** if the operator lowers the price below an active campaign amount. That is a known trap in
  the catalog guide (§16.3 there): `discount_percent` becomes 100 and the cart charges 0. Display it, but consider
  flagging it or logging it to monitoring.
- Discount badge source: **`has_discount`**, not the truthiness of `discount`.
- On cards, the same fields apply but only `discount_end_time` and `discount_time_remaining` are sent (there is no
  `discount` amount or start time).
- Dev data: **no discount is active** (every fixture window ended in Sept 2026), so `?has_discount=true` returns 0
  **[V]**. You cannot see a live discount in dev without editing data.

### 5.4 Wholesale ("major") pricing: display only
- `enable_major` (product), `major_price` and `major_min_order_limit` (variant) are the operator's stored numbers.
  **Nothing in the cart, checkout or payment uses them**; everything is priced at `final_price`, whatever the quantity.
- Recommendation (the guide's own): **don't render them** in v1, or render something like "برای خرید عمده (از ۱۲ عدد) تماس
  بگیرید" rather than a price table.
- Dev examples **[V]**:
  - `ahmad-tea-earl-grey`: variable; variants 250 g and 500 g with `major_price` 265000 and 490000, minimum 12.
  - `car-phone-holder`: simple; 520000, minimum 15.
  - Also `mineral-water-pack`, `pen-gel-pack`, `notebook-a5-hardcover`, `women-shal-silk`,
    `tempered-glass-universal`, `baseus-usb-c-cable-100w`, `samsung-25w-charger`.
- `enable_major` can be true while some variants have null major fields.

### 5.5 Order limits and quantity stepper
```ts
const min = v.order_limit_min || 1;                       // 1 = no minimum
const max = v.order_limit_max === 0 ? Infinity : v.order_limit_max;  // 0 = no maximum
// Do NOT cap with low_stock_quantity. The real cap is the cart line's `available_quantity` after adding (cart digest).
```
- `packing_factor` (≥1) is the number of base units in one sellable unit. Show "هر بسته شامل {n} {unit_name ?? 'عدد'}".
  The quantity is counted in packs.
- Cards: add `order_limit_min` units, not 1. A product with a minimum of 3 is rejected at quantity 1.
- Dev **[V]**: `apple-iphone-16-pro-max` has variant max 2, 2 and 1. All other products have min 1 and max 0.
- The cart re-validates everything: `cart_item_limit_exceeded`, `cart_item_out_of_stock`,
  `cart_item_insufficient_stock`, `cart_item_invalid_quantity`.

### 5.6 Stock display and notify-me
- **Product `in_stock`**: true if at least one variant is purchasable right now. It drives the card label (with
  `show_out_of_stock_label`) and the `in_stock` filter. **Variant `in_stock`** is what decides the buy button.
- A variant is purchasable when the **first** of these rules that applies says so [C]:
  1. Admin unticked "available": not purchasable.
  2. Bundle: purchasable only if every component is published and has stock for the required quantity. A bundle with
     no components is not purchasable.
  3. Inventory management off: purchasable.
  4. Shared supply pool: purchasable if the pool is unlimited, or if at least one full pack (`packing_factor`) remains
     after holds.
  5. Per-channel warehouse: only the online channel's row counts (unlimited flag, or quantity minus holds ≥ 1). No
     online row: not purchasable.
  6. Plain warehouse: purchasable if unlimited, or if quantity minus holds ≥ 1. Tracked but no warehouse row: not
     purchasable.
- Units held in other customers' carts (reservation TTL default 30 min) are subtracted live, so `in_stock` can flip
  without anyone writing stock.
- `low_stock_quantity`:
  - It is a number only when inventory is tracked, the product is not a bundle, the channel is not unlimited, a
    threshold exists (the variant's own, else the global `warehouse_low_limit`) and the remainder is ≤ the threshold.
  - It is **not** reduced by holds.
  - Bundles always have null.
  - `0` means "zero left", which is different from null.
  - Show "تنها {n} عدد باقی مانده" only when `!== null && > 0`.
  - Dev **[V]**: S25 Ultra variant 10003 = 3; OOS variant = 0; iPhone 16 Pro Max 10007 = 2.
- **Notify-me (important)**: the endpoint is **per product**, with no variant parameter.
  - **Show the form only when the product-level `in_stock === false`.**
  - If only the selected variant is out of stock while others are buyable, the server returns
    `stock_notification_already_in_stock` **[V]** (S25 Ultra: variant 10004 is OOS, but notify returns 400).
  - In that case show "ناموجود" for the variant and guide the user to the buyable options.
  - Hide the button on a 503 feature-off response. For logged-in users, send `{}` and hide the name and phone fields,
    unless the account has no name.
- Out-of-stock test products: `chips-pack-family`, `panasonic-microwave-25` (simple).

### 5.7 Specifications
```ts
const text = row.values.length ? row.values.join('، ') : (row.custom_attribute_value ?? '');
if (!text) return null;   // skip fully empty rows
```
- `specifications` is the full table, already sorted.
- `highlighted_specifications` is a **subset** (rows with `show_in_product_description`), intended as "key specs"
  boxes at the top. Avoid rendering duplicates confusingly.
- `attribute_id` can be linked to a category filter value if that attribute appears in `/filters/?category=`.

### 5.8 Gallery and media
- Slides: `[product.image, ...gallery.map(g => g.image)]`. The featured image is **not** in `gallery`.
- When the selected variant has `image`, show it as the main image.
- `alt`: gallery `alt` is never empty (it falls back to the product name). For `product.image`, use `name`.
- **There is no video support.** No video fields exist in the product model or API **[C]**.
- All images are 500×500 JPEG crops. There is no hi-res source, so a zoom feature isn't possible without backend
  changes.

### 5.9 Bundles (`is_collection`)
- `bundle_items` lists the components of the **default variant**: `variant` (component variant id), `product_name`,
  `variant_name` (null for single-variant products), `quantity` per bundle, and `image` (never null).
- The bundle's `price` and `final_price` are set by the admin. **Don't compute "savings"** from the sum of the
  components.
- Stock comes from the components, and `low_stock_quantity` is always null.
- `bundle_items[].variant` is a **variant** id. There is no product slug, so you can't link a component to its PDP
  without another lookup.
- Dev **[V]**: `digital-accessory-bundle` (type `simple`, `is_collection` true, 3 components each with quantity 1,
  `unit_name` «بسته»).

### 5.10 Other PDP blocks
- `product_code`: show as "شناسه محصول: 010001".
- `breadcrumb`:
  - Visible crumb: Home → `breadcrumb[]` (each linking to `/product-category/${node.path}/`) → product name. The API
    omits the product itself.
  - The chain comes from the deepest fully-published category. When categories tie, the first assigned wins
    **[V]**: `car-phone-holder` in `[mobile-accessories, car-accessories]` gives digital → mobile-accessories.
  - The array is empty when the product has no published category chain.
- `consider_before_buying`: card with `title` (nullable), HTML `text` and `button` (nullable). The button label opens
  the text, e.g. in a modal.
- `question_answers`: the admin FAQ accordion. Don't confuse it with user Q&A (comments with `comment_type=question`).
- `content_type`: shipping packaging only (`general`, `fragile_or_liquid`, `documents`). Rarely shown.
- Downloadable and virtual: the type is published but there is **no download or delivery flow**. Don't promise
  instant download.

### 5.11 SEO head (product, category, brand, list page)
| Field | Present on | Rule |
|---|---|---|
| `page_title` | all 4 detail endpoints | `<title>` and `og:title`. It falls back to the entity name. Admins often include the shop suffix already (dev: "… \| فروشگاه فایرفلای"), so **don't use a `title.template` that appends the site name**, or you get it twice. |
| `page_description` | all 4 | `""` when unset, so **omit** the tag. Also used as JSON-LD `description`. |
| `page_keywords` | all 4 | `""` when unset, so omit the tag. |
| `canonical_link` | all 4 | `null` means self-canonical on the storefront domain, with the trailing slash. For filtered listings (with query params), self-canonical to the clean path is recommended. |
| `structured_data` | **product only** | array; emit each element as `<script type="application/ld+json">` |
| `breadcrumb_structured_data` | all 4 | object; product: Home → category chain (no product); category: Home → … → self; brand: Home → brand; list page: Home → category chain → self |
| `is_unpublished` | product | `true` means `noindex` plus a banner. There is no other robots/noindex field in these responses. |
| meta tags | **not exposed** | The panel has a "تگ های متا" tab for these 4 entities, but these APIs don't return them (§11). |

For `og:image`, use `product.image` (API host, 500×500). Never show prices taken from the JSON-LD (they are in Rial).

---------------------------------------------------------------------------------------------------------------------

## 6. Listing pages (category, brand, list page, generic)

### 6.1 Category page `/product-category/<path>/`
Fetch these 3 in parallel:
- `category/<last-slug>/`
- `filters/?category=<slug>`
- `list/?category=<slug>&sort=<default_sorting if not null>&page=…`

The filters 404 and the list's 200-with-0 behave differently, so handle each error separately. Render:
- name, `short_description`
- `content` (HTML, often below the grid)
- `consider_before_buying` card, `question_answers` FAQ
- breadcrumb from `breadcrumb`
- sub-category chips from `filters.categories`, hiding any with `product_count === 0`

### 6.2 Brand page `/brand/<slug>/`
Fetch:
- `brand/<slug>/`
- `filters/?brand=<slug>`, which gives root categories with counts, **no brands and no attributes**
- `list/?brand=<slug>`

The product count is `list.count`. Attribute facets are impossible on a brand page unless you first narrow to a
category: `list/?brand=X&category=Y` combined with `filters/?category=Y`. In that case the counts are the category's
and **ignore the brand**.

### 6.3 Attribute-filter semantics (what the user sees)
- Values of the same attribute are ORed; different attributes are ANDed; the AND must hold **on one variant**. A
  group is also satisfied by the **spec sheet**.
- Consequence: if the admin listed every color and storage size in a phone's spec sheet, the phone matches any color
  and storage combination, even one that has no variant. The guide's example, **[V]** live:
  `?category=mobile-phone&attribute_values=10005,10015` (blue + 256) returns `apple-iphone-15` and
  `xiaomi-redmi-note-14-pro`. The iPhone 15 only has the variants black/128, blue/128 and pink/256 (OOS), but its
  spec sheet lists blue and 256.
- Always re-validate the actual combination on the PDP with `attribute_value_ids`.
- If you get 0 results, show "محصولی با این فیلترها یافت نشد" / "ترکیب انتخابی شما موجود نیست" and a "حذف فیلترها" button.
- `?search=` only covers `name` and `extra_detail`. A search for "۲۵۶ گیگابایت" won't find attribute-only matches,
  so suggest a filter instead.

### 6.4 Filter UI and URL state
- Mirror every filter in the browser query string. **Reset `page=1` on every change.**
- Allowed params, mapped 1:1 to the API: `search`, `category`, `brand` (comma list), `attribute_values` (comma ids),
  `min_price`, `max_price`, `in_stock`, `is_special`, `has_discount`, `has_timed_discount`, `special_first`, `sort`,
  `page`, `limit`.
- Booleans must be exactly `true`/`false` or `1`/`0`. Anything else is silently ignored.
- Price slider: initialise from `filters.price.min` and `filters.price.max` (purchasable variants only).
- The sort dropdown comes from `filters.sort_options`.
- The pager comes from `total_pages`.
- Carousel and "view all" parity: when building `/product/list/?…` from a homepage `listing_query`, forward it
  **unchanged** (it includes `in_stock=true`, `special_first=false` and `sort`).

### 6.5 Generic listing `/product/list/` (no slug)
Forward the browser query string as is to `GET /api/v1/product/list/`. There is no title or SEO data from the API.
Build the title yourself from the params, e.g. "تخفیف‌ها" for `has_discount=true`, «پیشنهادهای شگفت‌انگیز» for
`has_timed_discount=true` (the home carousel source «محصولات با تخفیف زمان‌دار» links here).

### 6.6 Product list page `/product/list/<slug>/`
Fetch:
- `list-page/<slug>/` (404 drives `notFound()`)
- `filters/?list=<slug>`
- `list/?list=<slug>&sort=<default_sorting>`

Dev **[V]**: `best-selling-digital` has 13 products, category chips (mobile-phone 6, laptop 1, tablet 0, headphone 2,
smart-watch 2, mobile-accessories 2) and a color facet (مشکی، سفید، نقره ای). `flagship-phones` has 6 products,
storage and RAM facets, and no category chips.

### 6.7 Carousels outside the homepage (guide §17.4)
| Carousel | Request |
|---|---|
| Newest | `?sort=date-desc&limit=10` |
| Best-selling | `?sort=sale&limit=10` (add `special_first=false` for "true" best sellers) |
| Special offers | `?is_special=true&limit=10` (special ≠ discounted) |
| Discounted | `?has_discount=true&limit=10` |
| Timed discounts (countdown) | `?has_timed_discount=true&limit=10` |
| One category / list | `?category=…&limit=10` / `?list=…&limit=10` |

Add `in_stock=true` to show buyable products only. Homepage carousels come from `GET /api/v1/homepage/` (content
digest). For a category grid outside the homepage, use `/category/list/?show_in_homepage=true`.

---------------------------------------------------------------------------------------------------------------------

## 7. Category tree semantics
- MPTT tree with **unlimited depth** **[C]**. Dev data has depth 2: 8 roots and 24 children **[V]**.
- Sibling names are unique, and so are root names. Slugs are unique across the whole model.
- `parent_id`, `path` (slug chain), `breadcrumb` (on detail) and `?parent=<slug>` (direct children) describe the
  structure.
- A **draft category hides its entire subtree** everywhere except the product `categories[]` array. Dev has a draft
  root, `coming-soon-category` (404).
- Images:
  - `image` is a 500×500 JPEG crop, or the placeholder.
  - `icon` is the original size re-encoded as JPEG (quality 70, so no transparency), or the placeholder.
  - Dev has no real category images (all placeholders).
- `show_in_homepage` is an admin flag; dev has 13 categories flagged.
- `default_sorting` is a suggestion you must apply yourself.
- `product_count`:
  - On `/category/list/` it counts direct products only. For example, `digital` = 0 while its subtree has 26.
  - Use `/filters/` (children or roots) or `list.count` for subtree counts.
- SEO: `page_title`, `page_description`, `page_keywords`, `canonical_link`, breadcrumb JSON-LD (category detail only).
  Dev roots have a page title like "خرید کالای دیجیتال با بهترین قیمت" and a description.
- Category content (`description`, `content`, `consider_before_buying`, `question_answers`) is all optional. Dev
  roots have `description` only.
- Building the menu: fetch every page of `/category/list/?limit=100` and build the tree with the guide's one-pass
  `Map`. Alternatively, use the admin-built menus from `/api/v1/menu/<key>/` (content digest), which are already
  storefront URLs **[V]**: `main` contains
  `/product-category/digital/mobile-phone/`, `/product/list/flagship-phones/`, `/brand/samsung/` and
  `/product/samsung-galaxy-s25-ultra/`.

---------------------------------------------------------------------------------------------------------------------

## 8. Reviews and Q&A (user-generated)
- **One model, two uses**:
  - `comment_type: 'comment'` is a review: it can carry a rating, title and pros/cons, but only on the root.
  - `comment_type: 'question'` is user Q&A: text only.
  - Replies inherit the root's type.
  - The admin FAQ (`question_answers` on the PDP) is separate and read-only.
- **Moderation**: every storefront submission is queued (status pending), including staff submissions. Only replies
  written **in the admin panel** as the shop are published immediately, with `is_user_admin: true`. Publishing such a
  reply also approves its parent.
- **Ratings**: `rating` and `rating_count` on the product are recomputed from approved root reviews that have a
  rating. `rating_breakdown` has 5 fixed rows. Use `rating === 0` to show "بدون امتیاز".
- **Verified buyer** (`is_verified_buyer`) is set automatically:
  - for reviews submitted through the order flow, `POST /api/v1/order/<code>/review/` (order digest);
  - for a root review submitted by a logged-in customer who has a delivered purchase of this product that is not
    yet reviewed. The review is attached to the oldest such purchase.

  The admin can also toggle it. Guests, replies and questions never get it.
- **Display**:
  - name, date, stars when `rating != null`, title
  - review text (escaped), pros and cons chips
  - "خریدار" badge, "شما" badge when `is_current_user`, "پاسخ فروشنده" styling when `is_user_admin`
  - replies indented (reverse them for chronological order)
- **Forms**:
  - The review form has a star rating that is optional ("no rating" means omit it; never send 0), plus title, pros,
    cons and text.
  - The question form and the reply form have **text only**. The reply form sends `parent`.
  - Guests also see name and optional email. Logged-in users don't (the server ignores them anyway).
  - Hidden `website` honeypot.
  - De-duplicate chips on the client.
- **Pagination and loading**: paginated by roots only. Use `?comment_type=` for separate tabs. Tab counts come from
  `comment_count` and `question_count`.
- **Dev data [V]**:
  - 17 products have comments. S25 Ultra has 3 reviews (5, 4, 3 stars; 2 verified buyers) and 1 question.
  - **No replies are visible anywhere** even though the fixtures contain admin answers, because of a data bug (§11).
- **JSON-LD**: up to 5 root reviews (type `comment`) are embedded automatically.

---------------------------------------------------------------------------------------------------------------------

## 9. Error codes and throttles (UI handling)

| `code` | HTTP | Where | UI reaction |
|---|---|---|---|
| `api_key_missing` / `api_key_invalid` | 401 | all | Configuration bug; never show "please log in". Log and alert. |
| `not_found` | 404 | single-record endpoints, `/detail/<slug>/*`, `/filters/` context slugs | Render the 404 page. |
| `not_found` ("صفحه نامعتبر") | 404 | any list with a bad `page` | Redirect to page 1. |
| `not_authenticated` | 401 | wishlist | Redirect to login (send guests to login before calling at all). |
| `token_not_valid` | 401 | wishlist | Refresh the token, retry once. |
| `invalid_choice` | 400 | `sort` (list, wishlist), `comment_type` (list and submit) | Client bug; fix the params. |
| `invalid` | 400 | `min_price`/`max_price` (not numeric), `rating`, `name` (guest), `email`, `parent` (other product), review-only fields on a reply or question, `mobile_number`, `first_name`, `last_name` | Field error. |
| `required` | 400 | `review` | Field error. |
| `max_value` / `min_value` | 400 | `rating` | Clamp the star input to 1–5. |
| `max_length` | 400 | `positive_points`/`negative_points` (>10 items, or `.N` >255), `title`/`name` (>255), `review` (>4096), notify names (>200) | Field error; indexed attr. |
| `blank` | 400 | `positive_points.N` / `negative_points.N` | Strip empty chips. |
| `not_a_list` | 400 | points | Always send arrays. |
| `does_not_exist` | 400 | `parent` (missing or not approved) | "این نظر دیگر در دسترس نیست" and refresh the list. |
| `stock_notification_already_in_stock` | 400 | notify (`client_error`, `attr` null) | Refresh, show add-to-cart. |
| `feature_disabled` | 503 | comment submit (`product_comments` toggle), notify (`stock_notifications`) | Hide the form, show `errors[0].detail`, read `/global/feature-status/` ahead of time. |
| `throttled` | 429 | anything | Wait `data.retry_after` seconds (also in the `Retry-After` header); never retry before then. |

**Throttles** (environment-configurable, so read `retry_after` instead of hardcoding):
- Global: **2000/hour per IP** for guests, **5000/hour per user**.
- `comment_submit`: **10/hour**, counting only successful submissions, **shared with blog comments**, per user or per
  IP.
- `saved_items`: **60/min** per customer, wishlist POST and DELETE combined with the blog reading list.
- Notify has no dedicated throttle.
- If your server renders pages or proxies forms, every guest arrives from **your server's IP**, so all guests share
  one global quota and **one 10/h comment quota**. Fix: backend ops add your storefront server to `TRUSTED_PROXY_IPS`
  (or configure nginx `real_ip`), and your BFF sends the visitor IP (taken from the edge's `X-Real-IP`, not the
  browser) in `X-Forwarded-For`. See content-api §1 and §3 and deployment `TRUSTED_PROXY_IPS`.
  Logged-in customers are counted per account once their token is forwarded.

---------------------------------------------------------------------------------------------------------------------

## 10. Implementation checklist (guide §19, plus additions marked ➕)
- [ ] `X-API-Key` on every call, never exposed to the browser (BFF / Route Handlers). ➕ The BFF calls the API's **public** host so absolute image URLs are correct.
- [ ] Read `data`; show `data.errors[0].detail`; branch on `data.errors[0].code`; map `validation_error` by `attr` (split `.` for chips).
- [ ] Listing page size comes from `paginator_number`; pager from `total_pages`; `page_size` is what was applied; a 404 invalid page goes to page 1.
- [ ] Out-of-stock label only when `show_out_of_stock_label`; related section hidden when `related_items_display_status` is false or the array is empty.
- [ ] Sort dropdown from `sort_options`; filter sidebar from `/filters/`; `attribute_values` ids from there; price slider from `price.min`/`price.max`.
- [ ] Apply `default_sorting` of the category or list page yourself (as `sort`).
- [ ] Filters mirrored in the URL; `page` reset to 1 on every change; booleans only `true`/`false`.
- [ ] Category links built from `breadcrumb` or `path`, never from the card's `categories[]`.
- [ ] `count: 0` gives an empty-state message plus "حذف فیلترها"; `/filters/` 404 versus `/list/` 200 handled.
- [ ] Initial variant from `default_variant_id`; exact set match on `attribute_value_ids`; "combination doesn't exist" message plus disabled button; unavailable values greyed, not removed; dynamic disabling after the first click.
- [ ] Price shows `final_price`; `price` struck through only when `has_discount`; badge from `has_discount`; countdown interprets `discount_time_remaining` as the end timestamp; Toman formatting; never read prices from JSON-LD.
- [ ] Wholesale fields not rendered, or only as "contact us".
- [ ] Quantity stepper: min `order_limit_min || 1`; `order_limit_max === 0` means ∞; not capped by `low_stock_quantity`; low-stock text checks `!== null && > 0`.
- [ ] Cart receives `variant.id`; refresh the PDP or picker before adding if the page has been open a long time.
- [ ] Out-of-stock UI shows notify-me ➕ **only when the product-level `in_stock` is false**; 400 on `mobile_number` shown under the field; 503 hides the button.
- [ ] Comments: tab counts from `comment_count` and `question_count`; the logged-in form has no name or email; the reply and question forms have no rating, title or points; after a 201, show `msg` and don't refetch; `is_user_admin` and `is_verified_buyer` badges; `review` escaped.
- [ ] `content` and `consider_before_buying.text` rendered as HTML; relative internal links routed.
- [ ] Meta tags only when non-empty; both JSON-LD blocks in `<head>` (array versus object); `is_unpublished` gives `noindex` and a banner.
- [ ] A null `variant.image` falls back to the product image; `rating === 0` shows "بدون امتیاز".
- [ ] ➕ `trailingSlash: true`; catch-all category route; generic `/product/list/` route; Unicode slugs decoded and re-encoded; malformed-percent guard.
- [ ] ➕ `/media/*` and `/static/*` proxied from the storefront domain (for JSON-LD images) and `STOREFRONT_URL === https://SITE_DOMAIN` in prod.
- [ ] ➕ `TRUSTED_PROXY_IPS` and `X-Forwarded-For` arranged before launching comment and notify forms behind a BFF.
- [ ] ➕ Image `onError` fallback; `next/image` `remotePatterns` for the API host.
- [ ] ➕ Wishlist hearts filled client-side with the token; publicly cached responses fetched without a token; DELETE handles 204 with no JSON.

---------------------------------------------------------------------------------------------------------------------

## 11. Suspected backend bugs and inconsistencies (concrete and verified)

1. **Admin replies in the seeded data never appear** **[V]**.
   - `fixtures/06_product_reviews.json` gives every reply (10027, 10029, 10031, 10033, 10036, all `is_user_admin`
     and approved) `tree_id` 1002 (1003 in the DB), while each parent has its own tree (1014, 1012, 1009, …).
   - `CommentListViewMixin.replies_by_parent` fetches replies with `tree_id__in=<root tree ids>`, so these replies
     are silently dropped. S25 Ultra question 10026 shows `replies: []` although reply 10027 exists and is approved.
   - The MPTT fields in the fixture are inconsistent; a `ProductComment.objects.rebuild()` would fix the data.
   - Impact: the dev UI can't show admin replies. The README claims "۶ پرسش‌وپاسخ با جواب مدیر".
2. **Two different "site origins"** **[V]**.
   - The sitemap uses `STOREFRONT_URL` (`http://localhost:3000/...`).
   - The JSON-LD (`offers.url`, `image`, every breadcrumb `item`) and the back-in-stock SMS link use
     `https://<SITE_DOMAIN>` (`https://localhost/...`).
   - If `STOREFRONT_URL` is not exactly `https://SITE_DOMAIN`, structured data advertises a different host and
     scheme than the sitemap and canonicals.
   - JSON-LD `image` is `https://SITE_DOMAIN/media/CACHE/...` while every other image field is on the API host, so
     the storefront domain must serve `/media/` or those images 404.
   - The comment on `STOREFRONT_URL` in `settings.py` ("exactly one outward-facing URL – the pay link") is also
     outdated.
3. **Panel meta tags are never published for catalog pages** **[V][C]**.
   - The admin pages for Product, Category, Brand and ProductList include the "تگ های متا" inline
     (`SeoAdminMixin.inlines` → `MetadataModel`).
   - `pages/serializers.py` and `homepage/serializers.py` expose `meta_tags`, but none of the product, category, brand
     or list-page serializers do; the live keys lack them.
   - Operators can enter tags that the storefront can never render.
4. **The slug `list` is not reserved for catalog models** **[C]**.
   - `pages` reserves `list` (`RESERVED_PAGE_SLUGS`), but `pages/tests/test_models.py` explicitly asserts that every
     other SEO model (Product, Category, Brand, ProductList) accepts `list`.
   - Because `category/list/`, `brand/list/` and `list-page/list/` are routed before `<slug>/`, a category, brand or
     list page with slug `list` **can never be fetched** through its detail endpoint (you get the list endpoint
     instead).
   - On the storefront, a product with slug `list` collides with the generic `/product/list/` route.
5. **Guide §17.2 notify flow contradicts the server** **[V]**.
   - The snippet shows the notify form when `!variant.in_stock`, but `/notify/` is product-level and returns 400
     `stock_notification_already_in_stock` whenever any variant is buyable. Tested on S25 Ultra, whose variant
     10004 is out of stock.
   - There is no way to subscribe to a specific variant.
6. **OpenAPI schema versus reality** **[V]**. Generated clients will be wrong in these places:
   - Many always-present fields are not `required`, so they come out optional: `is_special_product`,
     `is_collection`, `enable_major`, `extra_detail` and `canonical_link` on cards and detail; `sku`,
     `variant_name`, `order_limit_*`, `packing_factor`, dimensions and `major_*` on Variant; every field of
     ProductSettings; `default_sorting`; `show_category_filter`; `title`, `rating`, `is_user_admin` and
     `is_verified_buyer` on ProductComment.
   - `ProductComment.positive_points` and `negative_points`, and `structured_data` and `breadcrumb_structured_data`,
     have **no type** (unknown).
   - `default_sorting` enums include `""`.
   - `ProductComment.rating` is an enum `[1..5, null]`.
   - Hand-write the types (§3/§4) instead of trusting codegen blindly.
7. **The list-page detail is less linkable than its siblings** **[V]**.
   - `product_category` has no `path`, and there is no `breadcrumb` array, unlike category and product detail.
   - To link the category you need the category tree, or you have to parse `breadcrumb_structured_data` URLs, which
     are on SITE_DOMAIN.
8. **Breadcrumb JSON-LD is inconsistent** **[V]**. The product breadcrumb ends at the deepest category and omits the
   product, while the category, brand and list-page breadcrumbs end with the page itself. JSON-LD `Review` entries
   have no `reviewRating`; there is deliberately no `aggregateRating` (per the guide), but expect Search Console
   warnings.
9. **Brand list and filter brands are "ordered by name" in code-point order, not Persian alphabetical order**
   **[V]**: پ, چ, ژ and گ sort last.
10. **Image specs limit the UI** **[C]**.
    - Category `icon` is forcibly re-encoded to JPEG (transparent PNG and SVG icons get a solid background).
    - Brand logos are 70×70 JPEG crops (too small for a brand hero).
    - Product and gallery images are 500×500 crops with no original exposed, so there is no zoom or retina.
11. **Comment submit validates in two passes** **[V]**. A guest who omits both `name` and `review` first sees only
    the `review` error; the name error appears on the next submit. Notify reports missing `first_name` and
    `last_name` one at a time.
12. **Category filters are not inherited** **[V]**. `/filters/?category=digital` returns `attributes: []` because
    only attributes marked filterable on that exact category are used. Parent categories have no attribute facets
    unless the admin duplicates the setup. The guide implies this, but it is easy to miss.
13. **The list-page definition and `?attribute_values=` use different matching rules** **[C]**. A list page ORs all
    its values (across attributes) and only looks at **variant** values. The facet filter groups values per
    attribute (AND across attributes) and also accepts spec-sheet values. A product whose matching value is only in
    the spec sheet appears in `?attribute_values=` but not in `?list=`.
14. **Minor validation gaps** **[V]**:
    - `?max_price=-5` is accepted (200, 0 results).
    - `?comment_type=bogus` on the comment *list* returns 400 `invalid_choice`; the guide only documents this for
      submit.
    - `weight_grams: 0` is published for a virtual product.
15. **`consider_before_buying` fallback** **[C]** takes the product's "first" category from an unordered M2M
    prefetch. It ignores that category's published state and its "show on category page" flag, so it is
    non-deterministic when a product has several categories that each have a card.
16. **Pricing trap from the catalog guide** (documented there, not re-tested): if the price drops below an active
    timed-discount amount, `final_price` becomes 0 and `discount_percent` 100, and the cart charges 0.
17. **Docs versus dev config** (not bugs): the guide's sample says `paginator_number` is 12 and
    `related_items_number` is 4 or 10; dev has 24 and 8. Never hardcode them.

**Side effect of this investigation (please clean up)**: one probe POST was sent without the honeypot and
**created a pending (unapproved) question comment** on `samsung-galaxy-s25-ultra`: ProductComment id **10037**,
name "a", review "x", `comment_type` question, status 0. It is not visible on the storefront, and it shifted MPTT
`tree_id`s by one (harmless). Delete it from the admin moderation queue if desired. No other writes were made: all
other POSTs were validation failures, the honeypot path, or already-in-stock refusals, none of which write.

---------------------------------------------------------------------------------------------------------------------

## 12. Dev sample-data cheat sheet (for building and testing)
- **Settings**: `paginator_number` 24, `show_out_of_stock_label` true, related products on, 8 related.
- **Catalogue**: 74 published products; 2 out of stock (`chips-pack-family`, `panasonic-microwave-25`); 7 special.
  1 draft product: `upcoming-flagship-2027` (404).
- **Categories**: 8 roots — `digital`, `home-appliance`, `fashion`, `beauty-health`, `book-stationery`,
  `sport-travel`, `grocery`, `tools-car` — each with 2–6 children, e.g. `digital/mobile-phone`, `digital/laptop`.
  Draft: `coming-soon-category`.
- **Brands**: 30, e.g. `samsung` (4 products), `apple` (6), `xiaomi` (5).
- **List pages**: `best-selling-digital` (13 products, `show_category_filter`), `flagship-phones` (6). Drafts:
  `amazing-offers`, `draft-product-list`.
- **Variable products**: `samsung-galaxy-s25-ultra` has 3 axes (color is `color`, storage and RAM are `select`), an
  out-of-stock variant, a low-stock variant and a question. Others:
  - `apple-iphone-16-pro-max`: order max 2 or 1, low stock 2.
  - `men-classic-shirt` (sparse 4/9) and `nike-air-zoom-pegasus` (6/12, one OOS): color and size (`radio`).
  - `ahmad-tea-earl-grey`: `select` and `radio`, a single-value axis, wholesale fields.
  - `debsh-tea-saffron`, `apple-watch-series-10`, `adidas-hoodie-essentials` (3 axes).
- **Product types**:
  - Simple: `hisense-tv-55-u7`, `car-phone-holder` (wholesale, 2 categories), `nokia-c32-basic`.
  - Bundle: `digital-accessory-bundle`.
  - Virtual: `online-course-seo`. Downloadable: `ebook-digital-marketing`.
- **Attribute value ids**:
  - رنگ (10001): مشکی 10001, سفید 10002, نقره ای 10003, طلایی 10004, آبی 10005, سبز 10007, صورتی 10009, بنفش 10012
  - حافظه داخلی (10002): ۱۲۸ = 10014, ۲۵۶ = 10015, ۵۱۲ = 10016, ۱TB = 10017
  - حافظه رم (10003): ۸ = 10020, ۱۲ = 10021
- **Discounts**: none active (every fixture window ended Sept 2026).
- **Media**: the image URLs (`/media/CACHE/...`) return 404 in dev.
- **Menus [V]**:
  - `main`: `/product-category/digital/mobile-phone/`, `/product/list/flagship-phones/`, `/brand/samsung/`,
    `/product/samsung-galaxy-s25-ultra/`
  - `header`: `/product/list/?has_discount=true`
  - `footer`: `/page/terms/`, `/page/privacy/`
