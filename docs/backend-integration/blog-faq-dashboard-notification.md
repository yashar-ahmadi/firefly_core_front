# Firefly Core — Blog, FAQ, Customer Dashboard, Notifications: storefront integration digest

Scope: `blog-api.txt` (10 endpoints), `faq-api.txt` (1), `dashboard-api.txt` (5 + the nine-account-pages map), `notification-api.txt` (4).
All four guides were read end to end. Everything below was checked against the live dev server (`http://localhost:8000`, sample fixtures), the OpenAPI schema (`schema.yaml`) and the Django source in `/home/user/firefly_core_backend` (read only).
Test accounts used: `sara.ahmadi@example.com`, `ali.karimi@example.com` (customers), `manager@firefly-core.ir` (superuser). The password for all of them is `Firefly@1234`. Login is `POST /api/v1/account/auth/login/` with `{"login_method":"email","login_identifier":"…","password":"…"}`, and the token is at `data.tokens.access`. Access tokens last 15 min. Refresh tokens last 7 days, or 30 with `remember_me`.

Side effects from testing: one reading-list row was added and then removed (sara). One blog question was submitted and then withdrawn (ali, post comment id 10010, which now has `user_removed_at` set). One FCM device row was created (`id 1`, fake token `docs-digest-test-token:APA91b-web-sample-001`): it was moved from sara to ali and then deactivated. Broadcast notification 10001 was marked read for sara. One honeypot submission was dropped, so nothing was saved.

Notes on the dev environment:
- The `X-API-Key` gate is off in dev. Even an invalid key returns 200. In production every request needs the key: a missing key gives `401 api_key_missing`, and a bad or disabled key gives `401 api_key_invalid`. The key is checked before the JWT.
- `SITE_DOMAIN=localhost` and `STOREFRONT_URL=http://localhost:3000`. JSON-LD URLs come out as `https://localhost/...`, while sitemap URLs come out as `http://localhost:3000/...` (see Bugs).
- The `media/` source files are not present in dev (they are gitignored), so image URLs 404 (see Bugs). Only `/static/defaults/default.png` actually loads.
- `DEBUG=True`. A URL that matches no route (for example a bad `subject_type` in a path, or a non-numeric notification id) returns Django's **HTML** 404 page in dev. In production (`handler404 = utils.error_views.not_found`) it returns the JSON envelope with `code: not_found` and the detail «آدرس درخواستی یافت نشد.».

---

## 0. Cross-cutting contract (applies to every endpoint here)

### 0.1 Envelope
```ts
// Every JSON response (success or error). 204 responses have NO body and NO envelope.
interface Envelope<T> { msg: string; code: number /* = HTTP status */; data: T; }

interface ApiErrorItem { code: string; detail: string; attr: string | null; }
interface ApiErrorData {
  type: 'validation_error' | 'client_error' | 'server_error';
  errors: ApiErrorItem[];               // validation_error may carry several (one per field)
  retry_after?: number;                 // seconds; on 429 (header Retry-After too, but NOT CORS-exposed)
  feature?: string;                     // on 503 feature_disabled: 'blog' | 'blog_comments' | ...
  feature_name?: string;                // Persian label of that switch
  unknown_subject_types?: string[];     // on 400 dashboard_subject_type_unknown
  known_subject_types?: string[];       //   "
}
```
- Use `data.errors[0].code` in code. Show `data.errors[0].detail` to the user. `msg` is a fixed sentence per HTTP status (400 → «درخواست ارسالی معتبر نیست.», 404 → «موردی با این مشخصات پیدا نشد.», 401 → «برای این درخواست باید احراز هویت کنید.», 503 → «این سرویس موقتاً در دسترس نیست.»).
- **Exception for successful writes:** some 2xx responses have `data: {}` and the user-facing sentence is in `msg`. This applies to comment submit 201, device unregister 200 and notification read 200. Reading-list add puts it in `msg` too, with `data.is_in_reading_list`.
- `validation_error` means `attr` names the field or query parameter. `client_error` and `server_error` mean `attr` is null.
- Exception: `dashboard_subject_type_unknown` is a **400 with `type: client_error`**, not `validation_error`, and has `attr: null`.
- Errors from body parsing (verified on `POST /devices/`): malformed JSON gives `400 parse_error` with type client_error. A wrong Content-Type gives `415 unsupported_media_type`.

### 0.2 Pagination (every list endpoint in scope)
```ts
interface Paginated<T> {
  count: number;            // total results (FAQ: categories; comments: top-level threads only)
  total_pages: number;      // >= 1, never 0 (empty list => 1)
  current_page: number;     // 1-based
  page_size: number;        // size actually applied
  next: string | null;      // ABSOLUTE URL built on the request host (internal host if SSR calls an internal URL!)
  previous: string | null;
  results: T[];
}
```
- `page`: 1-based. A page past the end, `page=0` or a non-numeric page gives `404 not_found` with detail «صفحه نامعتبر». An empty result is `200` with `count: 0`, never a 404.
- `limit` defaults to 20 on every list here except `blog/post/list/`, where the admin sets it via `PostSettings.paginator_number` (12 in the fixtures). The maximum is 100: anything larger is silently clamped to 100. A value of 0, a negative number, a non-numeric value or `null` silently falls back to the default. Leave `limit` out to get the default. Read the size actually used from `page_size`.
- Build pagers from `total_pages`, not from `count/limit`. If you are behind a proxy, take only `page` from `next` rather than following its host.

### 0.3 Auth behaviour by endpoint class
| Class | Endpoints | No token | Invalid/expired token |
|---|---|---|---|
| Public, viewer-sensitive | blog home, post list, post detail, category list/detail, comment list/submit | guest | **ignored → guest** (verified: garbage token → 200) |
| Public, viewer-blind | FAQ list, dashboard banner list | same data | ignored |
| Auth required | reading-list ×3, dashboard summary / purchased / comments / delete, notifications ×2, devices ×2 | `401 not_authenticated` | `401 token_not_valid` |

Notification/device endpoints can also return `401 user_inactive`, `401 user_not_found` and `401 bad_authorization_header`. These come from the project JWT class and probably apply everywhere.

How to react: on `token_not_valid`, refresh once with `POST /api/v1/account/auth/token/refresh/` and retry, then send the user to login. On `not_authenticated`, go to login. On `user_inactive` or `user_not_found`, clear tokens. **Never log the user out on `api_key_missing` or `api_key_invalid`.**

### 0.4 Images and absolute URLs
- Every image field is an **absolute URL built from the request's Host header and scheme** (`request.build_absolute_uri`; `USE_X_FORWARDED_HOST` is not set). The same applies to `/media/` and `/static/` URLs inside blog `content` HTML, and to the `next`/`previous` links. **If Next.js calls an internal URL server-side (for example `http://backend:8000`), the browser receives unreachable `http://backend:8000/media/...` URLs.** SSR must call the public API hostname over https, or proxy `/media` and `/static`. (Verified: requesting via `127.0.0.1:8000` gives `http://127.0.0.1:8000/media/...`.)
- Missing upload: the field is never null and falls back to `<api>/static/defaults/default.png` (800×800 neutral placeholder). Exceptions that **can be null**: post `banner`, author `avatar`, `MyCommentSubject.image` for pages, `DashboardBanner.mobile_image`, `Notification.image`.
- Thumbnail sizes: post card/detail `image` 500×500 JPEG. Blog category `image` 500×500, `icon` 64×64. `banner` is served at its original size, without cropping.
- For `next/image`, add `remotePatterns` for the API host `/media/**` and `/static/**`. Because of the dev issue below, always set an `onError` fallback to the placeholder.

### 0.5 Dates, money, language
- All datetimes are Gregorian ISO-8601 with the Tehran offset (`+03:30`). Jalali conversion is the frontend's job (`Intl.DateTimeFormat('fa-IR-u-ca-persian')`). The API has no Jalali fields.
- Prices are integers with no unit. Dashboard `wallet.balance` is documented as **toman**. For blog product cards, take the currency unit from the project settings.
- There is no i18n. `Accept-Language` has no effect, and all `msg`/`detail` strings and content are Persian.

### 0.6 Feature switches (blog only, plus a dashboard caveat)
- `GET /api/v1/global/feature-status/` (paginated) or `GET /api/v1/global/feature-status/{key}/`. No switch can close these. Item shape: `{feature_key: string, display_name: string, is_enabled: boolean, disable_reason: string|null}`. Keys seen live: `blog, blog_comments, product_comments, wallet, pay_on_delivery, guest_checkout, registration, online_payment, stock_notifications, coupons`.
- With `blog` off, **all 10 blog routes** return `503 feature_disabled` (`type: server_error`, `data.feature: "blog"`, `data.feature_name: "وبلاگ"`, plus a `Retry-After: 300` header that is only advice). The 3 reading-list routes check auth first, so a guest gets 401 before the 503. The blog also drops out of `/sitemap.xml`.
- With `blog_comments` off, only `POST .../comment/submit/` returns 503. Reading approved comments still works.
- `detail` holds the operator's `disable_reason` if one was written. Otherwise it is a default sentence naming the feature, for example «"ثبت نظر روی مطالب وبلاگ" در حال حاضر غیرفعال است. لطفاً بعداً دوباره تلاش کنید.».
- **Handle `feature_disabled` before any "retry on 5xx" logic.** Show a calm "blog unavailable" page and hide the blog nav link and comment forms based on feature-status.
- The dashboard summary **ignores** switches, so `reading_list_count` still reports a number while `blog` is off. Hide menu rows whose switch is off.

### 0.7 Throttles relevant here
| Scope | Rate (env var) | Applies to | Counting |
|---|---|---|---|
| `anon` | 2000/hour per IP (`THROTTLE_ANON`) | every guest request | per client IP; `X-Forwarded-For` honoured only from `TRUSTED_PROXY_IPS` |
| `user` | 5000/hour per user (`THROTTLE_USER`) | every authenticated request | — |
| `comment_submit` | 10/hour (`THROTTLE_COMMENT_SUBMIT`) | blog + product + **page** comment submit (one shared budget) | per user, or per IP for guests. **Only successful submissions count**; validation failures and honeypot drops do not. |
| `saved_items` | 60/minute per customer (`THROTTLE_SAVED_ITEMS`) | reading-list POST/DELETE + product wishlist POST/DELETE (shared) | reading the list is not counted |

A 429 returns `code: throttled`, `data.retry_after` in seconds and a `Retry-After` header. **`Retry-After` is not in `CORS_EXPOSE_HEADERS`** (only `X-Cart-Token` is), so browser code must read `data.retry_after`.

**SSR/BFF gotcha:** if guest comment posts or public GETs go through the Next.js server, every visitor shares that server's IP budget (10 comments per hour for the whole site, 2000 GETs per hour). Either submit guest comments from the browser directly, or configure the Next.js server as a trusted proxy (`TRUSTED_PROXY_IPS` + `TRUSTED_PROXY_HOPS`) and forward the client IP in `X-Forwarded-For`. Cache public GETs (see 1.11).

