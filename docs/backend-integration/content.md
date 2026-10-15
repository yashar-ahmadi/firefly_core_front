# Firefly Core — Content API digest (storefront integration)

Scope: `content-api.txt` (all 5,806 lines read) + `panel-pages-home.txt` (operator side), cross-checked against
the live dev server (`http://localhost:8000`, API-key gate off) and `schema.yaml`. Covers 11 endpoints:

| # | Method | Path | Purpose | Auth |
|---|--------|------|---------|------|
| 1 | GET  | `/api/v1/pages/list/` | published pages, ordered by title, `?search=` | X-API-Key; Bearer optional (no effect) |
| 2 | GET  | `/api/v1/pages/{slug}/` | one page (content, layout, SEO, meta tags, comment counts) | X-API-Key; staff Bearer => draft preview |
| 3 | GET  | `/api/v1/pages/{slug}/comment/list/` | approved comment tree of a page | X-API-Key; Bearer => `is_current_user` |
| 4 | POST | `/api/v1/pages/{slug}/comment/submit/` | submit comment / question / reply (goes to moderation) | X-API-Key; Bearer => name/email from account, per-account quota |
| 5 | GET  | `/api/v1/menu/{key}/` | one menu as a tree (already filtered) | X-API-Key |
| 6 | GET  | `/api/v1/homepage/` | homepage SEO + ordered, typed sections with pre-resolved content | X-API-Key; Bearer => wishlist/reading-list flags (DON'T send on cached fetch) |
| 7 | GET  | `/api/v1/search/` | full search: 5 groups (products, product_categories, brands, blog_posts, pages); every call is logged | X-API-Key; Bearer => staff not logged, wishlist/reading-list flags |
| 8 | GET  | `/api/v1/search/suggest/` | type-ahead: <=5 products, <=3 categories, <=3 brands; not logged; own throttle | X-API-Key |
| 9 | GET  | `/api/v1/linker/` | "link in bio" page (name, bio, logo, theme palette, layout flags, links, socials) | X-API-Key |
| 10 | GET | `/api/v1/contact-us/subject/list/` | contact-form subjects, operator order | X-API-Key |
| 11 | POST | `/api/v1/contact-us/message/submit/` | contact-form message (to panel inbox) | X-API-Key; Bearer => account noted + per-account quota |

Read endpoints accept GET/HEAD/OPTIONS; the two POSTs accept POST/OPTIONS only (else 405 `method_not_allowed`).
Swagger tags: Pages, Menu, Home Page, Search, Linker, Contact Us (`/api/v1/schema/swagger-ui/`).

---------------------------------------------------------------------------------------------------------

## 0. TL;DR — the things that will bite you

1. **All calls server-side only.** `FIREFLY_API_URL` / `FIREFLY_API_KEY` without `NEXT_PUBLIC_`; `lib/firefly.ts` starts with
   `import 'server-only'`. Browser forms (comment, contact) and the search box hit **storefront route handlers**
   (`/api/page-comments/{slug}/`, `/api/contact/`, `/api/search-suggest/`) which add the key.
2. **`FIREFLY_API_URL` must be the PUBLIC https API origin.** Media URLs (menu icons, rich-text `<img>`, slides, linker
   logos, cards) are made absolute on *whatever host the request arrived at* — calling `http://backend:8000` internally
   leaks that host into HTML. (Dev server returns `http://localhost:8000/media/...`.)
3. **`trailingSlash: true`** in `next.config`. Every storefront URL the API emits ends with `/`. API URLs too: a slashless
   API URL gets a **301** to the slashed one (verified: `GET /api/v1/menu/main` → 301) — fatal for POST bodies.
4. **Homepage sections have NO layout/columns/autoplay/background/device-visibility options.** Verified in panel guide
   and `homepage/models.py`. Only: type, title, subtitle, see-all link (url+title), order, active, start/end window,
   source (+category/brand/list), item_limit (1–24, default 10). Items (slides/banners): image, mobile_image, alt,
   title, description, text_color, link url+title, order, active. Everything visual is storefront design.
5. **Every homepage section has all 11 keys; content keys not used by the type are `null`.** Switch on `type`; unknown
   type → render nothing + log (forward compat). Absent sections are already filtered server-side (inactive, out of
   window, empty, blog off, deleted source) — never render skeletons/"empty" states for them.
6. **Product-carousel "see all"** = operator `link` if set, else `/product/list/?${new URLSearchParams(listing_query)}`
   (pass `listing_query` **unchanged**, incl. `in_stock=true`, `special_first=false`, `sort`). Manual carousel →
   `listing_query: null` → no auto link. Requires a storefront page **`/product/list/` (no slug)** that forwards
   query params verbatim to `GET /api/v1/product/list/`; serve it `noindex, follow` (or canonical to the topic page).
7. **Category links: build from `path`, never `slug`.** `/product-category/{path}/` where `path` = `digital/mobile-phone`.
   `MenuTarget.slug` for categories is only the last segment.
8. **Menus are pre-filtered** (inactive, broken, drafts, blog-off, empty groups). Don't re-filter. `url === null` ⇔
   group heading (`link_type: 'none'`). Unknown/disabled menu → 404 `menu_not_found` → render nothing; menu fetch must
   **never throw** (it lives in the root layout).
9. **Search**: call `/search/` only on submit, `cache: 'no-store'` (each call is logged in the operator's search
   report). Suggest: 250 ms debounce, ≥2 chars, abort in-flight, `revalidate: 60` in the route handler, any failure
   = "no suggestions". Show `data.query` (normalized) not the raw input. No highlight markup is returned.
10. **Throttles are per-IP for guests and the storefront server is ONE IP** → comment (10/h), contact (10/h), suggest
   (1800/h) and the global anon limit (2000/h) become store-wide unless backend trusts `X-Forwarded-For` from the
   storefront host (nginx `real_ip`) and the storefront forwards the edge-written `X-Real-IP` as `X-Forwarded-For`.
11. **Never cache responses fetched with a user token** (staff draft preview, wishlist hearts, reading-list badges).
   Fetch the shared homepage without `Authorization`; hydrate hearts/badges per-viewer from wishlist / reading list.
12. Forms: honeypot field `website` must be a real off-screen text input, forwarded **untouched**; never send empty
   optional strings (`"email": ""` → 400 `blank` on comments); 201 returns only `msg` with `data: {}` — show `msg`,
   never optimistic-insert.

---------------------------------------------------------------------------------------------------------

## 1. Cross-cutting conventions

### 1.1 Headers
```
X-API-Key: <project key>                 # all 11 endpoints; missing → 401 api_key_missing, bad/disabled → 401 api_key_invalid
Content-Type: application/json           # the 2 POSTs only; anything else → 415 unsupported_media_type
Authorization: Bearer <access-token>     # optional, changes 7 behaviours (below)
X-Forwarded-For: <visitor ip>            # optional; only honoured if backend trusts the storefront host (TRUSTED_PROXY_IPS / nginx real_ip)
```
`Authorization` effects: (1) staff can preview draft pages; (2) comment author name/email taken from account (body
name/email ignored); staff comments still go to moderation with `is_user_admin:false`; (3) `is_current_user` on
comments; (4) staff/superuser searches are not counted in search report; (5) `is_in_wishlist` on product cards in
homepage + search; (6) `is_in_reading_list` on post cards in homepage + search; (7) contact message linked to account
and quota per account. Comment-submit quota is also per account when a token is sent.

**Verified:** an invalid/garbage Bearer token on public endpoints (homepage, menu, page, search, suggest) does **not**
401 — request is treated as guest (200). Safe to forward whatever token the visitor has.

### 1.2 Envelope
```ts
type Envelope<T> = { msg: string; code: number; data: T };
type ErrorData = {
  type: 'validation_error' | 'client_error';      // validation_error → attr = field/param name; client_error → attr null
  errors: { code: ErrorCode; detail: string; attr: string | null }[];   // detail is Persian, user-facing
  retry_after?: number;                            // only on 429 (seconds); also `Retry-After` header
};
```
- Branch on `data.errors[i].code`, never on text. `msg` is a generic per-status sentence; only the two POST 201s carry a
  meaningful `msg` ("نظر شما با موفقیت ثبت شد و پس از تأیید نمایش داده می شود." / "پیام شما ثبت شد و به‌زودی بررسی می‌شود.").
- **Multiple errors can come back at once** (verified: contact submit `{}` → two `required` errors, `name` and `message`).
  Map every entry to its field; don't only read `[0]`.

### 1.3 Pagination (pages/list, comment/list, contact subject/list)
```ts
type Paginated<T> = {
  count: number; total_pages: number;      // total_pages is 1 (not 0) for an empty list
  current_page: number; page_size: number; // page_size = limit actually applied
  next: string | null; previous: string | null;   // FULL API URLs — never hand to browser; keep page number yourself
  results: T[];
};
```
- `page` from 1; beyond last / `0` / non-numeric → 404 `not_found` "صفحه نامعتبر" (verified `page=abc`, `page=0`).
- `limit` default 20, max 100; `limit=500` silently → 100 (verified); `limit=0` / negative silently → 20 (verified).

### 1.4 Caching (backend sends NO Cache-Control/ETag; all caching is storefront-side)
| Endpoint | Storefront cache |
|---|---|
| `menu/{key}/` | `revalidate: 300` |
| `homepage/` | `revalidate: 60` (section windows open/close by the minute; stock changes) |
| `pages/list/` | 300 |
| `pages/{slug}/` | 300; **staff preview: never** (`no-store`, dynamic render) |
| `comment/list/` | ~60 |
| `comment/submit/` | never |
| `search/` | **never** (`cache: 'no-store'`) — each call logged |
| `search/suggest/` | `revalidate: 60` (keyed per visitor via XFF header); 429 never cached |
| `linker/` | 300 |
| `contact-us/subject/list/` | 300 + tag `contact-subjects` (bust on stale-subject errors) |
| `message/submit/` | never |

Wrap `getPage`, `getHomePage`, `getLinkerPage` in React `cache()` so `generateMetadata` + page = 1 request.
Homepage and `/links/` are statically prerendered with `revalidate` → **API must be reachable at `next build`**
(else build fails "Error occurred prerendering page "/""), or use `export const dynamic = 'force-dynamic'` (fetch-level
`next: { revalidate }` still caches).

### 1.5 Slugs & encoding
- Page/product/post slugs may be Persian; URLs are emitted unencoded-readable (`/page/شرایط-ارسال/`). Next.js may hand
  `params.slug` still percent-encoded in `page.tsx` but decoded in route handlers → normalise with
  `encodeURIComponent(decodeURIComponent(slug))` (wrap in try/catch → `null` → 404).
- Malformed percent-encoding (`/page/abc%ZZ/`) makes Next 16.3 itself 500 before your code → add `proxy.ts`
  (`middleware.ts` pre-16) that `decodeURIComponent(pathname)` in try/catch and returns 404.
- Menu `key` must match Django `<slug:key>` (`[-a-zA-Z0-9_]+`); non-slug keys never reach the view → generic 404
  `not_found` (in DEBUG dev it is Django's HTML debug page, verified; prod returns JSON via `handler404`).
- Keys are case-sensitive: `/menu/MAIN/` → `menu_not_found` (verified).

### 1.6 Rich text (page `content`, homepage `rich_text.content`)
- Trusted HTML (staff-only authoring) → render unescaped (`dangerouslySetInnerHTML`).
- Every `src|href|poster|data-src|srcset` under `/media/` or `/static/` is rewritten to absolute **API host** URLs.
- Storefront links (`/page/terms/`, `/product/x/`) are left **as written** (root-relative storefront paths); full
  `https://` and protocol-relative `//` untouched. No rewriting needed on the storefront.
- Can be `null` for pages. Dev data has bare text nodes after `<h2>` (no `<p>` wrapper) — style `.rich-content` to cope.
- Optional: intercept clicks on root-relative `<a>` to use client-side routing.
- If using `next/image` for any API image: add the API host to `images.remotePatterns`.

### 1.7 Dates / enums
ISO-8601 with offset (`+03:30`). Enums are named strings, never numbers. Prices are integer **Toman**.

---------------------------------------------------------------------------------------------------------

## 2. TypeScript types (verified against live responses + OpenAPI)

```ts
// ---------- shared ----------
export type MetaTag = { field: string; value: string };           // field may repeat (two og:image), keep order

// ---------- pages ----------
export type PageLayout = 'default' | 'full_width' | 'with_sidebar';  // treat unknown as 'default'
export interface PageCard {                     // pages/list results + search `pages.items`
  id: number;
  title: string;
  slug: string;                                 // never "list" (reserved in panel)
  url: string;                                  // "/page/{slug}/" storefront path
  description: string | null;
}
export interface PageDetail extends PageCard {
  layout: PageLayout;
  content: string | null;                       // trusted HTML
  enable_comments: boolean;                     // form open?
  comment_count: number;                        // approved, not withdrawn, TOP-LEVEL, type=comment
  question_count: number;                       // same, type=question
  page_title: string;                           // never empty (falls back to title)
  page_description: string;                     // SEO desc → description → "" (omit tag when "")
  page_keywords: string;                        // "" when unset (omit tag)
  canonical_link: string | null;                // absolute URL; null → use own url on storefront host
  meta_tags: MetaTag[];
  is_unpublished: boolean;                      // true only in staff preview of a draft
  created: string; updated: string;
}

// ---------- page comments ----------
export type CommentType = 'comment' | 'question';
export interface PageComment {
  id: number;                                   // use as `parent` when replying
  name: string;
  review: string;                               // PLAIN TEXT (visitor-written) → escape, white-space: pre-wrap
  comment_type: CommentType;                    // replies inherit parent's type
  is_user_admin: boolean;                       // official reply written in admin panel → badge "پاسخ فروشگاه"
  is_current_user: boolean;                     // false for guests
  parent_id: number | null;
  replies: PageComment[];                       // unbounded depth (server does not limit)
  created: string;
}
export interface PageCommentSubmit {
  review: string;                               // required, 1..4096
  name?: string;                                // required for guests, <=255; ignored when signed in
  email?: string | null;                        // guest only; valid email or null/omitted — NEVER ""
  comment_type?: CommentType;                   // default 'comment'; ignored for replies
  parent?: number | null;                       // approved comment id OF THIS PAGE
  website?: string;                             // honeypot; forward untouched
}
// 201 → { msg: string; code: 201; data: {} }

// ---------- menus ----------
export type MenuLinkType =
  | 'none' | 'url' | 'page' | 'product' | 'product_category' | 'brand' | 'product_list' | 'blog_post' | 'blog_category';
export type MenuTargetType = Exclude<MenuLinkType, 'none' | 'url'>;
export interface MenuTarget<T extends MenuTargetType = MenuTargetType> {
  type: T;                                      // always equals the node's link_type
  id: number;                                   // id of the target row in ITS table (not the menu item id)
  slug: string;                                 // current slug; for categories ONLY the last path segment
}
interface MenuNodeBase {
  id: number;                                   // menu item id (React key)
  title: string;                                // <=100 chars, operator label (need not equal target name)
  open_in_new_tab: boolean;
  icon: string | null;                          // absolute API-host URL (image or SVG); render with <img>, alt=""
  children: MenuNode[];                         // unbounded depth (MPTT tree); [] for leaves
}
export type MenuNode =
  | (MenuNodeBase & { link_type: 'none';             url: null;   target: null })   // group heading
  | (MenuNodeBase & { link_type: 'url';              url: string; target: null })   // "/..." path (may have ?query) or http(s) URL
  | (MenuNodeBase & { link_type: 'page';             url: string; target: MenuTarget<'page'> })             // /page/{slug}/
  | (MenuNodeBase & { link_type: 'product';          url: string; target: MenuTarget<'product'> })          // /product/{slug}/
  | (MenuNodeBase & { link_type: 'product_category'; url: string; target: MenuTarget<'product_category'> }) // /product-category/{path}/
  | (MenuNodeBase & { link_type: 'brand';            url: string; target: MenuTarget<'brand'> })            // /brand/{slug}/
  | (MenuNodeBase & { link_type: 'product_list';     url: string; target: MenuTarget<'product_list'> })     // /product/list/{slug}/
  | (MenuNodeBase & { link_type: 'blog_post';        url: string; target: MenuTarget<'blog_post'> })        // /blog/{slug}/
  | (MenuNodeBase & { link_type: 'blog_category';    url: string; target: MenuTarget<'blog_category'> });   // /blog/category/{path}/
export interface Menu { key: string; title: string; items: MenuNode[] }

// ---------- cards reused from product/blog guides (full shapes per OpenAPI) ----------
export interface ProductCard {
  id: number; name: string; slug: string;       // link: /product/{slug}/
  extra_detail: string | null;
  image: string;                                // absolute; placeholder /static/defaults/default.png if none
  type: 'simple' | 'variable' | 'downloadable' | 'virtual';
  badge: { id: number; name: string; badge_color: string; text_color: string } | null;
  brand: { id: number; name: string; slug: string; image: string } | null;
  categories: { id: number; name: string; slug: string; parent_id: number | null }[];
  in_stock: boolean;
  is_special_product: boolean; is_collection: boolean; enable_major: boolean;
  rating: number; rating_count: number;
  default_variant_id: number | null;
  default_variant_attributes: { attribute_name: string; name: string }[];
  price: number | null; final_price: number | null;        // integer Toman
  has_discount: boolean; discount_percent: number;
  discount_end_time: string | null; discount_time_remaining: number | null;
  order_limit_min: number | null; order_limit_max: number | null;   // 0 = unlimited (per product guide)
  is_in_wishlist: boolean;                      // false without customer token
  created: string; updated: string;
}
export type CategorySorting = 'date-desc' | 'date-asc' | 'price-desc' | 'price-asc' | 'sale';
export interface CategoryCard {
  id: number; name: string; slug: string;
  path: string;                                 // "digital/mobile-phone" → /product-category/{path}/
  parent_id: number | null;
  short_description: string | null;
  image: string; icon: string;                  // absolute; placeholder, never null
  show_in_homepage: boolean;
  default_sorting: CategorySorting | '' | null;
  product_count: number;                        // DIRECT published products only (parents often 0!)
  created: string; updated: string;
}
export interface BrandCard {                    // search brands.items (product/brand/list card)
  id: number; name: string; slug: string;       // link: /brand/{slug}/
  image: string; product_count: number; created: string; updated: string;
}
export interface PostCard {
  id: number; name: string; slug: string;       // link: /blog/{slug}/
  description: string | null;
  image: string;
  author: { full_name: string; avatar: string | null } | null;
  categories: { id: number; name: string; slug: string; parent_id: number | null }[];
  comment_count: number; question_count: number; view_count: number;
  is_in_reading_list: boolean;                  // false without customer token
  published_at: string | null; created: string; updated: string;
}

// ---------- homepage ----------
export interface HomeLink { url: string; title: string }   // url: "/..." (may have query) or http(s); title may be ""
export interface HomeItem {                     // a slide or a banner
  id: number;
  title: string;                                // "" = none
  description: string;                          // "" = none
  image: string;                                // absolute
  mobile_image: string | null;                  // null → use image on all sizes
  text_color: string;                           // CSS hex like "#FFFFFF" for title+description only; "" = store default
  alt: string;                                  // may be ""
  link: HomeLink | null;                        // null → not clickable
}
interface SectionHead { id: number; title: string; subtitle: string; link: HomeLink | null }
type NoContent = { items: null; products: null; listing_query: null; categories: null; posts: null; content: null };
export type HomeSection =
  | (SectionHead & Omit<NoContent, 'items'> & { type: 'slider'; items: HomeItem[] })
  | (SectionHead & Omit<NoContent, 'items'> & { type: 'banner_group'; items: HomeItem[] })
  | (SectionHead & Omit<NoContent, 'products' | 'listing_query'> & {
      type: 'product_carousel'; products: ProductCard[]; listing_query: Record<string, string> | null })
  | (SectionHead & Omit<NoContent, 'categories'> & { type: 'category_grid'; categories: CategoryCard[] })
  | (SectionHead & Omit<NoContent, 'posts'> & { type: 'post_carousel'; posts: PostCard[] })
  | (SectionHead & Omit<NoContent, 'content'> & { type: 'rich_text'; content: string });   // never null for this type
export interface HomePage {
  page_title: string;                           // SEO title → store name (site settings) → "" only on never-saved install
  page_description: string;                     // SEO desc → store slogan → ""
  page_keywords: string;                        // "" when unset (no global fallback)
  canonical_link: string | null;
  meta_tags: MetaTag[];
  sections: HomeSection[];                      // may be []
}

// ---------- search ----------
export interface SearchGroup<T> {
  count: number;                                // == count of the group's list endpoint called with listing_query
  items: T[];                                   // top-N re-ranked; today caps 12/6/6/6/4 — don't hard-code
  listing_query: Record<string, string> | null; // null ONLY for blog_posts when blog is disabled
}
export interface SearchResults {
  query: string;                                // normalized term actually searched/logged — show THIS
  total: number;                                // sum of the 5 counts (blog excluded when blog off)
  products: SearchGroup<ProductCard>;           // listing_query always has special_first: "false"
  product_categories: SearchGroup<CategoryCard>;
  brands: SearchGroup<BrandCard>;
  blog_posts: SearchGroup<PostCard>;
  pages: SearchGroup<PageCard>;
}
export interface SearchSuggestion { id: number; name: string; url: string; image: string }   // url = ready storefront path
export interface SearchSuggestions {
  query: string;
  products: SearchSuggestion[];                 // <=5
  product_categories: SearchSuggestion[];       // <=3
  brands: SearchSuggestion[];                   // <=3
}

// ---------- linker ----------
export type LinkerThemeKey =
  'black' | 'blue' | 'cotinga' | 'cyan' | 'flamingo' | 'goldfinch' | 'legacy' | 'parrot' | 'tanger';
export interface LinkerTheme {
  key: LinkerThemeKey;                          // informational only ('legacy' for removed themes) — don't branch on it
  background: string;                           // any CSS `background` value: "#ffffff" or "linear-gradient(...)"
  text_color: string;
  button_background: string;                    // may be "transparent"
  button_text_color: string;
  button_border: string;                        // may be "transparent"
}
interface LinkerLinkBase { id: number; title: string; value: string; thumbnail: string | null }
export type LinkerLink =
  | (LinkerLinkBase & { link_type: 'button'; href: string })   // value: "/path" or http(s); href absolute (path joined to STOREFRONT_URL)
  | (LinkerLinkBase & { link_type: 'video';  href: string })   // same as button; embed aparat/youtube
  | (LinkerLinkBase & { link_type: 'email';  href: string })   // "mailto:..."
  | (LinkerLinkBase & { link_type: 'phone';  href: string })   // "tel:+98..." (E.164) ; value = as typed
  | (LinkerLinkBase & { link_type: 'text';   href: null });    // value = plain text body
export type SocialPlatform =
  | 'instagram' | 'twitter' | 'tiktok' | 'snapchat' | 'medium' | 'youtube' | 'reddit' | 'linkedin' | 'pinterest'
  | 'dribbble' | 'facebook' | 'vimeo' | 'twitch' | 'spotify' | 'soundcloud' | 'github' | 'discord' | 'tumblr' | 'vk'
  | 'whatsapp' | 'telegram' | 'patreon' | 'apple-music' | 'play-store' | 'app-store' | 'amazon';   // 26
export interface LinkerSocialLink {
  id: number; platform: SocialPlatform;
  url: string;                                  // absolute (store path joined to STOREFRONT_URL)
  icon: string;                                 // absolute monochrome BLACK SVG on API host (schema says nullable; never null)
}
export interface LinkerPage {
  name: string;                                 // "" → page never saved → notFound()
  bio: string;                                  // <=500, "" = none
  logo: string | null;
  avatar_letter: string | null;                 // first char of name; null only if name ""
  theme: LinkerTheme;
  social_links_position: 'top' | 'bottom';      // invalid stored values coerced to defaults server-side
  thumbnail_position: 'right' | 'left';         // physical side on screen (RTL!)
  show_footer: boolean;
  rounded_edges: boolean;
  links: LinkerLink[];                          // operator order, pre-filtered
  social_links: LinkerSocialLink[];             // operator order, same platform may repeat
}

// ---------- contact ----------
export interface ContactSubject { id: number; title: string }
export interface ContactMessageSubmit {
  subject?: number | null;                      // required iff subject list non-empty; omit/null when empty
  name: string;                                 // required, <=100, newlines/space runs collapsed to one space
  email?: string | null;                        // <=254; "" and null = not given
  phone?: string | null;                        // Iranian MOBILE only (09xx / +989xx, Latin or Persian digits); "" / null = not given
  message: string;                              // 10..5000 after stripping control/bidi chars
  website?: string;                             // honeypot
}
// at least one of email / phone is required

// ---------- errors ----------
export type ErrorCode =
  | 'api_key_missing' | 'api_key_invalid' | 'not_found' | 'menu_not_found' | 'page_comments_disabled'
  | 'contact_subject_required' | 'contact_subject_unavailable' | 'contact_channel_required' | 'invalid_iranian_mobile'
  | 'required' | 'blank' | 'null' | 'max_length' | 'min_length' | 'null_characters_not_allowed' | 'invalid'
  | 'invalid_choice' | 'incorrect_type' | 'does_not_exist' | 'parse_error' | 'request_too_large'
  | 'method_not_allowed' | 'unsupported_media_type' | 'throttled';
```

---------------------------------------------------------------------------------------------------------

## 3. Pages

### 3.1 `GET /api/v1/pages/list/`
- Query: `search` (title only), `page`, `limit` (default 20, max 100). Ordered by **title** (Persian collation; verified
  live: تماس, حریم, درباره, رویه, قوانین). Drafts never listed — not even for staff.
- Search semantics: split into words; **every** word must occur somewhere in the title, any order; ZWNJ = space;
  Arabic ي/ك → ی/ک (verified `قوانين` finds «قوانین و مقررات»); Persian/Arabic/Latin digits unified on both sides;
  duplicate words counted once; only first **8 distinct words** used; empty `search=` = no filter; no match →
  `count: 0, results: []` (not an error).
- Errors: 404 `not_found` (bad page).
- Use: footer/sidebar list, "all pages" page, `with_sidebar` layout aside, `/search/pages/?search=` (search see-all).

### 3.2 `GET /api/v1/pages/{slug}/`
- Path `slug` (percent-encode Persian). 404 `not_found` if missing or draft (unless staff token).
- Draft preview: staff/superuser `Authorization` → draft returned with `is_unpublished: true`. Fetch with
  `cache: 'no-store'`, dynamic render, banner "پیش‌نویس — منتشر نشده", `robots: { index: false }`, keep behind staff login.
  Preview applies to the page only: comment list/submit of a draft are 404 even for staff.
- Real example (dev): `about-us` → `layout: "default"`, `description: null`, `enable_comments: true`, `comment_count: 1`,
  `page_description: ""`, `page_keywords: ""`, `canonical_link: null`, `meta_tags: []`.

**Layout** (operator picks one of three; it is a request, not HTML):
| value | panel label | storefront |
|---|---|---|
| `default` | پیش‌فرض | single readable-width text column (default for new pages) |
| `full_width` | تمام‌عرض | edge-to-edge (wide images/tables) |
| `with_sidebar` | با ستون کناری | text + aside; aside content is storefront's choice (guide: list of other pages from `pages/list/?limit=100`, excluding current) |
| anything else | — | render as `default` |

**SEO mapping** (`generateMetadata`):
| field | where | when unset |
|---|---|---|
| `page_title` | `<title>` | page title (never empty) |
| `page_description` | `meta description` | `description`, else `""` → omit key |
| `page_keywords` | `meta keywords` | `""` → omit key |
| `canonical_link` | `link rel=canonical` | `null` → `page.url` resolved on `metadataBase` (set `metadataBase` to storefront origin in root layout) |
| `meta_tags[]` | one `<meta>` per row | `[]`; order preserved; duplicates allowed |

- **Never set a Metadata key to `undefined`** — it wipes the layout default (verified by guide). Only assign when non-empty.
- Next `metadata.other` always renders `<meta name=…>`; Open Graph needs `property`. Split rows: prefixes
  `og: article: product: profile: book: fb:` → render `<meta property>` inside the component (React 19 hoists to `<head>`,
  present in initial HTML incl. for Googlebot); others via `metadata.other` (`Record<string,string[]>` keeps duplicates).
- Root layout: `metadataBase: new URL(STOREFRONT_ORIGIN)`, a default string `title`.

**Comments block on the page**: render if `enable_comments || comment_count + question_count > 0`. Form only when
`enable_comments`. Tab counters = `comment_count` / `question_count` (top-level only). Old approved comments stay visible
after the operator closes the form (dev: `about-us` historically; guide example).

**Contact form under `/page/contact-us/`** (optional): when `page.slug === 'contact-us'`, also fetch subjects and render
`<ContactForm>` below the content (alternative to a dedicated `/contact/` route).

**Panel facts** (`panel-pages-home` §2): fields title (≤200), layout, enable_comments (default off), description,
content (WYSIWYG with images), slug (auto from title, unique, **`list` reserved** — panel refuses it), status
(draft default / published), SEO title/description/keywords/canonical, meta tags tab (field/value rows). Pages are NOT
auto-added to menus (operator adds a menu item). Changing a published slug breaks old URLs (menus follow automatically;
redirects are a separate panel feature). Deleting a page deletes its comments; menu items pointing to it become
"broken" and vanish from the API.

---------------------------------------------------------------------------------------------------------

## 4. Page comments

### 4.1 `GET /api/v1/pages/{slug}/comment/list/`
- Query: `comment_type` (`comment|question`, applied to top level; replies follow), `page`, `limit`.
- Returns approved, non-withdrawn comments of a **published** page as a tree: top level **newest first**, `replies`
  nested to any depth (verified: admin reply nested under customer comment, `is_user_admin: true`).
- `count` / pagination are over **top-level** only (count 3 can mean 5 bubbles). Use page detail counts for tabs.
- Pending/rejected/withdrawn never returned. A reply under a rejected comment is not visible.
- Works when form is closed. Errors: 400 `invalid_choice` (attr `comment_type`; verified), 404 `not_found` (missing/draft
  page even with staff token, or bad page number).
- Render: `review` is plain text → JSX-escaped, `white-space: pre-wrap`; `is_user_admin` → "پاسخ فروشگاه" badge (only
  replies written in the admin panel; staff posting on the site get `false`); `is_current_user` → "شما". Depth is
  unlimited → cap visual indentation at ~2 levels. Author email/account id never exposed.

### 4.2 `POST /api/v1/pages/{slug}/comment/submit/`
Body: see `PageCommentSubmit`. Success **201** `{ msg, data: {} }` — the comment is pending moderation; do not add it to
the list; show `msg`, reset/close form.

**Check order** (verified pieces live):
1. key; quota exhausted → **429 before anything else**.
2. page missing/draft → 404 `not_found`.
3. form closed → **403 `page_comments_disabled`** — evaluated **before body parsing** (empty/invalid body/honeypot all get 403; verified with `{}` on `return-policy`).
4. body validation → 400 with `attr`.
5. honeypot `website` non-empty → **201 but nothing stored** (verified), no quota used.
6. identity/reply rules: guest without name → 400 `invalid` attr `name`; parent of another page → 400 `invalid` attr `parent`.
   Else stored as pending → 201.

**Identity**: guest must send `name` (email optional). Signed-in customer/staff: name & email from account, body values
ignored → hide name/email inputs when signed in. Staff comments are ordinary pending comments.

**Errors (all verified in guide; ones marked ✓ re-verified live):**
| status | code | attr | cause |
|---|---|---|---|
| 400 | `required` ✓ | review | missing review |
| 400 | `blank` | review | empty review |
| 400 | `max_length` | review / name | >4096 / >255 |
| 400 | `invalid` ✓ | name | guest without name ("وارد کردن نام برای کاربران مهمان الزامی است.") |
| 400 | `invalid` | email | bad email |
| 400 | `blank` ✓ | email | `"email": ""` — omit or send null instead |
| 400 | `null` | review/name/comment_type | explicit null |
| 400 | `invalid_choice` | comment_type | not comment/question |
| 400 | `does_not_exist` ✓ | parent | unknown or not-yet-approved parent ("موردی با شناسهٔ «99999» یافت نشد.") |
| 400 | `incorrect_type` | parent | non-integer |
| 400 | `invalid` ✓ | parent | parent belongs to another page ("نظر والد متعلق به این صفحه نیست.") |
| 400 | `parse_error` ✓ | null | invalid JSON / body `null` ("بدنهٔ درخواست خالی است.") |
| 403 | `page_comments_disabled` ✓ | null | form closed → hide form, show detail |
| 404 | `not_found` ✓ | null | page missing/draft |
| 405 | `method_not_allowed` ✓ | null | GET etc. |
| 413 | `request_too_large` | null | > DATA_UPLOAD_MAX_MEMORY_SIZE (2.5 MB) |
| 415 | `unsupported_media_type` ✓ | null | not application/json |
| 429 | `throttled` | null | 10 successful submits/hour |

**Throttle**: `THROTTLE_COMMENT_SUBMIT` default **10/hour**, **shared with blog and product comment forms** (one quota),
only successful (queued) submits count (400/403/404/honeypot don't). Guest = per IP (store server IP unless XFF trusted),
signed in = per account. 429 → disable submit for `data.retry_after` s (also `Retry-After`), show `detail`.

**Honeypot rules** (comment + contact): `<input name="website" type="text">` inside an `aria-hidden` wrapper positioned
off-screen (`position:absolute; left:-10000px; width:1px; height:1px; overflow:hidden`), `tabIndex={-1}`,
`autoComplete="off"`; NOT `type=hidden` / `display:none`. Route handler forwards body verbatim (stripping it disables
the trap).

**Payload builder**: omit empty optional fields (`name`, `email`, `comment_type`, `parent` → `undefined`), always send
`website` as typed (even ""). Reply = same form rendered under a comment with `parent={comment.id}`; reply button only
under listed comments (all approved).

**Route handler** `app/api/page-comments/[slug]/route.ts` (POST): `refuseForeignForm` (403 if `Origin` host ≠ `Host`,
415 if not JSON) → `slugPath` (null → 404) → `fireflyFetch(.../comment/submit/, { method:'POST',
headers: forwardedHeaders(req.headers), body: await req.text(), cache:'no-store' })` → relay status, body,
`Retry-After`. Proxy in front of Next must pass `Host` untouched (`proxy_set_header Host $host`) else every form 403s.

---------------------------------------------------------------------------------------------------------

## 5. Menus — `GET /api/v1/menu/{key}/`

### 5.1 Keys
Four menus exist from install (empty until the operator fills them); verified live, all 200:

| key | panel title | conventional placement | dev content |
|---|---|---|---|
| `main` | منوی اصلی | primary nav / mega-menu of categories | group «کالای دیجیتال» (none) → [category «گوشی موبایل», product_list «گوشی‌های پرچمدار»], brand «سامسونگ», product «گلکسی S25 اولترا» |
| `header` | هدر | short links at the top of every page | url «تخفیف‌ها» → `/product/list/?has_discount=true` |
| `footer` | فوتر | footer link columns | page «قوانین و مقررات» `/page/terms/`, page «حریم خصوصی» `/page/privacy/` |
| `blog-sidebar` | ستون کناری بلاگ | beside blog pages | blog_category «راهنمای خرید» `/blog/category/buying-guide/`, blog_post `/blog/best-phones-under-30m/` |

- **No mobile menu key exists** (`/menu/mobile/` → 404 `menu_not_found`, verified). Build the mobile drawer from `main`
  (+ `header`). Operators may create new keys (Latin letters/digits/`-`/`_`, ≤50) — only render keys you coordinate.
- Footer "columns" are not a separate concept: convention = top-level `none` items are column headings with children.
  Render generically (top-level item with children → column).
- Menu `title` (≤100) is available if a heading is wanted. Disabled menu ≡ nonexistent (`menu_not_found`).
- Operator is told never to change keys after the storefront is connected.

### 5.2 Link types → URL (url is always ready; never build from target)
| link_type | meaning | `url` | `target` |
|---|---|---|---|
| `none` | group heading, no link | `null` | `null` |
| `url` | free URL | `/…` storefront path (may include `?query`) or full `http(s)://…`, as typed | `null` |
| `page` | content page | `/page/{slug}/` | `{type:'page', id, slug}` |
| `product` | product | `/product/{slug}/` | `{type:'product', …}` |
| `product_category` | product category | `/product-category/{path}/` | slug = last segment only |
| `brand` | brand | `/brand/{slug}/` | |
| `product_list` | curated product list | `/product/list/{slug}/` | |
| `blog_post` | blog post | `/blog/{slug}/` | |
| `blog_category` | blog category | `/blog/category/{path}/` | slug = last segment only |

- `url` type validation (backend `utils/links.py`): must be a path starting with exactly one `/` (no `//`, no `\`, no
  whitespace/control chars) or an absolute http(s) URL with host. `javascript:` etc. impossible.
- URLs are computed at request time from the target's **current** slug — menus never go stale after slug changes.
- Operator may paste a full URL of the storefront itself in `url` type → optionally strip own origin to client-route.

### 5.3 What the API already removed (don't re-filter)
Item (and its whole subtree) is dropped when: item inactive; target deleted ("broken link" in panel); target not
published (draft product/page/list, scheduled post not yet published, category under a draft parent); `url` item with
empty URL; blog_post/blog_category while the **blog feature flag is off** (all blog routes 503 then); `none` heading
whose children were all removed (recursively bottom-up). A `none` heading created **without** children stays (with
`children: []`) — render it as a plain heading. Empty menu → `items: []` (200, not error).

### 5.4 Rendering
- Recursive component; unlimited depth (MPTT). `url === null` → `<span>`; `open_in_new_tab` → `<a target="_blank"
  rel="noopener">` (applies to internal paths too); `url.startsWith('/')` → `<Link>`; else `<a>`.
- `icon`: `<img src alt="" width=20 height=20>` (never inline SVG markup); `alt=""` because title is adjacent.
- Active-state: compare `target.type`+`target.slug` with current route (e.g. on `/page/about-us/`, page/about-us), or
  compare `url` with pathname (better for categories, since slug ≠ path).
- Prefetch hints: `target.type` tells which endpoint; `target.id` is the row id in its own table.
- `getMenu(key)`: `revalidate: 300`, **never throws**: `menu_not_found` → `[]` silently; other failures → log + `[]`.

### 5.5 Panel facts (§4–5)
Item fields: menu, parent (same menu), title ≤100, link type + destination picker (or URL), icon (FileField
"image or SVG"), open_in_new_tab, active (default on). Order via drag-and-drop tree (no numeric field). New item goes
last among siblings. Moving across menus only via edit page (subtree follows). Deleting an item deletes its subtree.

---------------------------------------------------------------------------------------------------------

## 6. Homepage — `GET /api/v1/homepage/`

No params, no pagination, never 404 (unconfigured store → 200 with empty SEO strings and `sections: []`).
Fetch **without** `Authorization` (shared cache, `revalidate: 60`); throw on failure so ISR keeps last good version.

### 6.1 Section envelope (all types)
- 11 keys: `id, type, title, subtitle, link, items, products, listing_query, categories, posts, content`; unused content
  keys are `null` (never `[]`/`""`). Verified live for all 11 sections in dev.
- Order = operator `display_order` ascending (ties: creation order). Don't assume count/order.
- `title`/`subtitle`: `""` → don't render (≤200 chars each).
- Section `link` = operator "see all" `{url, title}` or `null`. `title` may be `""` → storefront label "مشاهدهٔ همه".
  Operator link always overrides the auto product-carousel link. Panel: a link title without URL does nothing.
- Destination (`link.url`, item `link.url`) = `/…` storefront path (query allowed, e.g. `/product/list/?has_discount=true`)
  or absolute http(s). `StoreLink`: `/` → `<Link>`, else `<a>`.
- `id` → React key.

### 6.2 Visibility rules (server-side; storefront does NOT check clocks)
A section is omitted when: inactive; outside its `starts_at`/`ends_at` window; slider/banner_group without an active
item; product_carousel with no buyable product, or whose category/brand/list was deleted or is draft; category_grid /
post_carousel with nothing published; post_carousel while blog is off; rich_text with no visible content (e.g. only
`&nbsp;`). Dev proof: sections 10012 (scheduled 2031), 10008 (deleted category), 10013 (inactive) absent from response.
Result: never render skeletons or "no products" placeholders for missing sections.

### 6.3 `slider`
- `items`: active slides in operator order (`display_order`), **no count limit** (item_limit doesn't apply).
- Image: `<picture>`: `<source media="(max-width: 767px)" srcSet={mobile_image}>` only when non-null + `<img src={image}
  alt={item.alt}>`. `mobile_image: null` → same image everywhere (no placeholder).
- Overlay text: render `title` / `description` only if non-empty; color = `text_color || undefined` (apply ONLY to
  title+description; CTA label color is storefront's).
- `link` non-null → whole slide is a link; `link.title` non-empty → CTA/button label; `""` → image-only clickable.
  `link: null` → not clickable.
- One slide → no arrows/dots. Autoplay, arrows, timing, transition = storefront design (API gives none).
- LCP: only the **first image of the first image section (slider or banner_group)** gets `loading="eager"
  fetchPriority="high"`; everything else lazy (even if a rich_text precedes it).
- A11y: `alt` may be `""` (decorative OK) except linked tiles with no alt/title/description/link.title → nameless link;
  ask operators to fill alt on linked slides.
- Dev example: 3 slides; slide 1 has `mobile_image` and `text_color: "#FFFFFF"`, link `/blog/black-friday-guide/`
  title «راهنمای خرید کمپین»; slides 2–3 `mobile_image: null`, `text_color: ""`.

### 6.4 `banner_group`
- Same `items` shape as slider. Grid layout is the storefront's (API gives no column hint, no count cap).
  Guide recommendation (≥768px; phone always stacked):
  | banners | ≥768px |
  |---|---|
  | 1 | full width |
  | 2 | 2 columns |
  | 3 | 3 columns |
  | 4 | 2×2 |
  | 5+ | 3 columns, wrapping |
  Implement with `data-count={n > 4 ? 'many' : n}` + CSS grid.
- Same mobile_image / text_color / link / alt rules; participates in the "first image section" LCP rule.
- Panel: changing slider ↔ banner_group keeps the same item rows.

### 6.5 `product_carousel`
- `products`: full `ProductCard` (same as `GET /product/list/`) — reuse the listing card component.
- Count ≤ section `item_limit` (1–24, default 10). Only **buyable** products (published, in stock net of others' cart
  holds); out-of-stock never appears, but trust `in_stock`/cart over presence (60 s cache).
- Special products are **not** boosted (unlike `/product/list/` default). Category/list sources follow that
  category/list's `default_sorting` (else list default = newest); brand has no default sorting.
- `listing_query` → see-all link `/product/list/?${new URLSearchParams(listing_query)}`. Send unchanged.
  Per source (panel `product_source` → `listing_query`):
  | source (panel) | `listing_query` |
  |---|---|
  | manual (انتخاب دستی) | `null` → no auto see-all |
  | newest | `{sort:'date-desc', in_stock:'true', special_first:'false'}` |
  | best_selling | `{sort:'sale', in_stock:'true', special_first:'false'}` |
  | discounted | `{has_discount:'true', in_stock:'true', special_first:'false'}` |
  | category | `{category:'<slug>', [sort:'<category.default_sorting>'], in_stock:'true', special_first:'false'}` |
  | brand | `{brand:'<slug>', in_stock:'true', special_first:'false'}` |
  | product_list | `{list:'<slug>', [sort:'<list.default_sorting>'], in_stock:'true', special_first:'false'}` |
  **Verified live**: for all 3 automatic carousels in dev (category mobile-phone with `sort:'date-desc'`, brand apple,
  list flagship-phones with `sort:'sale'`) the carousel ids equal the first N ids of `GET /api/v1/product/list/` with
  the same params; all carousel cards `in_stock: true`. The manual carousel (10002) shows an `is_special_product`
  item first only because of manual order.
- `/product/list/` (no slug) must exist on the storefront and forward query params verbatim; mark it
  `noindex, follow` or canonical → the topic page (`/product-category/{path}/`, `/brand/{slug}/`, `/product/list/{slug}/`).
- `is_in_wishlist` is always false in the shared response → hydrate hearts client/server-side per viewer from
  `GET /api/v1/product/wishlist/list/?limit=100` (follow `next` until null), match by product `id`. Guests: skip.

### 6.6 `category_grid`
- `categories`: full `CategoryCard` (same as `GET /product/category/list/`); only published, not under a draft parent.
  Count ≤ `item_limit`. Source: manual (operator order) or `homepage_flagged` (categories with
  `show_in_homepage`, in **tree pre-order** — verified: digital, digital/mobile-phone, home-appliance,
  home-appliance/refrigerator, fashion, fashion/men-clothing).
- Link: `/product-category/{path}/`. `image`/`icon` absolute, never null (placeholder `/static/defaults/default.png`).
- **`product_count` = direct products only** → parents show 0 (dev: digital, fashion, beauty-health all 0). Don't
  show counts, or only when > 0. Subtree counts: `GET /product/filters/` `categories[].product_count` (children) or
  `count` of `GET /product/list/?category=…`.
- No automatic see-all; only operator `link` (dev section 10003/10009 have `link: null`).

### 6.7 `post_carousel`
- `posts`: full `PostCard` (same as `GET /blog/post/list/`); only published (scheduled future excluded); link
  `/blog/{slug}/`. Count ≤ `item_limit`. Source: manual / newest (by publish date) / most_viewed (by view_count).
- Whole section vanishes while the blog flag is off — no storefront condition needed. (Storefront-own hard-coded blog
  links e.g. a fixed «مجله» header link are NOT covered — menus handle their own.)
- `is_in_reading_list` false in shared response → hydrate per viewer from `GET /api/v1/blog/reading-list/list/?limit=100`
  (paginate until `next` null), match by id.
- Typical operator link: `{ url: '/blog/', title: 'همهٔ مطالب' }` (dev) → storefront needs a `/blog/` index route.

### 6.8 `rich_text`
- `content` HTML (never null for this type), same rules as page content (media absolute on API host, store links
  as written) → reuse `RichContent`. Panel refuses empty content; visually-empty content is dropped server-side.

### 6.9 Homepage SEO
| field | tag | fallback |
|---|---|---|
| `page_title` | `<title>` | store name (project config) → `""` only on a never-saved install (then rely on layout default title) |
| `page_description` | description | store slogan → `""` (omit) |
| `page_keywords` | keywords | `""` (omit; no global default) |
| `canonical_link` | canonical | `null` → `/` on metadataBase |
| `meta_tags` | meta per row | `[]`; og:* via `property` |
Dev: title «فایرفلای | فروشگاه اینترنتی کالای اصل», description + keywords set, `meta_tags: []`.

### 6.10 Panel options per section (exhaustive — nothing else exists)
Common: type (6), title/subtitle (≤200), see-all URL + title, display_order (required int), active, starts_at/ends_at
(end > start; Jalali picker), item_limit (only carousels & grid; 1–24; default 10). Slider/banner items: image
(required), mobile_image, alt (≤200), title (≤200), description, text_color (colorfield hex, blank = default),
link_url (≤500, path or http(s)) + link_title (≤100), display_order, active. Product carousel: product_source + one of
category/brand/product_list; manual rows (product + order, unique per section). Category grid: category_source
(manual | homepage_flagged) + manual rows. Post carousel: post_source (manual | newest | most_viewed) + manual rows.
Rich text: content (WYSIWYG). Changing a section's type clears hidden source fields; manual rows are kept hidden.

**Dashboard banners** (panel §8) are a different feature: `GET /api/v1/dashboard/banner/list/` (customer dashboard;
fields title ≤120, subtitle ≤255, button text ≤40 default «مشاهده کنید», link url required, image, mobile image, alt,
order, active, window). Out of scope here — see dashboard digest.

---------------------------------------------------------------------------------------------------------

## 7. Search

### 7.1 `GET /api/v1/search/?q=` (results page)
- `q` required, raw ≤200 chars, normalized 2–100 chars. Send with `encodeURIComponent`.
- Response: `{ query, total, products, product_categories, brands, blog_posts, pages }` — each group
  `{ count, items, listing_query }` (see types). Live check `q=ای`: counts 24/6/4/17/0, items 12/6/4/6/0 → caps today
  **12 products, 6 categories, 6 brands, 6 posts, 4 pages** (don't hard-code; compare `count > items.length`).
- No results → 200, `total: 0`, all `count: 0`, `items: []` (still logged as a zero-result search).
- `count` equals the group's list endpoint count for `listing_query` **by construction** (verified for `ای`: product 24,
  categories 6, brands 4, posts 17, pages 0; and for `گوشی`).
- **No highlight/snippet markup is returned.** If you highlight, do it client-side against `data.query` and remember the
  backend normalizes digits/ی/ک/ZWNJ on both sides (a naive substring highlight may miss matches like ۲۵ vs 25).
- Errors (all `validation_error`, `attr: 'q'`, verified live): `required` (no q), `blank` (empty/whitespace),
  `min_length` (<2 after normalization, «عبارت جستجو باید دست‌کم ۲ نویسه باشد.»), `max_length` (>100 normalized or >200
  raw; two different messages), `null_characters_not_allowed` (`%00`). Plus 429 (global limit).

**Normalization** (`query` echoes the result; verified: «۲۵»/«٢٥»/«25» → `25`, «گلکسي» → «گلکسی»):
remove invisible non-space control chars, U+FFFE/U+FFFF, bidi controls (U+202A–202E, U+2066–2069); Persian/Arabic
digits → Latin; ي/ى → ی, ك → ک; drop tatweel ـ; ZWNJ → space; collapse spaces; trim; Latin case preserved in `query`
(matching is case-insensitive); **operator "ignored words"** (panel: SEO & marketing → ignored words, e.g. «خرید») removed as
whole words (ZWNJ counts as part of the word) — unless the whole query is ignored words (then searched as-is). Hence a
>2-char input can still fail `min_length`. Duplicates kept in `query`, but matching dedups and uses first 8 distinct words.

**Matching**: every word must appear (substring, any order, case-insensitive) in: product name + `extra_detail`;
category/brand name; post name + short description; page title (not full content). Only rows the list endpoints
would show (no drafts, no future posts, no categories under draft parents).

**Ranking per group**: exact name == query, then name starts with query, then everything else; ties keep the list
endpoint's order. Products: in-stock before out-of-stock within a tier; special products NOT boosted (hence
`special_first: 'false'` in the products `listing_query`). Out-of-stock products are shown (badge "ناموجود").

**See-all per group** (only when `listing_query !== null && count > items.length`):
| group | storefront page (paths 2–5 are guide suggestions) | API it calls | listing_query |
|---|---|---|---|
| products | `/product/list/?search=…&special_first=false` | `GET /product/list/` | `{search, special_first:'false'}` |
| product_categories | `/search/categories/?search=…` | `GET /product/category/list/` | `{search}` |
| brands | `/search/brands/?search=…` | `GET /product/brand/list/` | `{search}` |
| blog_posts | `/search/posts/?search=…` | `GET /blog/post/list/` | `{search}` |
| pages | `/search/pages/?search=…` | `GET /pages/list/` | `{search}` |
Never rebuild `search` from the raw input (ignored words are only stripped from `q`, not by list endpoints).

**Blog off**: `blog_posts = { count: 0, items: [], listing_query: null }`, excluded from `total`. Group with
`count: 0` renders nothing (no heading, no "no results").

**Logging & staff**: each `search/` call increments the operator's search report (term + counts only; zero-result
terms listed separately). Staff/superuser searches with their Bearer token are not logged → the server-rendered
results page must see the token (cookie), since navigations don't send `Authorization`. Guide reads cookie
`access_token` (example name) + `x-real-ip` → `X-Forwarded-For`.

**Throttle**: global — guest `THROTTLE_ANON` 2000/hour per IP, user `THROTTLE_USER` 5000/hour per account. Results
page: 429 → own message «درخواست‌ها زیاد بود؛ چند لحظه بعد دوباره امتحان کنید.» (not `detail`).

**Results page** (`app/search/page.tsx`, route `/search/?q=`): `searchParams` is a Promise (Next 15+); no/blank q → render
box only, no API call; outcome union found/refused(400)/throttled(429), other statuses throw; map `min_length` → «عبارت
جستجو دست‌کم دو حرف باشد.», `max_length` → «عبارت جستجو بیش از حد بلند است.», others → API `detail`;
`metadata.robots = { index: false, follow: true }` (also for the 4 see-all pages and `/product/list/?search=`).
`total === 0` → «نتیجه‌ای پیدا نشد.». Products: `in_stock ? price : 'ناموجود'`. Search hearts/badges: send the
customer token to `search/` (never cached → no leak) and `is_in_wishlist` / `is_in_reading_list` come back correct.

### 7.2 `GET /api/v1/search/suggest/?q=` (type-ahead)
- Same `q` rules & 400 codes. Returns `{ query, products ≤5, product_categories ≤3, brands ≤3 }` of
  `{ id, name, url, image }`; `url` is a ready storefront path (category from `path`). No posts/pages in suggest.
  Verified `q=ای` → 5/3/3; `q=سام` → 4 products, 0 categories, 1 brand.
- Items are a subset of what `search/` would show; product order = products group order.
- Never logged. Own throttle `search_suggest` = `THROTTLE_SEARCH_SUGGEST` default **1800/hour per IP** (per account with
  token); independent of the global limit. 429 → `Retry-After` + `data.retry_after`.
- All-empty arrays = draw nothing. Any failure (400/429/5xx/network) = "no suggestions", never an error to the user.

**Client behaviour** (`components/search-box.tsx`, client component):
- `<form action="/search/" role="search">` with `<input name="q" type="search" maxLength={200} autoComplete="off">` —
  works without JS; submitting is the only thing that calls `search/`.
- Suggest after **250 ms** pause; only when `term.trim().length >= 2`; `AbortController` cancels the previous request and
  late responses are discarded; on 429 pause until `Date.now() + Retry-After*1000`.
- Fetch `/api/search-suggest/?q=` (storefront route handler): adds key, sets `X-Forwarded-For` from `x-real-ip`,
  `next: { revalidate: 60 }` (cache key includes the XFF header → per-visitor), relays status + `Retry-After`.
- Accessibility: guide uses `role="listbox"` wrapper — add proper combobox ARIA/keyboard nav yourself.

---------------------------------------------------------------------------------------------------------

## 8. Linker ("link in bio") — `GET /api/v1/linker/`

- Storefront route: **`/links/`** (guide). No params, never 404. `name === ''` → page never saved → `notFound()`
  (empty response has `theme.key: 'legacy'`, background `#ffffff`, text `#000000`, button bg `#F1F5F9`, button text
  `#000000`, border `transparent`, positions top/right, `show_footer: true`, `rounded_edges: true`, empty lists).
- Cache `revalidate: 300`; prerendered at build (API needed at build, or force-dynamic). Throw on failure.
- Usually rendered **without** shop header/footer → put shop pages under a route group `app/(shop)/` with the menu
  layout and keep `app/links/` outside it.

**Theme**: one template for all 9 themes; set CSS vars on the root:
`--linker-background, --linker-text, --linker-button-background, --linker-button-text, --linker-button-border`.
`background` may be a gradient → `background-repeat: no-repeat` after it + `min-height: 100vh`. Storefront derives:
avatar-letter bg `color-mix(in srgb, var(--linker-text) 20%, transparent)`; hover
`color-mix(in srgb, var(--linker-button-text) 15%, var(--linker-button-background))` (works on transparent);
border width (e.g. `2px solid var(--linker-button-border)`). Don't branch on `theme.key`.
Theme keys/panel names: black مشکی, blue آبی, cotinga کوتینگا, cyan فیروزه‌ای, flamingo فلامینگو, goldfinch سهره,
legacy کلاسیک, parrot طوطی, tanger نارنجی. Dev: `cyan`, `linear-gradient(#0891b2, #22d3ee)`, white text/border,
transparent button bg.

**Layout flags**: `social_links_position` top (under name/bio, above links; default) | bottom (below links);
`thumbnail_position` right (default) | left = **physical side** in RTL → right = natural flex order, left =
`flex-direction: row-reverse`; `rounded_edges` → one radius var (`--linker-radius`) for buttons+images;
`show_footer` → draw a footer line (API provides no text; guide prints `name`). Invalid stored enum values are
coerced to defaults by the API — no default branch needed.

**Header**: `logo` (absolute) or, if null, `avatar_letter` in a circle. `<h1>{name}</h1>`, `bio` if non-empty.
Dev: `logo: null`, `avatar_letter: "ف"`, name «فروشگاه فایرفلای».

**Links** (pre-filtered; every link has `href` except `text`; don't re-filter):
| link_type | value | href | render |
|---|---|---|---|
| `button` | store path (`/product/list/flagship-phones/`) or http(s) URL | absolute; store path joined onto backend `STOREFRONT_URL` (dev: `http://localhost:3000/product/list/flagship-phones/`) | button with `title` + optional `thumbnail`; if `value.startsWith('/')` → `<Link href={value}>` else `<a href={href}>` |
| `email` | address | `mailto:…` | `<a href>` button |
| `phone` | as typed (`02191001234`) | `tel:+982191001234` (E.164) | `<a href>` button; may show `value` |
| `text` | plain text (multi-line) | `null` | not a link: `title` as heading, `value` as text, `white-space: pre-line`, NEVER innerHTML |
| `video` | http(s) video URL or store path | absolute (as button) | embed `<iframe>` only for aparat.com (`/v/{id}` → `https://www.aparat.com/video/video/embed/videohash/{id}/vt/frame`) and youtube.com `watch?v=` / youtu.be → `https://www.youtube.com/embed/{id}`; otherwise a button. Verify embed URL patterns with providers. |
| unknown | — | — | render nothing |
Dropped server-side: inactive links; phone with extension (`#123`); invalid button/video URL, invalid email/phone;
`text` with empty/whitespace value; socials with unknown platform or invalid URL (e.g. `javascript:`).

**Socials**: `{platform, url, icon}`; icon = black monochrome SVG on API host → put on a light circle
(`background:#fff`), no color filters; `aria-label={platform}`; platform may repeat (dev: two instagram rows).

**SEO** (`generateMetadata`): `title: name`, `description: bio` (if non-empty), `openGraph.images: [logo]` (if logo),
canonical `/links/`. Don't set empty keys.

---------------------------------------------------------------------------------------------------------

## 9. Contact form

### 9.1 `GET /api/v1/contact-us/subject/list/`
- Paginated `{id, title}` in operator order; inactive subjects excluded. Fetch `?limit=100`, `revalidate: 300`,
  `tags: ['contact-subjects']`; throw on failure (form without subjects can't submit correctly).
- Dev/fresh install: 5 subjects — 1 پیگیری سفارش, 2 پیشنهاد, 3 انتقاد و شکایت, 4 همکاری, 5 سایر.
- Empty list (all disabled) → 200 `results: []` → form has **no subject select** and sends no `subject`.
- Errors: 404 `not_found` (bad page; verified `page=2`).

### 9.2 `POST /api/v1/contact-us/message/submit/`
Body `ContactMessageSubmit`. **No attachments** (JSON only; no file field anywhere). 201 →
`{ msg: "پیام شما ثبت شد و به‌زودی بررسی می‌شود.", data: {} }` — show msg verbatim, no promises of response time, no
tracking id/status exists. Nobody is notified by email/SMS on arrival; operator replies by email (to `email`) or SMS
(to `phone`).

**Check order**: key → **429 first** (even for invalid bodies) → field validation (400, attr) → honeypot (filled →
201, nothing stored, no quota) → subject rules → channel rule → store + 201 + quota decrement.

**Validation details**:
- `subject`: required while list non-empty (`contact_subject_required`, attr null); disabled/unknown id →
  `contact_subject_unavailable` (attr null); non-integer → `invalid` attr `subject`.
- `name`: required, non-blank (after stripping control chars), ≤100; newlines/space runs → single space. Use `<input>`.
- `email`: valid, ≤254; `""`/null = absent (unlike comments). NUL char → `null_characters_not_allowed` (attr email).
- `phone`: Iranian mobile only (`09121234567`, `+989121234567`, Persian digits OK; stored as `+989…`); landline
  `02188776655` or foreign `+14155552671` → `invalid_iranian_mobile` (verified both); not a number → `invalid`.
- at least one of email/phone else `contact_channel_required` (attr null; verified for missing and for both `""`).
- `message`: 10–5000 chars **after** removing control chars (C0 except tab/newline, DEL, C1), U+FFFE/FFFF, bidi
  controls; all newline kinds normalized to one newline; trimmed; ZWNJ/U+200E/U+200F/U+200B kept & counted.
  Browser counts emoji as 2 chars, API as 1 → `minLength`/`maxLength` attributes are hints only; show API errors.
- NUL in name/message is stripped silently; NUL in email or honeypot → 400.

**Errors** (✓ = re-verified live):
| status | code | attr | detail (Persian) |
|---|---|---|---|
| 400 | `contact_subject_required` ✓ | null | موضوع پیام را انتخاب کنید. |
| 400 | `contact_subject_unavailable` ✓ | null | این موضوع دیگر در فهرست نیست؛ صفحه را تازه کنید و موضوع دیگری انتخاب کنید. |
| 400 | `contact_channel_required` ✓ | null | ایمیل یا شمارهٔ موبایل خود را بنویسید تا پاسخ به دستتان برسد. |
| 400 | `invalid_iranian_mobile` ✓ | phone | شمارهٔ موبایل ایران را وارد کنید؛ تلفن ثابت و شمارهٔ خارجی پذیرفته نمی‌شود. |
| 400 | `invalid` ✓ | phone / email / subject | یک شماره تماس معتبر… / پست الکترونیکی صحیح وارد کنید. / یک مقدار عددی معتبر لازم است. |
| 400 | `required` ✓ | name, message | این مقدار لازم است. (both can come together) |
| 400 | `blank` | name, message | این مقدار نباید خالی باشد. |
| 400 | `null` ✓ | name, message | این مقدار نباید توهی باشد. (sic) |
| 400 | `max_length` | name / email / message | ≤100 / ≤254 / ≤5000 |
| 400 | `min_length` ✓ | message | متن پیام دست‌کم ۱۰ نویسه باشد. |
| 400 | `null_characters_not_allowed` | email (or website) | |
| 400 | `parse_error` | null | invalid JSON / null body |
| 405/413/415 | | null | as comments |
| 429 | `throttled` | null | `retry_after` = seconds until the oldest message of the hour expires (e.g. 3506, not always 3600) |
The three contact-specific codes are `data.type: "client_error"` with `attr: null` → place them by code: subject codes
under the subject select, channel code under email+phone.

**Throttle**: `THROTTLE_CONTACT_MESSAGE_SUBMIT` default **10 stored messages/hour**, guest per IP, signed-in per
account; **separate** from the comment quota. Rejected (400) and honeypot submissions don't count.

**Stale subject list** (5-min cache): `contact_subject_unavailable` (subject disabled meanwhile) or
`contact_subject_required` (list was empty, now isn't) → route handler calls
`revalidateTag('contact-subjects', { expire: 0 })`, form calls `router.refresh()`; `<select key={ids.join('-')}>`
resets selection; typed name/message survive. Contact page must be `export const dynamic = 'force-dynamic'`
(a build-time static page lost typed text on refresh in the guide's test).

**Form rules**: subject select only when list non-empty, `required`, first option disabled «انتخاب کنید» (value "");
name `<input maxLength=100 autoComplete="name">`; fieldset email (`type=email`, `dir="ltr"`, maxLength 254) + phone
(`type=tel`, `dir="ltr"`, placeholder 09121234567) with pre-submit check «at least one» (no request sent otherwise);
message `<textarea minLength=10 maxLength=5000>`; honeypot; submit disabled while busy or throttled. Show name/email/phone
**also for signed-in users** (nothing taken from the account; prefilling from profile is a storefront nicety).
Payload: `subject` → `Number` or omitted; trim + omit empty email/phone; `website` as typed.

**Route handler** `app/api/contact/route.ts`: same as comment handler (`refuseForeignForm` → `fireflyFetch` with
`forwardedHeaders`, raw body, `no-store`) + bust subject cache on the two subject codes (only after the origin check, so a
foreign site can't spam cache busts). Routes: `/contact/` (guide) or embedded under `/page/contact-us/`.

---------------------------------------------------------------------------------------------------------

## 10. Storefront URL patterns (exact)

### 10.1 Generated by the backend (menus, `url` fields, suggest `url`, sitemap) — MUST exist verbatim
| target | storefront path | Next.js file | data from |
|---|---|---|---|
| content page | `/page/{slug}/` | `app/page/[slug]/page.tsx` | `GET /api/v1/pages/{slug}/` |
| product | `/product/{slug}/` | `app/product/[slug]/page.tsx` | `GET /api/v1/product/detail/{slug}/` |
| product category | `/product-category/{path}/` (`path` = root→leaf slugs) | `app/product-category/[...path]/page.tsx` | product guide (`/product/category/{slug}/`, last segment) |
| brand | `/brand/{slug}/` | `app/brand/[slug]/page.tsx` | `GET /api/v1/product/brand/{slug}/` |
| product list (curated) | `/product/list/{slug}/` | `app/product/list/[slug]/page.tsx` | `GET /api/v1/product/list-page/{slug}/` (note API path differs) |
| blog post | `/blog/{slug}/` | `app/blog/[slug]/page.tsx` | `GET /api/v1/blog/post/{slug}/` |
| blog category | `/blog/category/{path}/` | `app/blog/category/[...path]/page.tsx` | `GET /api/v1/blog/category/{slug}/` |
All end with `/`. Backend code: `pages/models.py` `/page/{slug}/`, `product/models.py` `/product-category/{path}/`,
`/product/list/{slug}/`, `/brand/{slug}/`, `blog/models.py` `/blog/category/{path}/`. Sitemap (`/sitemap.xml`, served by
backend) emits these on `STOREFRONT_URL` (dev `http://localhost:3000`, verified). Conflict note: `/product/list/` (no
slug, query-driven listing) and `/product/list/{slug}/` must coexist with `/product/{slug}/` — a product slug `list`
collides, and a blog post slug `category` collides with `/blog/category/…` (backend reserves `list` only for pages; see
§14 item 10).

### 10.2 Implied by API semantics (must exist)
| path | why |
|---|---|
| `/` | homepage |
| `/product/list/?{params}` | product-carousel see-all (`listing_query`), search products see-all, operator links like `/product/list/?has_discount=true` (dev header menu + slider in guide) |
| `/blog/` | operator see-all link on post carousel (dev data) |

### 10.3 Recommended by the guide (names are free; keep consistent)
| path | purpose |
|---|---|
| `/search/?q=` | results page (GET form target) |
| `/search/categories/?search=` | categories see-all → `GET /product/category/list/` |
| `/search/brands/?search=` | brands see-all → `GET /product/brand/list/` |
| `/search/posts/?search=` | posts see-all → `GET /blog/post/list/` |
| `/search/pages/?search=` | pages see-all → `GET /pages/list/` |
| `/links/` | linker page |
| `/contact/` | contact form page (or under `/page/contact-us/`) |
| `/api/page-comments/{slug}/` | comment route handler (POST) |
| `/api/search-suggest/?q=` | suggest route handler (GET) |
| `/api/contact/` | contact route handler (POST) |
Examples only (operator-entered `url` items): `/order/tracking/`. Other storefront paths the backend builds outside this
guide (FYI): `{STOREFRONT_URL}/order/pay/{token}` (payment links), `{STOREFRONT_URL}/s/{code}` (short links,
`SHORT_LINK_BASE_URL`), `{STOREFRONT_URL}/sitemap.xml` in robots.txt.

---------------------------------------------------------------------------------------------------------

## 11. Shared server module (`lib/firefly.ts`) — contract

```ts
import 'server-only';
export function fireflyFetch(path: string, init: RequestInit = {}): Promise<Response>   // sets X-API-Key, keeps init headers
export function forwardedHeaders(incoming: Headers): Headers   // JSON CT + visitor Authorization + X-Forwarded-For ← x-real-ip
export function refuseForeignForm(req: Request): Response | null   // 403 if Origin host !== Host; 415 if CT !== application/json
export async function errorCode(res: Response): Promise<string | null>   // data.errors[0].code
export function statusPage(status: number, title: string, message: string): Response   // used by robots/redirect guides
```
- Only forward `X-Real-IP` → `X-Forwarded-For` if your edge **overwrites** `X-Real-IP` (`proxy_set_header X-Real-IP
  $remote_addr`); otherwise clients can spoof it and dodge quotas — remove those lines.
- Backend side (coordinate with backend team): nginx `set_real_ip_from <storefront ip>; real_ip_header X-Forwarded-For;`
  or `TRUSTED_PROXY_IPS=<storefront ip>` when the storefront connects directly (insufficient behind a proxy that appends
  to XFF). Alternative: raise `THROTTLE_ANON`, `THROTTLE_SEARCH_SUGGEST`, `THROTTLE_COMMENT_SUBMIT`,
  `THROTTLE_CONTACT_MESSAGE_SUBMIT` to store-wide levels.

---------------------------------------------------------------------------------------------------------

## 12. Error-code reference (storefront reaction)

| code | status | endpoints | reaction |
|---|---|---|---|
| `api_key_missing` / `api_key_invalid` | 401 | all | config problem: alert/log; not user error |
| `not_found` | 404 | pages detail/list/comments, comment submit, subject list, non-slug menu key | page → `notFound()`; list → stop paging at `next === null` |
| `menu_not_found` | 404 | menu | render nothing |
| `page_comments_disabled` | 403 | comment submit | hide form, show detail |
| `contact_subject_required` | 400 | contact | show under select; if form had no select → stale list: bust cache + refresh |
| `contact_subject_unavailable` | 400 | contact | bust cache, `router.refresh()`, show under select |
| `contact_channel_required` | 400 | contact | pre-validate; show under email+phone |
| `invalid_iranian_mobile` | 400 | contact | under phone |
| `required` / `blank` / `null` | 400 | comment, contact, search, suggest | under field; for q: programming error (don't send empty) |
| `max_length` / `min_length` | 400 | comment, contact, search, suggest | under field; search page friendly copy; suggest: silent |
| `null_characters_not_allowed` | 400 | contact (email/website), search, suggest | show detail or nothing |
| `invalid` | 400 | comment (name/email/parent), contact (email/phone/subject) | under attr field |
| `invalid_choice` | 400 | comment list/submit | programming error |
| `incorrect_type` | 400 | comment submit (parent) | programming error |
| `does_not_exist` | 400 | comment submit (parent) | only offer reply under listed comments |
| `parse_error` | 400 | POSTs | programming error |
| `request_too_large` | 413 | POSTs | programming error |
| `method_not_allowed` | 405 | all | programming error |
| `unsupported_media_type` | 415 | POSTs | send JSON; check route handler keeps CT |
| `throttled` | 429 | all (comment 10/h, contact 10/h, suggest 1800/h/IP, global anon 2000/h, user 5000/h) | forms: disable for `retry_after`, show detail; results page: friendly retry message; suggest: silent pause; repeated for everyone ⇒ XFF/quota not configured |
Network/5xx: page/homepage/linker/subject fetches throw (ISR keeps last good); menu returns `[]` + log; forms show
«ارسال نشد؛ لحظه‌ای بعد دوباره امتحان کنید.»; results page throws on non-400/429; suggest silently empty.

---------------------------------------------------------------------------------------------------------

## 13. Implementation checklist

**General**
- [ ] `FIREFLY_API_URL` (public HTTPS API origin) + `FIREFLY_API_KEY`, server-only; `lib/firefly.ts` with `import 'server-only'`.
- [ ] `trailingSlash: true`; all API calls with trailing slash.
- [ ] `proxy.ts` 404 for malformed percent-encoding; slug normalisation helper (`slugPath`).
- [ ] Root layout: `<html lang="fa" dir="rtl">`, `metadataBase` = storefront origin, default string `title`.
- [ ] `images.remotePatterns` includes API host if using `next/image`.
- [ ] Branch on `errors[].code`; handle multiple errors per response.
- [ ] Coordinate XFF trust / throttle settings with backend before launch; forward `X-Real-IP` only if edge overwrites it.
- [ ] Nginx in front of Next passes `Host` unchanged (else all forms 403 via `refuseForeignForm`).

**Pages**
- [ ] `/page/[slug]/` with real 404 for missing/draft; 3 layouts + unknown→default; `with_sidebar` aside.
- [ ] Rich content unescaped; `content: null` safe.
- [ ] SEO: title, description/keywords only when non-empty, canonical fallback to own URL, OG via `property`, others via `other`.
- [ ] Staff preview: `no-store`, dynamic, draft banner, `noindex`, behind staff auth.

**Comments**
- [ ] Show list if open or counts > 0; form only if `enable_comments`; counts from page detail.
- [ ] Recursive thread, `pre-wrap`, admin badge, "you" badge, capped indentation.
- [ ] Route handler with origin/CT check, raw body, XFF, token pass-through, `Retry-After` relay.
- [ ] Guest-only name/email inputs; omit empty optionals; honeypot correct; 201 → msg only; 403 → hide form; 429 → timer.

**Menus**
- [ ] `getMenu` with revalidate 300, never throws; header (`header`), main nav (`main`), footer (`footer`), blog sidebar (`blog-sidebar`); mobile drawer built from `main`.
- [ ] Recursive render, `none` → span, `/` → Link, external → a, new tab → `target=_blank rel=noopener`, icon `<img alt="">`.
- [ ] Active state via `target`/`url`. No re-filtering.

**Homepage**
- [ ] `getHomePage` (React cache, revalidate 60, throws), no Authorization.
- [ ] Switch on 6 types; unknown → null + warn; no placeholders for absent sections; `sections: []` OK.
- [ ] Section header: title/subtitle/see-all (operator link → else carousel `listing_query` → else none; label fallback «مشاهدهٔ همه»).
- [ ] Slider/banner: `<picture>` mobile source, `text_color` only on title/description, link/CTA rules, first-image eager+high priority only.
- [ ] Banner grid by count (1/2/3/4/many).
- [ ] Product/post cards = listing components; hearts and reading-list badges hydrated per viewer (paginate to `next: null`).
- [ ] Category links from `path`; hide `product_count` (or only > 0).
- [ ] `/product/list/` page forwarding params verbatim; `noindex, follow` or topic canonical.
- [ ] Build environment can reach API (or force-dynamic).
- [ ] Homepage SEO with empty-key omission; OG via property.

**Search**
- [ ] `/search/` page: no call without q; `no-store`; token from cookie + XFF; refused/throttled states; `noindex, follow`.
- [ ] Display `data.query`; group only if `count > 0`; see-all only if `listing_query && count > items.length`, params unchanged.
- [ ] 4 see-all pages (+ `/product/list/?search=`) noindex; out-of-stock shown with badge; order kept.
- [ ] Search box: GET form, 250 ms debounce, ≥2 chars, abort, 429 pause, `maxLength=200`, failures silent.
- [ ] `/api/search-suggest/` handler: key, XFF, `revalidate: 60`, relay status/Retry-After.

**Linker**
- [ ] `/links/` (outside shop layout group), revalidate 300, `notFound()` on empty name.
- [ ] CSS vars from theme; derived colors in CSS; no-repeat gradient; radius var; thumbnail side via row-reverse.
- [ ] Switch on link_type; text as plain pre-line; store-path buttons via `<Link href={value}>`; aparat/youtube embeds.
- [ ] Social icons on white circles; logo vs avatar letter; footer line when `show_footer`.
- [ ] Metadata: title/description/OG image only when present, canonical `/links/`.

**Contact**
- [ ] Subjects fetched server-side (limit 100, revalidate 300, tag); page `force-dynamic`.
- [ ] Select only when subjects exist (required, «انتخاب کنید» first, keyed by ids); no select → no `subject`.
- [ ] Email/phone fieldset with pre-check; name single-line; message textarea; API min/max errors shown.
- [ ] Route handler: origin/CT check, raw body, XFF, token, `no-store`, bust `contact-subjects` on stale-subject codes.
- [ ] 201 → msg only; 429 → disable for `retry_after`; place attr-less codes by code.

---------------------------------------------------------------------------------------------------------

## 14. Suspected backend bugs / inconsistencies (verified only)

1. **OpenAPI: `LinkerSocialLink.icon` typed `string | null`** but the API never returns null (all 26 platforms have an
   icon; unknown platforms are dropped). The guide itself says "schema writes nullable but never null". Type it as
   `string` (or handle null defensively).
2. **OpenAPI: `search/` and `search/suggest/` declare `q` `minLength: 1, maxLength: 200`**, but the effective minimum
   is 2 characters after normalization (`?q=س` → 400 `min_length`; verified) and normalized max is 100
   (`'a'*150` → 400 `max_length` "…بیش از ۱۰۰…"; verified). Generated clients/validators from the schema will be wrong.
3. **Typo in the `null` validation message**: `"این مقدار نباید توهی باشد."` ("توهی" should be "تهی") — verified live
   (`POST contact-us/message/submit/` with `"name": null`); the guide reproduces it. User-visible only on programming
   errors, but don't surface raw.
4. **Lazy thumbnail placeholder flicker (observed in dev under concurrent load)**: the same product image came back as
   `http://localhost:8000/static/defaults/default.png` on one `search/suggest/` call and as the real
   `/media/CACHE/images/products/.../<hash>.jpg` on the next (seen for `samsung-galaxy-tab-a9` with `q=ab` and for a
   charger with `q=شارژر`, response sizes 565 vs 634 bytes). `utils/images.py::thumbnail_url` swallows
   `FileNotFoundError/OSError` during imagekit's on-first-access generation and returns the placeholder. Combined with
   storefront caching (homepage 60 s, suggest 60 s) a placeholder can be cached. Likely a race in lazy generation;
   worth pre-generating thumbnails (or not caching responses containing the placeholder) in production.
5. **Inconsistent `data.type` for contact-form 400s**: the three contact-specific codes
   (`contact_subject_required`, `contact_subject_unavailable`, `contact_channel_required`) come as
   `type: "client_error"` with `attr: null`, while every other 400 from the same endpoint (incl. the closely related
   `invalid_iranian_mobile`, attr `phone`) is `validation_error` with an attr. Documented, but means generic
   "attr → field" mapping misses them; map by code.
6. **`CategoryCard.product_count` semantics differ by endpoint**: direct-only on homepage `category_grid` / category
   list / search groups (dev: parents `digital`, `fashion`, `beauty-health`, `grocery` all `0` while their subtrees have
   products) vs subtree counts in `/product/filters/`. Documented in the guide, but a homepage grid of top-level
   categories (dev section 10003) will show "0 products" for every parent if rendered naively.
7. **Pagination silently ignores invalid `limit`**: `limit=0` and `limit=-5` return 200 with `page_size: 20` instead of
   a validation error (verified on `pages/list/`). Not harmful, but differs from strict `page` handling (`page=0`/`abc`
   → 404).
8. **Slashless API path → 301** (`/api/v1/menu/main` → `/api/v1/menu/main/`, verified; Django `APPEND_SLASH`). For POSTs
   this would drop the body — always use trailing slashes. In DEBUG dev, a non-slug menu key (`/menu/a%20b/`) returns
   Django's HTML debug 404 rather than the JSON envelope (prod uses `handler404 = not_found` → JSON; not verifiable
   here).
10. **Reserved-slug protection exists only for pages.** `pages/models.py` has `RESERVED_PAGE_SLUGS = {'list'}` (panel
   refuses `list` because of `/api/v1/pages/list/`). Products and blog posts use the shared `seo.AbstractBaseSeoModel`
   `SlugField(allow_unicode=True, unique=True)` with **no reserved values** (grep of `product/` and `blog/`: no reserved
   check). Yet the storefront URL scheme the backend itself generates has `/product/list/` + `/product/list/{slug}/`
   beside `/product/{slug}/`, and `/blog/category/{path}/` beside `/blog/{slug}/`. A product slugged `list` would get
   `url`/sitemap `/product/list/` (= the query listing page) and a post slugged `category` would get `/blog/category/`
   — both unreachable on a Next.js router where static segments win. Verified by code inspection, not by creating rows.
   Storefront mitigation: none possible without backend change; flag to backend team (reserve `list` for products and
   `category` for posts).
11. **Guide sample vs dev data drift (not a bug, FYI)**: guide examples show `footer` with `items: []` and different page
   ids/layouts/descriptions; the dev DB has a populated footer, all pages `layout: "default"`, `description: null`,
   and rich text without `<p>` wrappers. Don't hard-code against guide samples.

No discrepancy found between guide, schema and live responses for: homepage section shape (11 keys, nulls), menu node
shape and link types, page detail fields, comment tree, search group structure & caps, suggest caps, linker shape,
contact validation codes, `listing_query` reproducing carousel order, and search group counts matching list endpoints.

---------------------------------------------------------------------------------------------------------

## 15. Verification log (dev server, 2026-10-15)

- `pages/list/` (5 pages, title order; `limit=2` → total_pages 3, `next` absolute API URL; `limit=500` → 100;
  `page=abc|0` → 404; Arabic-ي search hits). Draft `shipping-guide-draft` → 404 detail, absent from list/search/suggest.
- `pages/{about-us|return-policy|terms}/` field set & fallbacks; `pages/nonexistent/` → 404 `not_found`.
- `comment/list/` tree with admin reply; `?comment_type=foo` → 400 `invalid_choice`; `?page=9` → 404.
- `comment/submit/` paths: 403 disabled (before body), 400 required/invalid name/blank email/invalid parent/
  does_not_exist/parse_error (2 variants), 415, 405, honeypot 201. (No real comment created.)
- `menu/{main,header,footer,blog-sidebar}/` 200; `mobile`, `sidebar`, `MAIN` → `menu_not_found`; slashless → 301.
- `homepage/`: 11 sections (slider, product_carousel×4 incl. manual, category_grid×2 manual+flagged, banner_group,
  post_carousel, rich_text); omitted: scheduled/deleted-source/inactive sections; listing_query ⇔ `/product/list/`
  ordering verified for 3 auto carousels.
- `search/` (`سامسونگ`, `گوشی`, `ای`, `zzqx`): structure, caps, counts vs list endpoints; error codes required/blank/
  min_length/max_length(200 & 100)/null chars. Invalid Bearer → treated as guest.
- `search/suggest/`: caps 5/3/3, normalization of digits and ي, category url from path, no Cache-Control headers.
- `linker/`: full shape, href joined with `STOREFRONT_URL` (`http://localhost:3000`), duplicate instagram socials,
  operator ordering (ids 10001, 10003, 10002, 10004).
- `contact-us/subject/list/` (5 subjects; `page=2` → 404) and `message/submit/` error matrix (required×2, channel,
  landline, foreign, `abc` phone, bad email, non-int subject, missing subject, unknown subject, short message, null
  name, empty email+phone) + honeypot 201. (No real message stored.)
- Backend settings: `STOREFRONT_URL` env (default `https://{SITE_DOMAIN}`), throttles anon 2000/h, user 5000/h,
  comment_submit 10/h, contact_message_submit 10/h, search_suggest 1800/h; `TRUSTED_PROXY_IPS`.