### 0.8 CORS (browser calls)
`CORS_ALLOWED_ORIGINS` contains `http(s)://{SITE_DOMAIN}`, `localhost:3000`, `127.0.0.1:3000`, `localhost:8000` and `127.0.0.1:8000` only. **`STOREFRONT_URL` is not added.** Verified: a preflight from `https://shop.example.com` gets no `Access-Control-Allow-Origin`. If the storefront runs on a different host than `SITE_DOMAIN`, browser-side calls (dashboard, reading list, notifications, comment submit) will fail unless the backend adds that origin or the storefront proxies `/api` under its own origin. Allowed request headers are `authorization`, `content-type`, `X-API-Key`, `X-Cart-Token`, `Idempotency-Key` and a few others. Credentials are allowed.

### 0.9 Server-side response cache (backend)
`GET /blog/home/` and `GET /blog/post/list/` are served from the backend's own site cache (600 s ceiling). Any committed write to a table they read invalidates them, and per-viewer flags (`is_in_reading_list`, `is_in_wishlist`) are resolved per viewer on every hit. This is transparent. The server sends **no `Cache-Control`, `ETag` or `Last-Modified`**, and `Vary: origin, Cookie` (it does not vary on `Authorization`). All HTTP caching is the storefront's job. **Never share-cache a response that was fetched with a user token.**

---

## 1. Blog (`/api/v1/blog/`)

### 1.1 Endpoint map
| # | Method | Path | Auth | Purpose | Server-cached |
|---|---|---|---|---|---|
| 1 | GET | `/api/v1/blog/home/` | public (token optional) | 3 landing sections | yes |
| 2 | GET | `/api/v1/blog/post/list/` | public (token optional) | archive/search/category/author lists | yes |
| 3 | GET | `/api/v1/blog/post/{slug}/` | public (staff token enables draft preview) | post page | no |
| 4 | GET | `/api/v1/blog/category/list/` | public | flat category tree with post counts | no |
| 5 | GET | `/api/v1/blog/category/{slug}/` | public | category page header + SEO | no |
| 6 | GET | `/api/v1/blog/post/{slug}/comment/list/` | public (token → `is_current_user`) | approved comment threads | no |
| 7 | POST | `/api/v1/blog/post/{slug}/comment/submit/` | public (guest or user) | submit comment, question or reply | — |
| 8 | GET | `/api/v1/blog/reading-list/list/` | **auth** | the customer's saved posts | no |
| 9 | POST | `/api/v1/blog/post/{slug}/reading-list/` | **auth** | save a post (idempotent) | — |
| 10 | DELETE | `/api/v1/blog/post/{slug}/reading-list/` | **auth** | unsave (always 204) | — |

Any other method returns `405 method_not_allowed`. `Allow` headers: GETs `GET, HEAD, OPTIONS`; submit `POST, OPTIONS`; reading-list toggle `POST, DELETE, OPTIONS`.

Slugs may contain Persian (`SlugField(allow_unicode=True)`), so `encodeURIComponent` them. Route-collision edge cases: a post whose slug is literally `list` cannot be fetched (`post/list/` matches first), and the same goes for a category with slug `list`.

### 1.2 Shared blog types
```ts
interface CategoryLight { id: number; name: string; slug: string; parent_id: number | null; } // NO path

interface PostAuthor {
  full_name: string;          // user.get_display_name(): full name, or «کاربر» when nameless (never username/email)
  avatar: string | null;      // absolute; null when none (no placeholder)
}

interface PostCard {          // schema: PostList
  id: number;
  name: string;               // unique project-wide
  slug: string;
  description: string | null; // plain text short description
  image: string;              // 500x500 thumb or placeholder, never null
  author: PostAuthor | null;  // null if author deleted (FK SET_NULL)
  categories: CategoryLight[];// assignment order; may be []; may include a DRAFT category (its detail 404s)
  comment_count: number;      // visible top-level entries of type comment
  question_count: number;     // visible top-level entries of type question
  view_count: number;
  is_in_reading_list: boolean;// viewer flag; always false for guests
  published_at: string | null;// first publication moment; default sort key
  created: string;            // draft start
  updated: string;
}

interface BlogProductCard {   // compact product card used only in blog (home recent_products, post related_products)
  id: number; name: string; slug: string;
  image: string;              // never null
  in_stock: boolean;          // always true here (out-of-stock excluded); it's the operator "in stock" tick, NOT live stock
  price: number | null;       // pre-discount; null if product has no variant
  final_price: number | null; // what the user pays — display this
  has_discount: boolean;
  discount_percent: number;   // 0 when none
  is_in_wishlist: boolean;    // viewer flag; false for guests
}
```
Example live `BlogProductCard`: `{"id":10001,"name":"گوشی موبایل سامسونگ گلکسی S25 اولترا","slug":"samsung-galaxy-s25-ultra","image":"http://localhost:8000/static/defaults/default.png","in_stock":true,"price":78500000,"final_price":78500000,"has_discount":false,"discount_percent":0,"is_in_wishlist":false}`.
Prices come from the "default variant": an in-stock variant is preferred over an out-of-stock one, then the admin's default, then a discounted variant, then the cheapest. Re-check stock against the product or cart API before adding to the cart.

### 1.3 GET `/api/v1/blog/home/` — blog landing composition
No query parameters and no pagination.
```ts
interface BlogHome { featured_posts: PostCard[]; recent_posts: PostCard[]; recent_products: BlogProductCard[]; }
```
- `featured_posts`: **0 to 4** items. The admin chooses a source in "بلاگ › پیکربندی پست ها": disabled (the project default, which returns `[]`), manual (1 to 4 posts in priority order; a selected post that is later unpublished is skipped), latest (up to 4 by `published_at` desc), or most viewed (by `view_count` desc, then newest). The API does not expose which mode is active. Render N cards and hide the block when the array is empty. The layout must work for 1, 2, 3 or 4 cards.
- `recent_posts` / `recent_products`: the admin can turn each off or set its count to 0 (returns `[]`). The default count is 5 (the fixtures use 5 posts and 6 products). Manual picks come first in priority order, then the rest is filled automatically with the newest published posts (by `published_at`) or products (by creation date) that are not already picked. Products must be published and in stock; an out-of-stock manual pick is dropped.
- Live: featured 3 (manual), recent_posts 5, recent_products 6.
- Caching: fetch **without a token** for the shared/ISR render, then fill in `is_in_reading_list` and `is_in_wishlist` per viewer on the client (1.9).

### 1.4 GET `/api/v1/blog/post/list/` — the only post list (archive, category page, search, author)
Query parameters (all optional):
| Param | Type | Behaviour (verified) |
|---|---|---|
| `search` | string | Word-by-word AND over `name` + `description` (the body is not searched). Matching is case-insensitive. Persian/Arabic-Indic digits are treated as Latin digits, ي/ى as ی, ك as ک, ZWNJ as a space, and tatweel is ignored. A repeated word counts once, and only the first 8 distinct words are used. Live: `search=1405` matched «…سال ۱۴۰۵». |
| `category` | slug(s) | Includes **descendant categories** and returns the OR union with duplicates removed. Repeat the parameter or comma-separate it (both verified to give the same result). **Unknown slugs are ignored, and if none match the filter is dropped and ALL posts come back** (verified: `category=nonexistent` → count 19). A draft category's slug still filters (and returns its published posts). |
| `author` | number | Numeric author id. A non-numeric value gives `400 invalid` with `attr: "author"`. The schema types it as `number`, so `author=1.5` returns 200 with `count: 0`. Author ids are not exposed anywhere in the blog payloads; they are only known from the admin panel. |
| `ordering` | `published_at`, `created`, `updated`, `name`, `view_count`, each optionally prefixed with `-` | Comma-separated multiple keys work (`-view_count,name` verified). An invalid value gives `400 invalid_choice` with `attr: "ordering"`. The default is `-published_at` (posts with null `published_at` go last, then `-created`, then id as a tie-break). |
| `page`, `limit` | int | `limit` defaults to the admin `paginator_number` (12 live) and is capped at 100. |

`data` = `Paginated<PostCard>`. When nothing matches you get `200` with `count: 0`.
Category page pitfall: since unknown slugs return everything, **call `GET /blog/category/{slug}/` first (or in parallel) and return a 404 page if it 404s**.
`post_count` on a category counts **direct** posts only, while `?category=` includes descendants. In live data `tech-news` has `post_count: 2` but the list returns 5. For a "N posts" label, use `count` from the list.

### 1.5 GET `/api/v1/blog/post/{slug}/` — post detail
There are no query parameters. A missing post, a draft, or a post whose schedule is in the future returns `404 not_found` (detail «یافت نشد.») for non-staff users.

```ts
interface ContentHeading {
  text: string;      // heading text
  id: string;        // anchor injected on the heading tag inside `content`; often Persian (e.g. "چرا-بودجه-۳۰-میلیونی")
  level: number;     // 1..6 = h1..h6 (actual tag level)
  number: string;    // outline numbering relative to the document: first h2 in a doc with no h1 is "1"; then "1-1", "1-2-1"…
}
interface PostDetail {
  id: number; name: string; slug: string;
  description: string | null;
  content: string | null;               // trusted admin HTML; /media & /static made absolute on API host; storefront links (e.g. /blog/category/x/, /page/terms/) left relative; headings carry ids
  headings: ContentHeading[];           // [] when no headings
  image: string;                        // 500x500 (og:image); never null
  banner: string | null;                // wide hero, original size; null => render NO banner section (do not fall back to image)
  author: PostAuthor | null;
  categories: CategoryLight[];
  breadcrumb: CategoryLight[];          // root→leaf chain of the post's DEEPEST category (first of equally deep), includes the leaf; [] if no category
  comment_count: number; question_count: number;
  view_count: number;                   // already incremented by THIS call
  is_in_reading_list: boolean;          // viewer flag for this post
  related_posts: PostCard[];            // may be []; never contains the post itself
  related_products: BlogProductCard[];  // may be []
  page_title: string;                   // SEO title, falls back to post name (no site suffix added)
  page_description: string;             // "" when not set (NOT null)
  page_keywords: string;                // "" when not set
  canonical_link: string | null;        // manual canonical; null => self-canonical
  structured_data: [BlogPostingLD];     // ARRAY with exactly one object
  breadcrumb_structured_data: BreadcrumbListLD; // OBJECT
  is_unpublished: boolean;              // true = staff preview of a draft or a not-yet-due scheduled post
  published_at: string | null; created: string; updated: string;
}
```
Things the API does **not** provide: **reading time** (compute it from the `content` text yourself), an author bio/id/slug, `og:*` fields beyond the above, a noindex flag (only `is_unpublished`), prev/next post, and comments (those are a separate endpoint). The model has a `meta_tags()` helper, but it is not exposed for posts.

**TOC:** the `headings` ids match the `id`s inside `content`.
- Build each `href` with `'#' + encodeURIComponent(id)` and scroll with `document.getElementById(id)`, not `querySelector`.
- Two headings with the same text get **the same id**, and the browser jumps to the first one.
- A heading made only of punctuation gets `id=""`.
- An empty heading still consumes a TOC number, so the numbering skips (see Bugs).
- Add `scroll-margin-top` to clear a sticky header.

**Related logic (server-side; the client only renders):**
- `related_posts`:
  - Returns `[]` if the global or per-post "show related" switch is off.
  - Otherwise manual picks come first, in priority order.
  - If **both** the global and per-post autofill are on, the newest same-category posts are added, walking up the category tree.
  - If slots still remain after that, the newest posts in the whole blog fill them.
  - Count: admin setting, default 10 (6 in the fixtures).
- `related_products`: returns `[]` if switched off. Otherwise it returns the manual, published, in-stock picks. **Only if none are valid** does it substitute the newest published in-stock products; there is no partial top-up. Count: admin setting, default 10 (4 in the fixtures).

**View counter:** every successful GET of a published post runs `view_count += 1` and returns the incremented value. There is no deduplication or bot protection. Staff previews of drafts do not count. Next.js consequences:
- Do not fetch this endpoint twice per page view. `generateMetadata` and the page should share one call, via the same native `fetch` URL and options, which React memoizes, or via `React.cache`. An axios wrapper is not deduplicated.
- An uncached dynamic post page plus `<Link prefetch>` on post cards will inflate views. Use `prefetch={false}` on links to posts, or cache the detail.
- ISR/`revalidate` on the post page under-counts views, because only revalidations hit the API. Decide deliberately; there is no separate "count a view" endpoint.

**Staff draft preview:** with a staff or superuser token, drafts and not-yet-due scheduled posts return 200 with `is_unpublished: true` (verified on `draft-post-internal` with the manager token: `view_count: 0`, `published_at: null`). Show a "پیش‌نمایش — این پست هنوز منتشر نشده است" bar, set `noindex`, and hide share links. Comment lists of drafts return 404 even for staff, and draft categories return 404 even for staff.

### 1.6 GET `/api/v1/blog/category/list/` and GET `/api/v1/blog/category/{slug}/`
List query: `search` (word-AND match on name, same normalization as post search), `parent` (a slug: returns **direct children only**; an unknown slug returns `count: 0`, not everything), `ordering` (`created`, `name`, each optionally with `-`; comma-separated allowed; invalid gives `400 invalid_choice` with `attr: "ordering"`), `page`, `limit` (default 20).
```ts
interface BlogCategoryListItem {
  id: number; name: string; slug: string;
  path: string;                 // slug chain root→self joined by "/" e.g. "tech-news/mobile-blog" — use for the page URL
  parent_id: number | null;     // null = top level
  short_description: string | null;
  image: string; icon: string;  // never null (placeholder)
  post_count: number;           // published posts DIRECTLY in this category (not descendants)
  created: string; updated: string;
}
interface BlogCategoryDetail {
  id: number; name: string; slug: string; path: string; parent_id: number | null;
  short_description: string | null;
  description: string | null;   // plain text
  content: string | null;       // rich HTML (rendered usually below the post list); same URL absolutisation as post content
  image: string; icon: string;
  breadcrumb: CategoryLight[];  // root→self, includes self
  page_title: string;           // SEO title or category name
  page_description: string; page_keywords: string;  // "" when unset
  canonical_link: string | null;
  structured_data: [CollectionPageLD];
  breadcrumb_structured_data: BreadcrumbListLD;
  created: string; updated: string;
}
```
- With no `ordering`, results come in **tree pre-order** (each parent immediately before its children). Sending `ordering` breaks this.
- Build the tree in one pass over `results`. A published child whose parent is a draft keeps its `parent_id`, but the parent is missing from the list, so treat it as a root.
- **Fetch all pages** for menus: use `limit=100` and follow `next`, because the default of 20 truncates the tree.
- Live data: 7 published categories (`tech-news`, `tech-news/mobile-blog`, `buying-guide`, `buying-guide/appliance-blog`, `product-review`, `lifestyle`, `tutorial`). `draft-blog-category` is hidden.
- Detail returns 404 for a missing or draft category (no preview, even for staff). The detail does **not** include posts. A category page needs two parallel requests: detail (header) and `post/list/?category={slug}` (body).
- The detail is looked up by **slug only**. The storefront URL is `/blog/category/{path}/`. Take the last path segment as the slug, and **check that the requested path equals `data.path`**: 301 to the canonical path, or 404, otherwise any prefix resolves.
- A `CategoryLight` (in post `categories` and `breadcrumb`) has no `path`. For a post's breadcrumb, build each path by joining the slugs from the root. For `categories`, keep an `id → path` map built from the full category list. A category id that is not in that map is a draft, so do not link it.

### 1.7 Comments and Q&A
One model, two streams, separated by `comment_type`: `'comment'` («دیدگاه‌ها» tab, the default on submit) or `'question'` («پرسش و پاسخ» tab). Strings are used in both directions; a number gives `400 invalid_choice`.

**GET `/api/v1/blog/post/{slug}/comment/list/`**. Query: `comment_type` (`comment` or `question`; any other value gives `400 invalid_choice` with `attr: "comment_type"`), `page`, `limit` (default 20).
```ts
interface BlogComment {
  id: number;                    // send as `parent` to reply
  name: string;                  // display name (guest-typed or account display name)
  review: string;                // PLAIN TEXT — escape it; use white-space: pre-wrap
  comment_type: 'comment' | 'question';  // replies always inherit the parent's type
  is_user_admin: boolean;        // true = official shop answer written in the ADMIN PANEL → badge «پاسخ رسمی»
  is_current_user: boolean;      // caller wrote it (token required; guest = false) → badge «شما»; author id never exposed
  parent_id: number | null;
  replies: BlogComment[];        // recursive, unlimited depth; [] on leaves
  created: string;
}
```
- Only visible comments are returned: accepted and not withdrawn by the author. Pending, declined and withdrawn comments are never returned, and an email address is never returned (so there is no gravatar).
- Top-level threads are paginated, sorted newest first. Each thread brings its **whole visible subtree**, and siblings are also ordered newest first.
- `count` counts top-level threads only. For tab badges use `comment_count` and `question_count` from the post. The filter applies only to the top level; replies come along with their thread.
- A reply whose parent reply is not visible is silently omitted.
- A post that is a draft, scheduled or missing returns 404, even for staff.
- Live example on `best-phones-under-30m`: 2 threads, and thread 10002 has an admin reply 10003 (`is_user_admin: true`). With sara's token, her comment 10001 has `is_current_user: true`.

**POST `/api/v1/blog/post/{slug}/comment/submit/`** (Content-Type `application/json`):
```ts
interface BlogCommentCreateRequest {
  review: string;                       // required, non-blank, ≤ 4096 chars
  name?: string;                        // required for guests (≤ 255); ignored for signed-in users (still format-validated)
  email?: string | null;                // optional, guests only; must be valid; never shown publicly
  comment_type?: 'comment' | 'question';// default 'comment'; ignored for replies (inherits parent)
  parent?: number | null;               // id of an ACCEPTED, non-withdrawn comment on THE SAME post
  website?: string;                     // HONEYPOT: render hidden & leave empty. Non-empty ⇒ 201 + nothing saved
}
```
- The only success response is `201` with `msg: «نظر شما با موفقیت ثبت شد و پس از تأیید نمایش داده می شود.»` and `data: {}`. **The created comment is not returned.** Do not insert it optimistically: show `msg`, clear the form, and do not refetch expecting to see it. Every new comment is pending moderation, including comments from staff accounts, who comment on the site as customers. Only replies written in the admin panel are published immediately, with `is_user_admin: true`.
- Identity: for a signed-in user the server uses the account's display name (full name, or «کاربر») and the account email, and **ignores the submitted name and email**. Hide those fields for signed-in users.
- Error matrix (all verified live):

| HTTP | code | attr | cause |
|---|---|---|---|
| 400 | required | review | missing |
| 400 | blank | review | empty |
| 400 | max_length | review | > 4096 («طول این مقدار نباید بیشتر از 4096 نویسه باشد.») |
| 400 | invalid | name | guest without name («وارد کردن نام برای کاربران مهمان الزامی است.») |
| 400 | max_length | name | > 255 |
| 400 | invalid | email | bad email («پست الکترونیکی صحیح وارد کنید.») |
| 400 | invalid_choice | comment_type | not comment/question (numbers too) |
| 400 | does_not_exist | parent | parent missing, pending, declined or withdrawn («موردی با شناسهٔ «X» یافت نشد.») |
| 400 | incorrect_type | parent | non-numeric («مقدار این فیلد باید یک شناسهٔ عددی باشد.») |
| 400 | invalid | parent | parent belongs to another post («نظر والد متعلق به این پست نیست.») |
| 404 | not_found | null | post missing, draft or scheduled |
| 405 | method_not_allowed | null | GET etc. |
| 413 | request_too_large | null | body > 2.5 MiB (schema) |
| 429 | throttled | null | 10/hour shared budget (successful submissions only) |
| 503 | feature_disabled | null | `blog` or `blog_comments` off (`data.feature` says which) |
| 401 | api_key_missing / api_key_invalid | null | key problems |

- Form UX: enforce 255/4096 on the client, disable submit during `retry_after`, and map errors to fields via `attr` (there can be several).
- Depth: the server allows unlimited nesting, so cap the indentation in the UI.

### 1.8 Reading list (auth required; same contract as the product wishlist)
**GET `/api/v1/blog/reading-list/list/`**. Query: `search` (same rules as post search), `category` (same as the post list: includes descendants, OR across slugs, unknown slug gives the full list), `sort` (`added-desc` default or `added-asc`; anything else gives `400 invalid_choice` with `attr: "sort"`), `page`, `limit` (default 20, max 100; the admin page size does **not** apply). There is no `ordering`.
```ts
interface ReadingListPost extends PostCard { added_at: string; } // is_in_reading_list always true here
```
Posts that were unpublished, or are scheduled but not yet due, are hidden from `results` and `count`. The saved row stays and reappears if the post is republished. Ties in `added_at` have a stable order.

**POST `/api/v1/blog/post/{slug}/reading-list/`** has no body. It returns `201` when this call saved the post and `200` when it was already saved. Both return the same body: `{msg: «مطلب به لیست مطالعه اضافه شد.», data: {is_in_reading_list: true}}`. Read the state from `data`, not from the status code. Re-adding does not change `added_at`. A draft, a scheduled post or an unknown slug returns 404 (also for staff).

**DELETE `/api/v1/blog/post/{slug}/reading-list/`** always returns `204` with **no body** (do not call `.json()`), even when the post is not in the list, the slug is unknown, or the post was unpublished after saving. That last case is the only way to remove such rows.

Errors: `401 not_authenticated` / `token_not_valid`, `429 throttled` (60/min shared with the wishlist), `503 feature_disabled` (when `blog` is off; with POST nothing is created, with DELETE the row is kept), and `400 invalid_choice` / `404 not_found` on the list.
UX: a guest's bookmark button should go to login, not to a request that is known to fail.

**Per-viewer flag fill-in pattern** (used for cached home, list and detail pages):
1. For a signed-in user, fetch the reading list with `limit=100` and no cache, following `next` until it is null.
2. Collect the ids into a Set.
3. Mark matching cards. Do the same for `is_in_wishlist` from the product wishlist.

The cost is one backend read per page.

### 1.9 SEO and structured data
| Response field | Use for | Empty behaviour |
|---|---|---|
| `page_title` | `<title>`, `og:title` | falls back to the name (not null) |
| `page_description` | `<meta name=description>`, `og:description` | `""`, so skip the tag or use `description` |
| `page_keywords` | `<meta name=keywords>` | `""` |
| `canonical_link` | `<link rel=canonical>` | `null`, so use your own canonical (STOREFRONT_URL + path + trailing slash) |
| `image` | `og:image` | never empty |

JSON-LD: render `<script type="application/ld+json">{JSON.stringify(data.structured_data)}</script>` (an array) and the same for `breadcrumb_structured_data` (an object).

```ts
interface BlogPostingLD {
  '@context': 'https://schema.org'; '@type': 'BlogPosting';
  mainEntityOfPage: { '@type': 'WebPage'; '@id': string };  // https://{SITE_DOMAIN}/blog/{slug}/
  headline: string;
  description: string;                 // = page_description ('' if unset)
  image: string;                       // https://{SITE_DOMAIN}/media/CACHE/... (or /static/defaults/default.png)
  publisher: { '@type': 'Organization'; name: string; logo: { '@type': 'ImageObject'; url: string } }; // '' when site settings unset
  datePublished: string;               // 'YYYY-MM-DD' from post.created (NOT published_at)
  dateModified: string;                // 'YYYY-MM-DD' from post.updated
  articleBody: string;                 // RAW post HTML (tags included, media URLs relative)
  author?: { '@type': 'Person'; name: string };            // only if post has author
  commentCount?: number;               // only if comment_count > 0; = comment_count (top-level comments only)
  comment?: { '@type': 'Comment'; author: { '@type': 'Person'; name: string }; datePublished: string; text: string }[];
                                       // ≤5 visible entries of ANY kind (replies & questions included) — can exceed commentCount
}
interface CollectionPageLD {
  '@context': 'https://schema.org'; '@type': 'CollectionPage';
  name: string;                        // 'دسته‌بندی: {name}'
  description: string;                 // short_description || page_description || ''
  url: string;                         // https://{SITE_DOMAIN}/blog/category/{path}/
  isPartOf: { '@type': 'Blog'; name: string /* 'بلاگ {site}' */; url: string /* https://{SITE_DOMAIN}/blog/ */ };
  publisher: { '@type': 'Organization'; name: string; logo: { '@type': 'ImageObject'; url: string } };
}
interface BreadcrumbListLD {
  '@context': 'https://schema.org'; '@type': 'BreadcrumbList';
  itemListElement: { '@type': 'ListItem'; position: number; name: string; item: string }[];
  // [1] 'خانه' https://{SITE_DOMAIN}/ , [2] 'بلاگ' https://{SITE_DOMAIN}/blog/ , then each category of the (deepest) chain → /blog/category/{path}/
}
```
- The JSON-LD host is always `https://{SITE_DOMAIN}` (hard-coded https), **not** `STOREFRONT_URL` and not the API host. The sitemap uses `STOREFRONT_URL`. In dev the two differ: `https://localhost/blog/x/` versus `http://localhost:3000/blog/x/`. If the storefront domain is not `SITE_DOMAIN`, rewrite or override these URLs, or make `SITE_DOMAIN` the storefront domain and proxy `/media` and `/static` there, since the image and logo URLs point at `{SITE_DOMAIN}/media/...`.
- There is no FAQ JSON-LD (see section 2).
- Sitemap: `/sitemap.xml` is served by the API host, outside `/api/v1`, with no key required.
  - Posts appear as `{STOREFRONT_URL}/blog/{slug}/` (`lastmod` = post `updated`, `weekly`, `0.9`).
  - Categories appear as `{STOREFRONT_URL}/blog/category/{path}/` (`lastmod` = `updated`, `weekly`, `0.8`).
  - Scheduled-not-due posts are excluded. With `blog` off there are no blog rows.
  - The sitemap does **not** list `/`, `/blog/` or a FAQ page.
  - The storefront should proxy or rewrite `/sitemap.xml` to its own origin (or publish a sitemap index that includes the API's sitemap plus the static pages) and reference it in `robots.txt`.

### 1.10 Storefront URL patterns the backend assumes
These come from `get_absolute_url`, the sitemap, the JSON-LD and the docs. All have **trailing slashes**, so set `trailingSlash: true` in `next.config` to match the sitemap, canonical and JSON-LD URLs exactly.
| Page | Path | Source |
|---|---|---|
| Home | `/` | breadcrumb JSON-LD |
| Blog landing | `/blog/` | `BLOG_INDEX_PATH`, JSON-LD |
| Blog post | `/blog/{slug}/` | `Post.get_absolute_url`, sitemap |
| Blog category | `/blog/category/{path}/` (path = slug chain, e.g. `/blog/category/tech-news/mobile-blog/`) | `Category.get_absolute_url`, sitemap |
| Content page | `/page/{slug}/` (about-us, contact-us, privacy, return-policy, terms) | `Page.get_absolute_url`, sitemap |
| Product | `/product/{slug}/` | sitemap |
| Product category | `/product-category/{path}/` | sitemap |
| Product list | `/product/list/{slug}/` | sitemap |
| Brand | `/brand/{slug}/` | sitemap |
| Short link | `/s/{code}` | `SHORT_LINK_BASE_URL` |
| Dashboard banner `link` | either a storefront path starting with `/` (open with the router) or an `http(s)://` URL (open as an external link) | banner doc |
| FAQ page | not assumed by the backend; choose e.g. `/faq/` with per-question anchors `#faq-{id}` | FAQ doc |
| Account pages | not assumed by the backend (no deep links in push either) | — |

Next.js routing notes:
- `app/blog/[slug]/page.tsx` and `app/blog/category/[...path]/page.tsx` can coexist, but a post with slug `category` would be shadowed.
- Links inside `content` that point to the storefront are relative (for example `/blog/category/technology/`). Intercept clicks on relative anchors inside the rendered HTML and route them with `router.push`.
- My-comments subject links: `product` → `/product/{slug}/`, `post` → `/blog/{slug}/`, `page` → `/page/{slug}/`.

### 1.11 Suggested Next.js data strategy (blog)
- Blog home, post list and category list/detail: server `fetch` with **no Authorization header**, `next: { revalidate: 60–600 }`, tagged per page. Fill viewer flags on the client as described in 1.8.
- Post detail: choose a view-count policy (see 1.5). Fetch without a token for public HTML. For staff preview, use a draft-mode route that forwards the staff token with `cache: 'no-store'`.
- Comment list: client-side (or `revalidate` ≤ 60 s), loaded lazily per tab with `comment_type`.
- Comment submit, reading list and all account data: client-side or route handlers with `cache: 'no-store'`.
- Render `content` with `dangerouslySetInnerHTML`. It is trusted admin HTML, but sanitizing it server-side (sanitize-html / isomorphic-dompurify) is a cheap defence. Add `dir="rtl"` and typography styles. Content `<img>` tags point at the API host, so allow that host in the CSP `img-src`.

---

## 2. FAQ / help centre (`/api/v1/faq/`)

### 2.1 Endpoint
| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/api/v1/faq/category/list/` | public. `Authorization` has no effect (a bad token does not cause 401) | read-only. `HEAD` returns 200 with no body. `OPTIONS` returns 200 with DRF metadata (`name: "Faq Category List"`). POST, PUT, PATCH and DELETE return `405` («متد POST مجاز نیست.») |

Query: `page` (a non-numeric value or a page past the end returns `404 not_found` «صفحه نامعتبر»), `limit` (default 20, max 100, invalid values fall back to 20 silently). **There is no search, filter or ordering.** Unknown parameters such as `?search=`, `?ordering=` or `?display=` are silently ignored (verified). It never returns 400.

```ts
interface FAQItem {
  id: number;          // unique across help centre; stable anchor key (e.g. #faq-10004)
  question: string;    // PLAIN text, may contain newlines → escape; white-space: pre-line
  answer: string;      // HTML from CKEditor (NOT sanitized; /media/uploads/... URLs stay RELATIVE — not absolutised, unlike blog);
                       // legacy/fixture rows may be plain text without tags → treat ALWAYS as HTML
  created: string; updated: string;
}
interface FAQCategory {
  id: number;          // stable key (names are NOT unique)
  name: string;        // ≤255, plain text
  items: FAQItem[];    // visible questions, ordered by id asc; always an array, may be []; never paginated
  created: string;
  updated: string;     // category row only — NOT bumped by question edits
}
type FAQListResponse = Paginated<FAQCategory>; // pagination unit = CATEGORY
```
- Visibility:
  - A hidden category is absent along with all its questions (even visible ones) and is not counted.
  - A hidden question is absent from `items`.
  - A visible category with no visible questions is still returned with `items: []` and is counted.
  - A question with no category never appears.
- Order: categories by id ascending, then questions by id ascending (creation order). There is no priority field. **Keep the server order and do not sort by name.**
- Not included: a display flag, slugs, an order field, SEO fields, per-question URLs, a single-category or single-question endpoint, and the product-specific Q&A. Product, product-category and list Q&A live in those entities' own `question_answers`, and user questions under products are product comments of type `question`.
- Live data: 4 categories (`10001` «سفارش و خرید» ×3, `10002` «ارسال و تحویل» ×3, `10003` «پرداخت و بازگشت وجه» ×3, `10004` «مرجوعی و گارانتی» ×2). The answers are plain text.
- Server: no `Cache-Control`, `ETag` or `Last-Modified`. `Vary: origin, Cookie`. No server-side cache, so changes are visible on the next request.

### 2.2 How to render the help-centre page
1. Fetch `?limit=100` and follow `next` (take only `page` from it when behind a proxy) until it is null.
2. Decide what to do with empty categories: usually skip them, or show a "no questions in this section" message.
3. Render one heading per category and one `<details id="faq-{id}"><summary>{escaped question}</summary><div>{answer HTML}</div></details>` per question. This works without JS and is crawlable.
4. Process each `answer`: prefix relative `src`/`href` values that start with `/` (but not `//`) with the **API origin**, then sanitize with DOMPurify if your CSP or policy requires it. The server does not sanitize.
5. **FAQPage JSON-LD is not provided, so build it yourself:**
```ts
const faqLd = {
  '@context': 'https://schema.org', '@type': 'FAQPage',
  mainEntity: categories.flatMap(c => c.items).map(i => ({
    '@type': 'Question', name: i.question,
    acceptedAnswer: { '@type': 'Answer', text: i.answer /* HTML allowed by Google; or strip tags */ },
  })),
};
```
6. Caching: SSR/ISR with `revalidate ≈ 600` (all SSR traffic shares one IP budget of 2000/hour). On 429 or 5xx, serve the stale copy. Do not detect changes by the max `updated`. Search, if needed, is client-side over the full data set.
7. Error codes: `api_key_missing` / `api_key_invalid` (401, show a cached copy if you have one), `not_found` (404, return to page 1), `method_not_allowed` (405), `throttled` (429). The schema also lists 400, 401 token codes and 415, but this endpoint never sends them.
8. Do not confuse this page with product Q&A (`question_answers`) or user questions.

---

## 3. Customer dashboard (`/api/v1/dashboard/`)

### 3.1 Endpoint map
| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/api/v1/dashboard/summary/` | **auth** | sidebar and home counters + wallet |
| GET | `/api/v1/dashboard/purchased-product/list/` | **auth** | products bought (paid orders), newest purchase first |
| GET | `/api/v1/dashboard/comment/list/` | **auth** | "my comments" across product, post and page |
| DELETE | `/api/v1/dashboard/comment/{subject_type}/{comment_id}/delete/` | **auth** | withdraw one comment (204) |
| GET | `/api/v1/dashboard/banner/list/` | **public** (key only; token ignored) | live promo banners |

The owner is always the token's user, and no endpoint takes a customer parameter. All GETs return 405 for other methods. Delete accepts DELETE only (`Allow: DELETE, OPTIONS`).
Design principle: "every number is the number of the matching list". Each badge equals the `count` of the page it opens, so never compute badges client-side. **Re-read the summary after any write that changes a counter**: wishlist add or remove, reading-list add or remove, comment submit or withdraw, payment, order cancel, purchase review.
The summary is an object, so `page` and `limit` are silently ignored (verified).

### 3.2 The nine account pages → endpoints (reproduced exactly from the guide, section 2)
| # | Page | Endpoints | Owner guide |
|---|---|---|---|
| 1 | **Dashboard (home page)** | `GET /api/v1/dashboard/summary/` for the counters and wallet, and `GET /api/v1/dashboard/purchased-product/list/` with `limit=4` for the four products of the latest purchases. Banners come from `GET /api/v1/dashboard/banner/list/` (section 6). | This guide, section 3; section 4; section 6 |
| 2 | **Orders** | `GET /api/v1/order/list/` with a `status_group` filter per tab, `GET /api/v1/order/<order code>/` for details, and `POST /api/v1/cart/reorder/` for "buy again". Build the tabs from the summary's `orders.groups` (section 3). | Order & payment guide, history section; cart guide, reorder |
| 3 | **Profile** | `GET` and `PATCH /api/v1/account/profile/me/`, change password, add or change email and phone number, and two-step login. | Auth guide: profile; email & phone; two-step login |
| 4 | **Wishlist (محصولات مورد علاقه)** | `GET /api/v1/product/wishlist/list/` for the list, and `POST` or `DELETE /api/v1/product/detail/<slug>/wishlist/` to save or remove. The menu badge is `wishlist_count`. | Product guide, wishlist |
| 5 | **Addresses** | List, create, detail, edit, delete and set default under `/api/v1/account/address/`. | Address book guide, endpoint map |
| 6 | **Wallet** | `GET /api/v1/wallet/` for balance and terms, plus the transaction list, top-up, withdrawal request, and `GET /api/v1/payment/history/` for payment history. Balance and frozen state are also in the summary (section 3). | Order & payment guide, wallet; payment history |
| 7 | **Reading list (لیست مطالعات)** | `GET /api/v1/blog/reading-list/list/` for the list, and `POST` or `DELETE /api/v1/blog/post/<slug>/reading-list/` to add or remove. The menu badge is `reading_list_count`. | Blog guide, reading list |
| 8 | **My comments (نظرات من)** | `GET /api/v1/dashboard/comment/list/` for the customer's comments from all three places (product, post, page), and `DELETE /api/v1/dashboard/comment/product/<comment id>/delete/` to withdraw one, with `post` or `page` instead of `product` for post and page comments. The menu badge is `comment_count`. | This guide, section 5 |
| 9 | **Awaiting review (در انتظار دیدگاه)** | `GET /api/v1/order/review/awaiting/list/` for purchases waiting for a review, and `POST /api/v1/order/<order code>/review/` to submit one. The menu badge is `awaiting_review_count`. | Order & payment guide, reviewing a purchase |

Sidebar badges come from **one** `GET /dashboard/summary/`:
- Orders badge and tabs: `orders`
- Wallet: `wallet`
- Wishlist: `wishlist_count`
- Reading list: `reading_list_count`
- My comments: `comment_count`
- Awaiting review: `awaiting_review_count`

Profile and Addresses have no counter.

Concrete routes from the schema behind the shorthand rows above:
- Profile: `GET/PATCH /api/v1/account/profile/me/`, `POST /api/v1/account/profile/password/change/`, `POST /api/v1/account/profile/contact/request/` + `POST /api/v1/account/profile/contact/verify/` (email/phone), `POST /api/v1/account/profile/totp/{setup,enable,disable}/`, `GET /api/v1/account/profile/totp/status/`.
- Addresses: `GET /api/v1/account/address/list/`, `POST /api/v1/account/address/create/`, `GET /api/v1/account/address/{id}/`, `PATCH|PUT /api/v1/account/address/{id}/update/`, `DELETE /api/v1/account/address/{id}/delete/`, `POST /api/v1/account/address/{id}/set-default/`.
- Wallet: `GET /api/v1/wallet/`, `GET /api/v1/wallet/transaction/list/`, `POST /api/v1/wallet/top-up/`, `GET /api/v1/wallet/withdrawal/list/`, `POST /api/v1/wallet/withdrawal/request/`, `POST /api/v1/wallet/withdrawal/{uuid}/cancel/`, `GET /api/v1/payment/history/`, `GET /api/v1/payment/history/{payment_uuid}/`.
- Orders extras: `POST /api/v1/order/{order_code}/cancel/`, `GET /api/v1/order/{order_code}/qr-code/`, `POST /api/v1/payment/order/{order_uuid}/intent/`.

### 3.3 Filter and sort conventions across account lists (reproduced exactly from the guide)
An unknown value for any **sort** parameter returns `400 invalid_choice` with `attr` set to that parameter, everywhere.
| Page and list | Sorting | Unknown filter value | "Not your order" |
|---|---|---|---|
| Orders `GET /api/v1/order/list/` | `sort=`: `date-desc` (default), `date-asc`, `total-desc`, `total-asc` | `status` and `status_group`: coded 400. `order_status_filter_unknown` with `unknown_statuses` + `known_statuses`, or `order_status_group_filter_unknown` with `unknown_status_groups` + `known_status_groups` in `data`. An empty value is ignored. | Detail, cancel, QR and review (`/order/<code>/`, `…/cancel/`, `…/qr-code/`, `…/review/`): `404 not_found`. Reorder (`POST /api/v1/cart/reorder/`): `404 cart_reorder_order_not_found`. Payment intent (`POST /api/v1/payment/order/<uuid>/intent/`): `404 not_found`. |
| Awaiting review `GET /api/v1/order/review/awaiting/list/` | none; always newest delivery first | no filters | Review submit (`POST /api/v1/order/<code>/review/`): `404 not_found` |
| Wishlist `GET /api/v1/product/wishlist/list/` | `sort=`: `added-desc` (default), `added-asc` | `in_stock` with a value other than true/false is ignored (full list) | — |
| Reading list `GET /api/v1/blog/reading-list/list/` | `sort=`: `added-desc` (default), `added-asc` | `category` with an unknown slug is ignored (full list), the same rule as the post list | — |
| Wallet transactions `GET /api/v1/wallet/transaction/list/` | `ordering=`: `created`, `-created`, `amount`, `-amount`; no parameter means newest first | `direction` and `cause`: empty page (200, `count: 0`), not an error | — |
| Wallet withdrawals `GET /api/v1/wallet/withdrawal/list/` | `ordering=`: the same four; no parameter means newest first | `status`: empty page, not an error | — |
| Payment history `GET /api/v1/payment/history/` | none; always newest first | `status`, `method`, `applies_to`: empty page, not an error | Single payment (`GET /api/v1/payment/history/<uuid>/`): `404 not_found` |
| My comments `GET /api/v1/dashboard/comment/list/` | none; always newest written first | `subject_type`: coded 400 `dashboard_subject_type_unknown` with `unknown_subject_types` + `known_subject_types`. `status` and `comment_type`: `400 invalid_choice` | — |
| Purchased products `GET /api/v1/dashboard/purchased-product/list/` | none; always newest purchase first | no filters | — |

So the same parameter name `status` returns a coded error in orders, `invalid_choice` in my comments, and an empty page in payment history. Never show "nothing here" for an empty page unless the value came from the owner guide's own list.

### 3.4 GET `/api/v1/dashboard/summary/`
```ts
type OrderStatus = 'awaiting_payment'|'awaiting_review'|'processing'|'packing'|'sent'|'delivered'|'returned'|'cancelled';
type OrderStatusGroup = 'awaiting_payment'|'in_progress'|'delivered'|'returned'|'cancelled';
interface DashboardSummary {
  wallet: { balance: number /* toman, int */; is_frozen: boolean };   // no wallet yet ⇒ 0/false (summary never creates one); freeze message → GET /api/v1/wallet/ (freeze_message)
  orders: {
    total: number;                                                    // = Σ statuses[].count = Σ groups[].count
    groups: { key: OrderStatusGroup; label: string; statuses: OrderStatus[]; count: number }[]; // ALWAYS all 5, in tab order, zeros included
    statuses: { status: OrderStatus; label: string; count: number }[];                         // ALWAYS all 8, tab order then lifecycle order
  };
  awaiting_review_count: number; // (order, product) pairs from delivered orders, product published, no review yet — NOT an order count
  wishlist_count: number;        // = count of GET /product/wishlist/list/ (only still-visible products)
  reading_list_count: number;    // = count of GET /blog/reading-list/list/ (only still-visible posts)
  comment_count: number;         // all own comments (product/post/page, any moderation status, incl. own replies), minus withdrawn, never official admin answers
}
```
Tabs (fixed order) are listed below. The five tabs cover the eight statuses with no overlap. Build the tabs from `groups`, do not hard-code the status-to-tab mapping, and print the labels as they are.
| key | label | statuses |
|---|---|---|
| `awaiting_payment` | در انتظار پرداخت | awaiting_payment |
| `in_progress` | جاری | awaiting_review, processing, packing, sent |
| `delivered` | تحویل داده شده | delivered |
| `returned` | مرجوعی | returned |
| `cancelled` | لغو شده | cancelled |

Status labels: awaiting_payment «در انتظار پرداخت», awaiting_review «در انتظار بررسی», processing «در حال انجام», packing «بسته‌بندی», sent «ارسال شده», delivered «تکمیل شده», returned «مسترد شده», cancelled «لغو شده». Note that the status labels differ from the tab labels for delivered and returned.

Live (sara): `wallet {balance: 3031000, is_frozen: false}`, total 6 (1 awaiting_payment, 1 in_progress via processing, 4 delivered), `awaiting_review_count: 7`, `wishlist_count: 0`, `reading_list_count: 0→1→0` (as I added and removed a post), `comment_count: 4`.
Errors: 401 (`not_authenticated`, `token_not_valid`, `api_key_*`), 405, 429. The response is per user, so never put it in a shared cache.

### 3.5 GET `/api/v1/dashboard/purchased-product/list/`
Query: `page`, `limit` (default 20, max 100; the home page uses `limit=4`). There is no filter or sort; the order is always newest purchase first.
"Purchased" means a line in the caller's own **paid** orders (status `processing`, `packing`, `sent` or `delivered`). Orders that are `awaiting_payment`, `awaiting_review`, `cancelled` or `returned` do not count.
- One row per product, even if the product was bought several times or in several variants. `last_purchased_at` is the date of the newest paid order.
- Unpublished products are hidden, and reappear if republished.
- A line whose variant was deleted is not counted.
```ts
// = the catalogue ProductCard (product guide §7.5) + last_purchased_at. Fields verified live:
interface PurchasedProduct {
  id: number; name: string; slug: string;
  extra_detail: string | null;
  image: string;
  type: 'simple' | 'variable' | 'downloadable' | 'virtual';
  badge: { id: number; name: string; badge_color?: string; text_color?: string } | null;  // null seen live
  brand: { id: number; name: string; slug: string; image: string } | null;                // null seen live
  categories: { id: number; name: string; slug: string; parent_id: number | null }[];
  in_stock: boolean; is_special_product: boolean; is_collection: boolean; enable_major: boolean;
  rating: number; rating_count: number;
  default_variant_id: number | null;
  default_variant_attributes: { attribute_name: string; name: string }[];
  price: number | null; final_price: number | null; has_discount: boolean; discount_percent: number;
  discount_end_time: string | null; discount_time_remaining: number | null;
  order_limit_min: number | null; order_limit_max: number | null;
  is_in_wishlist: boolean;       // real per-viewer value (auth endpoint)
  created: string; updated: string;
  last_purchased_at: string;     // newest paid order containing it; the sort key
}
```
Render each row with the same card component as the product list, and use `last_purchased_at` only for an "آخرین خرید" label. Live (sara): 7 products. Errors: 401, 404 (page out of range), 405, 429.

### 3.6 "My comments" (نظرات من)
**GET `/api/v1/dashboard/comment/list/`**. Query:
- `subject_type`: `product`, `post` or `page`. **Repeat the parameter** for several types (`?subject_type=post&subject_type=page`). A comma-separated value such as `post,page` returns a 400. An empty value is ignored. Any other value returns `400 dashboard_subject_type_unknown` with `data.unknown_subject_types` and `data.known_subject_types` (`["page","post","product"]`).
- `comment_type`: `comment` or `question`; otherwise `400 invalid_choice`.
- `status`: `pending`, `accepted` or `declined`; otherwise `400 invalid_choice` (for example `approved` is rejected).
- `search`: word-AND over the comment text only, with the same Persian normalization as elsewhere.
- `page`, `limit` (default 20, max 100).

Filters combine with AND. The order is always newest first (ties: larger id first). There is no sort parameter.

What appears:
- Only the caller's own comments, in all three moderation states, including replies the caller wrote (`is_reply: true`).
- Withdrawn comments never appear.
- Official admin answers are never rows, not even for the staff member who wrote them in the panel. A comment a staff member writes on the site is a normal row.
- Other people's visible direct replies appear inside `replies`.
- Unfiltered `count` equals the summary's `comment_count`.

```ts
interface MyCommentSubject {
  id: number; name: string /* product/post name or page title */; slug: string;
  image: string | null;     // product/post thumbnail (or placeholder); null for page
  rating: number | null;    // product average (float); null for post/page
}
interface MyCommentReply { id: number; name: string; review: string; is_user_admin: boolean /* «پاسخ فروشگاه» */; created: string; }
interface MyComment {
  id: number;                                   // unique ONLY within subject_type → key = `${subject_type}:${id}`
  subject_type: 'product' | 'post' | 'page';
  comment_type: 'comment' | 'question';
  status: 'pending' | 'accepted' | 'declined';
  status_display: string;                       // print as is: «در انتظار تأیید» | «تأیید شده» | «رد شده»
  is_reply: boolean;
  review: string;                               // plain text
  title: string | null;                         // product review title; null otherwise
  rating: number | null;                        // product review score 1–5; null otherwise
  is_verified_buyer: boolean | null;            // product: «خریدار» badge (false for product questions); null for post/page
  order_code: string | null;                    // product review written for a purchase → link to order detail; null otherwise
  created: string;
  subject: MyCommentSubject;
  replies: MyCommentReply[];                    // visible DIRECT replies only (shop or other customers), public-thread order
}
```
Live (sara): page 10001 (with an admin reply), post 10001, product 10014 and product 10001. **Three rows share `id: 10001`**, which is why the composite key is required. Errors: 400 (as above), 401, 404 (page out of range), 405, 429.

**DELETE `/api/v1/dashboard/comment/{subject_type}/{comment_id}/delete/`** (`subject_type` is one of `product`, `post`, `page`; `comment_id` is an integer). It has no body and returns `204` with **no body** (do not parse JSON). It works in any moderation state and **ignores feature switches**, so a comment can be withdrawn even while commenting is closed.
Effects:
- The row leaves the list and `comment_count` drops by one, so re-read the summary.
- The comment and its replies disappear from the public thread.
- A product's `rating_average` and `rating_count` are recomputed in the same transaction.
- The purchase does **not** return to "awaiting review", and `awaiting_review_count` is unchanged.
- The moderation status is unchanged. The row is kept for moderators (soft delete via `user_removed_at`).

| Case (verified) | Result |
|---|---|
| own comment, first time | 204 |
| same comment again | 404 not_found (envelope) |
| another user's comment / shop answer / staff's own panel answer | 404 not_found (indistinguishable from missing) |
| right id, wrong subject_type | 404 not_found |
| unknown subject_type (e.g. `review`) or non-numeric id | no route: **HTML 404 in dev (DEBUG)**, JSON `not_found` in prod |
| no token | 401 not_authenticated |
| GET on the route | 405 (`Allow: DELETE, OPTIONS`) |

UX: on a 404, refresh the list quietly and do not show an error. After a 204, remove the row and re-read the summary.
Verified end-to-end: ali submitted a blog question. It showed as `pending` in his list (comment_count 4→5) and did not appear in the public list. After withdrawal it returned 204, then 404 on a repeat, and comment_count went back to 4.

### 3.7 GET `/api/v1/dashboard/banner/list/` (public; the only endpoint here that needs no login)
Query: `page`, `limit` (default 20, max 100). There is no filter or sort. Order: the operator's `position` ascending, then newer first.
Only **live** banners are returned: active, `starts_at ≤ now` (inclusive), and `now < ends_at` (exclusive). The window, active flag and position are not exposed, so do not keep this response in a shared cache for more than a few minutes. The token has no effect.
```ts
interface DashboardBanner {
  id: number;
  title: string;                 // ≤120
  subtitle: string;              // '' when none
  image: string;                 // absolute, always present (placeholder if file missing)
  mobile_image: string | null;   // null ⇒ use `image` on phones (never a placeholder)
  alt: string;                   // '' when none
  link: string;                  // '/storefront/path' (router) or 'http(s)://…' (external) — href as is
  button_label: string;          // default «مشاهده کنید»
}
```
Live dev data has 0 banners (`count: 0`, `total_pages: 1`). The home page must render without them. Errors: 401 (key only), 404 (page out of range, including `page=99` on an empty list), 405, 429.

### 3.8 Dashboard error codes
| code | HTTP | meaning | client action |
|---|---|---|---|
| api_key_missing / api_key_invalid | 401 | key | config problem; **do not log out** |
| not_authenticated | 401 | no token | go to login, then return |
| token_not_valid | 401 | expired or invalid | refresh once via `/api/v1/account/auth/token/refresh/`, then go to login |
| dashboard_subject_type_unknown | 400 | bad `subject_type` | programming error; use `known_subject_types` |
| invalid_choice | 400 | bad `comment_type` or `status` (`attr` = the parameter) | programming error |
| not_found | 404 | page out of range, or withdrawing something that is not yours or already withdrawn | lists: go to the last valid page; withdraw: refetch |
| method_not_allowed | 405 | wrong method | — |
| throttled | 429 | user budget | wait `retry_after`; never poll the summary in a loop |

---

## 4. Notifications and push devices

### 4.1 Endpoint map (all four require **X-API-Key + Bearer**; none is open to guests)
| Method | Path | Purpose | Body |
|---|---|---|---|
| POST | `/api/v1/devices/` | register or refresh this device's FCM token (upsert) | JSON |
| DELETE | `/api/v1/devices/unregister/` | stop push to one of **your** devices (soft deactivate) | **JSON body on DELETE** |
| GET | `/api/v1/notification/list/` | inbox: personal + broadcast, newest first, with your read state | — |
| POST | `/api/v1/notification/{id}/read/` | mark one notification read for you (idempotent) | none |

Methods: devices accepts POST only (there is no list, update or delete; GET returns 405 with `Allow: POST, OPTIONS`). Unregister accepts DELETE only (POST returns 405). Read accepts POST only (GET, PUT and PATCH return 405). There is no separate throttle; these endpoints use the `user` budget of 5000/hour.

### 4.2 Notification types and data
```ts
interface NotificationItem {
  id: number;
  title: string;                // ≤255; first line of the push
  body: string;                 // plain text (not HTML), unlimited
  image: string | null;         // absolute URL on the REQUEST host (push image uses https://{SITE_DOMAIN}/… instead)
  topic: string | null;         // operator free text; NOT used for sending; don't build logic on it
  notification_type: 'normal';  // only value today; treat unknown future values like 'normal'
  related_object: number | null;// reserved; ALWAYS null today — no deep links
  is_read: boolean;             // THIS user's read state (broadcasts are per-user)
  created: string;              // creation time in panel (sort key), not delivery time
  updated: string;              // bumps on every send attempt (≈ last send time), not content change
}
type NotificationList = Paginated<NotificationItem>;
```
Query: `page` (out of range returns 404 not_found «صفحه نامعتبر»), `limit` (default 20, max 100), `notification_type` (repeatable; an unknown name returns an **empty list with 200**, not a 400). `is_read` and any other filter are silently ignored (verified).
What the inbox contains:
- The user's personal notifications and **all broadcasts**, including ones created before the user signed up. A new account sees every past broadcast as unread.
- Drafts that were saved but not yet pushed, and notifications whose push failed. There is no send-status field.
- Notifications are listed even if the user has push turned off or has no devices.

What it does not contain: other users' notifications, and notifications deleted by an operator.
Live (sara): 10002 (personal) and 10001 (broadcast). Ali sees only 10001. After sara marked 10001 read, ali's copy stayed `is_read: false` (verified).

**Read semantics:**
- `POST /notification/{id}/read/` returns `200` with `{msg: «نوتیفیکیشن خوانده شد.», data: {}}`.
- It is idempotent and concurrency-safe, and it only affects the caller, even for broadcasts.
- There is **no unread endpoint**: no "mark all read", no unread count, no `is_read` filter, and no delete.
- A missing id or another user's notification returns `404 not_found`, never 403. On a 404, drop the item locally and refetch.
- A non-numeric id is not routed (HTML 404 in dev).
- **Unread badge:** count `is_read === false` over the pages you fetch. For an exact count, fetch with `limit=100` until `next` is null.
- **Mark all read:** loop the read endpoint over each unread id.
- Mark an item read when the user opens it in the inbox, never automatically from a push.

Where notifications come from: **only** the operator, via the admin panel's «ارسال نوتیفیکیشن» button. Nothing is generated automatically (orders, shipping, wallet and stock alerts go by SMS, email or Telegram). The sample titles like «سفارش شما ارسال شد» are hand-made fixtures. An operator cannot edit a notification after saving it (delete and recreate instead), and deleting it removes it from every inbox.

### 4.3 Devices: platforms and tokens
```ts
type PushDeviceType = 'ios' | 'android' | 'web';
interface PushDeviceRequest {
  registration_id: string;      // required, non-blank, no max length; THE uniqueness key (FCM registration token)
  type: PushDeviceType;         // required; stored/filtered in panel only — all three go through Firebase Cloud Messaging
  name?: string | null;         // ≤255, label in panel (e.g. "Chrome on Windows"); kept if omitted on re-register
  device_id?: string | null;    // ≤255, free-form, not unique, irrelevant to identity; kept if omitted
  active?: boolean;             // default true — DO NOT SEND (false registers a muted device)
}
interface PushDevice {
  id: number; name: string | null; registration_id: string; device_id: string | null;
  active: boolean; created: string /* first registration of this token; never changes */; type: PushDeviceType;
}
```
- `POST /devices/` returns `201` («با موفقیت ایجاد شد.») for an unknown token and `200` («درخواست با موفقیت انجام شد.») for a known one. Both responses have the same `PushDevice` body, and **200 is success**.
- The lookup is **global** (across all accounts). A known token is **transferred to the caller**: the owner changes, `type` is replaced, `active` is set back to true, and `name` and `device_id` change only if sent. `id` and `created` stay the same.
- Verified: sara registered with `type=web`, getting 201 and then 200. Ali registered the same token with `type=android` and got 200: the same id moved to ali, kept the name "Chrome on Windows" and changed type to android.
- `DELETE /devices/unregister/` with body `{registration_id}` always returns `200` with `{msg: «دستگاه از دریافت اعلان خارج شد.», data: {}}`. It does this whether the device was yours and active (now deactivated), already off, someone else's, or unknown. This is deliberate, to avoid an ownership oracle. The row is kept; only `active` is set to false.
- Device validation errors (verified): `400 required` (`attr: registration_id` and/or `type`), `400 blank` (registration_id is `""`, meaning the SDK has no token yet), `400 invalid_choice` (`type` is not ios/android/web, for example `"chrome"`), `400 max_length` (name or device_id), `400 parse_error` (bad JSON), `415 unsupported_media_type`, `401 not_authenticated` / `token_not_valid`, `405`. The schema also lists `403` (fcm-django `IsOwner`).

What deactivates a device: unregister (your device only), `POST /api/v1/account/auth/logout/` with `{refresh, registration_id}` (only if the refresh token's owner matches), `POST /api/v1/account/auth/logout-all/` (all of the account's devices), the panel's "logout all devices" button, an FCM send error (`UNREGISTERED`, `SENDER_ID_MISMATCH` or **any** `INVALID_ARGUMENT`), or the panel's "active" toggle (which the next POST undoes).
What does **not** deactivate a device: a password change or reset, the panel's "revoke sessions" action, or deactivating the account (an inactive account's devices keep receiving broadcasts and personal pushes).

Lifecycle the storefront must implement:
1. After login, call `getToken()`, then `POST /devices/`.
2. On **every app open or page load while logged in**, call `POST /devices/` again. This is required because a bad send can mass-deactivate devices through `INVALID_ARGUMENT`.
3. On FCM token refresh, POST the new token, and if you still have the old token, unregister it.
4. When the user turns push off in settings, call `DELETE /devices/unregister/`. When they turn it back on, POST again.
5. On logout, send `registration_id` together with `refresh` to `/auth/logout/`, or call unregister **before** clearing the access token. Otherwise a shared device keeps receiving the previous user's personal pushes.

### 4.4 Push payload and what "web push" means for the storefront
- **Web push is supported only through FCM.** The backend is Firebase Admin via fcm-django, and `type: 'web'` is accepted. There is no VAPID or Web Push Protocol endpoint and no `PushSubscription` storage.
- The storefront needs the Firebase **JS SDK** (`firebase/messaging`), a `public/firebase-messaging-sw.js` service worker, the Firebase **web app config** (apiKey, projectId, messagingSenderId, appId) and the **VAPID key** of the **same Firebase project** as the server's `FIREBASE_CREDENTIALS_FILE`.
- **None of this is exposed by the API.** Put it in `NEXT_PUBLIC_*` environment variables. A token from another project is rejected with `SENDER_ID_MISMATCH` and the device is auto-deactivated on the first send.
- The exact message is one per device, sent to the device token in batches of 500 with `send_each`:
  ```json
  { "token": "<registration_id>", "notification": { "title": "…", "body": "…", "image": "https://{SITE_DOMAIN}/media/notification/…" } }
  ```
  `image` is present only if the notification has one.
- The message has **no `data` block**: no id, type, link or related_object. It has **no `webpush`, `android` or `apns` config**: no `fcm_options.link`, click_action, badge, sound, priority or channel. It is never sent to a topic.
- Consequences for web:
  - In the background, the FCM SW shows the notification automatically (title, body, image).
  - With no `fcm_options.link`, clicking it does nothing by default. **Add your own `notificationclick` handler in the SW** that focuses or opens the account notifications page (for example `/account/notifications/`) and refetches page 1.
  - In the foreground, `onMessage` receives it but nothing is shown. Show an in-app toast and refresh the unread badge.
  - You cannot tell which inbox row a push corresponds to. Never auto-mark a row read and never match on title or text.
  - Ask for `Notification.requestPermission()` only after a user gesture, and only for logged-in users, since a token can only be registered with an access token.
- Delivery targets: only `active: true` devices whose owner has `send_notification = true`. That flag defaults to on; only an operator can change it, and the API cannot. Broadcasts go to all such devices; personal notifications go to that user's devices. Sending happens immediately when the operator clicks Send. There is no queue, schedule or retry. A notification counts as "sent" once at least one device accepted it, and cannot be re-sent after that.
- If Firebase is not configured on the server (`FIREBASE_CREDENTIALS_FILE` is empty), every API still behaves normally (POST /devices/ returns 201 or 200), but no push is ever delivered. `manage.py check --deploy` reports warning `firefly.W002`. The client cannot detect this.
- iOS image display needs a Notification Service Extension. This applies to a native app, not the web storefront.

### 4.5 Notification and device error codes (complete list for these four routes)
| code | HTTP | where | action |
|---|---|---|---|
| api_key_missing / api_key_invalid | 401 | all | config |
| not_authenticated | 401 | all | login (or call before clearing tokens during logout) |
| token_not_valid | 401 | all | refresh once and retry |
| user_inactive | 401 | all | account disabled: clear tokens, refresh will not help |
| user_not_found | 401 | all | clear tokens |
| bad_authorization_header | 401 | all | fix the `Bearer <token>` format |
| required | 400 | device register/unregister | registration_id / type missing |
| blank | 400 | device register/unregister | empty registration_id; wait for the SDK token |
| invalid_choice | 400 | device register | type ∉ ios/android/web |
| max_length | 400 | device register | name or device_id > 255 |
| parse_error | 400 | device register/unregister | broken JSON |
| unsupported_media_type | 415 | device register/unregister | send `application/json` |
| not_found | 404 | list (page) / read (not yours, missing or deleted) | page 1 / drop the row and refetch |
| method_not_allowed | 405 | all | check the method (unregister is DELETE, read is POST) |
| throttled | 429 | all | wait `data.retry_after` |

---

## 5. Master error-code index for this scope
| code | HTTP | type | endpoints |
|---|---|---|---|
| api_key_missing / api_key_invalid | 401 | client_error | all (production only; the key is cached for up to 60 s after it is disabled) |
| not_authenticated | 401 | client_error | reading list ×3, dashboard (except banners), notifications, devices |
| token_not_valid | 401 | client_error | same as above (ignored on public blog/FAQ routes) |
| user_inactive / user_not_found / bad_authorization_header | 401 | client_error | authenticated routes (documented for notifications and devices) |
| required / blank / max_length / invalid / invalid_choice / does_not_exist / incorrect_type | 400 | validation_error | comment submit, list filters, devices |
| dashboard_subject_type_unknown | 400 | **client_error** | my comments |
| parse_error | 400 | client_error | any JSON body |
| not_found | 404 | client_error | missing or draft post/category, page out of range, read or withdraw of something not yours, comments of a draft post |
| method_not_allowed | 405 | client_error | all |
| request_too_large | 413 | client_error | comment submit (body > 2.5 MiB) |
| unsupported_media_type | 415 | client_error | JSON-body endpoints |
| throttled | 429 | client_error | all (`data.retry_after`) |
| feature_disabled | 503 | **server_error** | 10 blog routes (`blog`), comment submit (`blog_comments`) |
| (non-routed path) | 404 | HTML in dev, JSON `not_found` in prod | e.g. a bad `subject_type` or a non-int id in a path |

---

## 6. Implementation checklist

**Networking layer**
- [ ] `X-API-Key` on every request (also `/devices/`). `Authorization: Bearer` only where needed, and never on a response that will be shared-cached.
- [ ] Read the body from `data`. Branch on `data.errors[0].code`. Show `detail`. Map `validation_error` entries to fields via `attr`.
- [ ] Short-circuit 204: no `.json()` (reading-list DELETE, my-comment DELETE).
- [ ] Tolerate a non-JSON 404 body in dev (DEBUG HTML page for unrouted paths).
- [ ] 401 handling: `token_not_valid` means refresh once and retry, `not_authenticated` means login, `user_inactive` / `user_not_found` mean clear the session, and `api_key_*` means a configuration error with no logout.
- [ ] 429: use `data.retry_after` (the header is not CORS-readable) and disable the action until then.
- [ ] 503 `feature_disabled`: separate it from the generic 5xx retry path. Show `detail`. Hide blog nav and comment forms using `/api/v1/global/feature-status/`.
- [ ] SSR uses the **public** API host and scheme, so absolute media URLs and `next` links are reachable by the browser. Configure `images.remotePatterns` for `/media/**` and `/static/**`. Allow the API host in CSP `img-src`. Add an `onError` fallback to the placeholder.
- [ ] Make sure the storefront origin is in the backend's CORS allow-list (only `SITE_DOMAIN` and localhost by default), or proxy `/api`.
- [ ] `trailingSlash: true`. Canonical = `STOREFRONT_URL + path`.
- [ ] Pagination: use `total_pages` for pagers. Follow `next` for "fetch all" (use `limit=100`). Treat `count === 0` as empty, not 404.

**Blog**
- [ ] Hide each home block when its array is empty. The featured layout must handle 1 to 4 cards. Show `final_price`, and show `price` struck through only when `has_discount`.
- [ ] Category page: fetch the category detail and `post/list/?category=` in parallel. If the detail is a 404, show a 404 page (an unknown slug would otherwise return every post). Check that the URL path equals `data.path`.
- [ ] Category menu: fetch all pages and build the tree from the pre-order flat list. Orphans whose parent is a draft become roots. Label `post_count` as "direct posts", or use the list's `count`.
- [ ] Post page: one API call per view (React memoization or `cache`). No hover prefetch of the post detail. Choose an ISR versus view-count policy.
- [ ] Render `content` unescaped (optionally sanitized). Route relative storefront links in the content with the router.
- [ ] TOC from `headings`: `encodeURIComponent(id)` in hrefs, `getElementById` for scrolling, `scroll-margin-top`, and expect duplicate or empty ids.
- [ ] Render the banner only when `banner !== null`. Never substitute `image`.
- [ ] Compute reading time on the client from the content text. The API does not provide it.
- [ ] Preview: `is_unpublished` means a preview bar, `noindex`, and no share links.
- [ ] SEO: `page_title`; skip `page_description` when it is `""`; keywords; canonical fallback; both JSON-LD blocks (array and object). Consider overriding the JSON-LD URLs/hosts (`SITE_DOMAIN` versus storefront).
- [ ] Comments: escape `review` and use `pre-wrap`. Badge «پاسخ رسمی» when `is_user_admin` and «شما» when `is_current_user`. Cap the indentation depth. Tab counts come from `comment_count` / `question_count`. Load each tab lazily with `comment_type`.
- [ ] Comment form: hidden empty `website` honeypot field. Hide name and email when logged in. Client-side limits 255/4096. After 201, show `msg` and clear the form, with no optimistic insert. Handle 429 and 503 (`blog_comments`). Guest submissions should not be proxied through one server IP.
- [ ] Reading list: send guests' bookmark clicks to login. Read the state from `data.is_in_reading_list`. DELETE returns 204. Re-read the dashboard summary after changes. Fill per-viewer flags on cached cards from the full reading list (`limit=100` loop).
- [ ] `robots.txt` points at the sitemap (proxied onto the storefront origin). Add `/`, `/blog/` and the FAQ page to a sitemap index yourself.

**FAQ**
- [ ] Fetch all pages with `limit=100`. Keep the server order. Skip or handle empty categories. Escape the question, render the answer as HTML with relative `/media` URLs absolutised to the API origin, and sanitize. Use `id="faq-{id}"` anchors and `<details>/<summary>`. Build FAQPage JSON-LD yourself. ISR around 10 minutes, and serve the stale copy on 429 or 5xx.

**Dashboard**
- [ ] Sidebar from one summary call. Tabs from `orders.groups` (all 5, zeros included). Print labels as they are. Branch on `key` and `status`. Re-read the summary after every counter-changing write. Hide rows whose feature switch is off. Never share-cache the summary.
- [ ] Home: summary + `purchased-product/list/?limit=4` + `banner/list/` in parallel. The page must work with no banners. Fall back from `mobile_image` (null) to `image`. Open `link` with the router or as an external link. Use `button_label`.
- [ ] Purchased products: the same card component as the product list, with `last_purchased_at` as an "آخرین خرید" label.
- [ ] My comments: key = `${subject_type}:${id}`. Repeat `subject_type` for multiple types. Print `status_display`. Product-only fields may be null. Link to `/product|/blog|/page/{slug}/`, and link `order_code` to the order page. Withdraw with DELETE using the same pair, expect 204, remove the row and re-read the summary. On a 404, refetch silently.
- [ ] The awaiting-review badge counts purchases (order × product pairs), not orders.

**Notifications and push**
- [ ] Build the inbox from `GET /notification/list/`, never from received pushes. Count the unread badge client-side. "Mark all read" is N POSTs. Mark read when the user opens an item. On a 404, drop the item.
- [ ] Web push: Firebase JS SDK + `firebase-messaging-sw.js` + a VAPID key from the server's Firebase project (environment variables). `POST /devices/ {registration_id, type:'web', name}` after login and on every load. Handle token refresh. Unregister (DELETE with a JSON body) when the user opts out. Send `registration_id` with logout.
- [ ] SW `notificationclick` opens the notifications page. Foreground `onMessage` shows a toast and refreshes the badge. No deep links: `related_object` is always null and `notification_type` is always `normal` (treat unknown types as normal).

---

## 7. Suspected backend bugs and inconsistencies (verified only)

1. **JSON-LD host does not match the sitemap and canonical host.** `blog/services/structured_data.py` builds every URL as `f'https://{settings.SITE_DOMAIN}'`, while the sitemap uses `STOREFRONT_URL`.
   - Live: post JSON-LD `@id` is `https://localhost/blog/best-phones-under-30m/`, while the sitemap `<loc>` is `http://localhost:3000/blog/best-phones-under-30m/`.
   - The JSON-LD image and logo URLs are also `https://{SITE_DOMAIN}/media/...`.
   - The scheme is hard-coded to https.
   - Either the page URLs point at the wrong host (when `SITE_DOMAIN` is the API host) or the images break unless the storefront proxies `/media` (when `SITE_DOMAIN` is the storefront host).
2. **`datePublished` in BlogPosting comes from `created` (the draft start), not `published_at`.** Live, `upcoming-campaign-preview` has `published_at` 2026-09-19 but `datePublished` "2026-09-13". The guide documents this, but it contradicts the API-21 fix that introduced `published_at`. The sitemap `lastmod` for that post (2026-09-13) is also earlier than its publication.
3. **`articleBody` is the raw post HTML** (tags included, media URLs relative and not absolutised). schema.org expects plain text. Also, `commentCount` counts top-level comments only while the `comment[]` array includes replies and questions, so the array can be longer than `commentCount` (live: commentCount 2, 3 entries). This is documented, but structured-data validators may flag it.
4. **Image URLs for missing source files:** the first response returns the placeholder, and later responses return dead `/media/CACHE/...` URLs. In dev (media sources absent), the first `GET /blog/category/list/` returned `/static/defaults/default.png` for every category image. The second call returned `http://localhost:8000/media/CACHE/images/categories/.../*.jpg`, which **404s** (verified with curl). The same happens for post thumbnails, while `banner` URLs (no thumbnail) 404 directly. This contradicts the "image is never broken; placeholder when missing" promise in `utils/images.py` and the guide. The frontend needs an `onError` fallback.
5. **OpenAPI: `DELETE /api/v1/devices/unregister/` has no `requestBody`** in `schema.yaml` (`requestBody: null`, and there is no `PushDeviceUnregisterRequest` component), although the endpoint requires a JSON body `{registration_id}`. Generated clients will not send it, so hand-write this call.
6. **Unrouted 404s are HTML in DEBUG.** For example `DELETE /dashboard/comment/review/1/delete/` and `POST /notification/abc/read/` return Django's HTML debug page in dev. The guides promise the JSON `not_found`, which only `handler404` delivers when `DEBUG=False`.
7. **CORS allow-list omits `STOREFRONT_URL`.** `CORS_ALLOWED_ORIGINS` contains only localhost:3000/8000, 127.0.0.1:3000/8000 and `http(s)://SITE_DOMAIN`. A preflight from `https://shop.example.com` gets no `Access-Control-Allow-Origin` (verified). There is no environment variable to extend it, although the settings say the storefront "is not necessarily served from this API's own domain". `Retry-After` is also not CORS-exposed.
8. **Blog category `post_count` ignores scheduling** (code-verified). `CategoryListView` counts `posts__page_display_status=PUBLISH` without the `schedule <= now` condition that `Post.objects.published()` (API-21) applies. Legacy rows with "publish + future schedule" are counted before they go live. There are no such rows in the fixtures, so the impact is low.
9. **View counter counts staff previews of "publish + future schedule" posts** (code-verified). `PostDetailView.retrieve` increments the counter when `page_display_status == PUBLISH`, even though `is_unpublished` is true for that post. The guide says previews never count. This also only affects legacy rows, so the impact is low.
10. **TOC numbering gap and empty ids** (code-verified in `blog/services/content.py`). Counters are incremented **before** the "empty text → skip" check, so an empty `<hN>` (for example one containing only an image) makes the numbering jump. A heading made only of punctuation gets `id=""`. Duplicate heading texts produce duplicate ids (documented).
11. **Guide inaccuracies (code-verified):**
    - The blog guide says the comment tree is "two-level" in one place and "unlimited depth" in another. The code (MPTT, any visible parent) allows unlimited depth.
    - The blog guide says the comment throttle is shared "with the product comment form". `CommentCreateViewMixin.throttle_scope='comment_submit'` is also used by **page** comments, so the budget is shared by three forms.
    - The blog guide says `Author.full_name` may be a whitespace-only string and that a signed-in commenter's name falls back to the username. The code (`User.get_display_name`) returns the full name or «کاربر», never whitespace and never the username.
    - The dashboard guide row 5 says "under `/api/v1/account/address/`". The real routes are `list/`, `create/`, `{id}/`, `{id}/update/`, `{id}/delete/` and `{id}/set-default/`.
12. **Blog `author` filter is typed `number`.** `?author=1.5` returns 200 with `count: 0` instead of 400 (only non-numeric input is rejected). This is minor.
13. **FAQ `answer` HTML is not absolutised**, unlike blog and product rich text, and is not sanitized. This is documented, but it is an inconsistency every client has to work around.
14. **Route shadowing.** API: a post or blog category whose slug is `list` can never be fetched (`post/list/` and `category/list/` are matched first). Storefront: a post with slug `category` collides with `/blog/category/...`. This is an edge case, and slugs are not reserved by the panel as far as I could see.

Things I checked that are **not** bugs:
- Schema nullability is correct for `author`, `badge` and `brand` (`allOf` + `nullable: true`).
- Viewer flags on server-cached responses are resolved per viewer (verified with sara's token on the post list).
- The reading-list and device idempotency, the honeypot, all comment-submit validation codes and the dashboard filter errors behave exactly as documented.
