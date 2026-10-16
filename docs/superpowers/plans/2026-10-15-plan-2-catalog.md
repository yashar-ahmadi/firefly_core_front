# Plan 2 — Catalog, Product Page, Search and Cart Core — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Shoppers can browse the homepage sections, categories, brands, curated lists and the generic listing with filters, open a complete product page, search with live suggestions, compare products, use quick view, see recently viewed products and add items to the cart (cart core and mini-cart; the full cart page and checkout come in Plan 4).

**Architecture:** Server Components fetch public catalog data through `apiFetch` with Data Cache lifetimes and never send a user token. Interactive islands (filters, variant picker, add to cart, wishlist heart, quick view, search suggestions, compare) are client components using TanStack Query over `bffFetch`. URL query strings are the single source of truth for listing state.

**Tech Stack:** As Plan 1, plus whatever Plan 1 installed. No new heavy dependencies; the price range slider uses Radix Slider (part of `radix-ui`).

**Spec:** `docs/superpowers/specs/2026-10-15-storefront-design.md` (§7, §8.2–8.6, §8.12, §8.13). API contracts: `docs/backend-integration/product.md` (primary), `content.md` (homepage §6, search §7 of TL;DR and search sections), `cart-address.md` (§2–§5 for the cart core).

## Global Constraints

Everything in Plan 1's Global Constraints, plus:

- Public catalog fetches never carry `Authorization` or `X-Cart-Token`, so their cached HTML is identical for everyone. Viewer-specific state (wishlist hearts, cart) is hydrated on the client.
- Data Cache lifetimes:
  - homepage 60 s;
  - product detail 60 s;
  - product list and filters 60 s;
  - category, brand and list-page detail 300 s;
  - category tree and product settings 300 s.
- **Never** cache `search/` (every call is logged by the backend). Suggestions are cached 60 s.
- Product images are always square (`aspect-ratio: 1/1`). There is no zoom beyond the natural 500 px size.
- Prices come only from the API. Show `final_price`, and strike `price` only when `has_discount`. Never read prices from `structured_data` (they are Rial).
- The id sent to the cart is always a **variant id**. The starting quantity is `order_limit_min || 1`. `order_limit_max === 0` means unlimited.
- Wholesale prices are never shown. Products with `enable_major` show the contact note from the spec instead.
- One-tap add from a card is only for a non-variable product with a `default_variant_id`. A variable product opens quick view.
- Pages whose backend payload has `page_title` use `title: { absolute: page_title }`, because the backend title often already contains the shop suffix.
- Listing URLs use the API's own parameter names: `search`, `category`, `brand`, `attribute_values`, `min_price`, `max_price`, `in_stock`, `is_special`, `has_discount`, `special_first`, `sort`, `page`. Every filter change resets `page`.

## Review Focus

1. **A product with a variant combination that does not exist, or a selected variant that is out of stock while others are buyable.** The buy button must be disabled with the right message, and notify-me must stay hidden unless the product-level `in_stock` is false. Tests in Task 7 (`valueState`, `resolveVariant`, notify visibility).
2. **Invalid listing query strings** (`?sort=bad`, `?min_price=abc`, `?page=999`). The page must not 500: unknown sort and bad prices are dropped before calling the API, and an out-of-range page becomes `notFound()` for pages beyond the last or redirects to page 1. Tests in Task 1 (`parseListingParams`) and Task 5 (e2e `?page=999`).
3. **A category URL whose path is not canonical** (`/product-category/mobile-phone/` instead of `/product-category/digital/mobile-phone/`) must 308 to `data.path`. Persian slugs must round-trip. Test in Task 6 (e2e).
4. **Adding to cart when the backend rejects** (limit exceeded, out of stock, 503 feature off, 429). The user sees the Persian `detail`, the button re-enables, and the cart badge doesn't change. Test in Task 3.
5. **The search box with very fast typing, Persian/Arabic letter variants, or a 1-character query.** No suggestion request under 2 characters, stale responses never overwrite newer ones, and a suggestion failure shows nothing rather than an error. Test in Task 10.

---

## File map (this plan)

```
src/lib/api/types/catalog.ts        # ProductCard, ProductDetail, Variant, VariantOption, CategoryDetail, BrandDetail, ListPageDetail, FiltersMetadata, ProductSettings, HomePage, HomeSection …
src/lib/api/types/cart.ts           # Cart, CartLine … (cart-address.md §4)
src/lib/api/types/search.ts         # SearchResults, SearchSuggestions
src/features/catalog/api.ts         # server loaders
src/features/catalog/listing-params.ts
src/features/catalog/components/    # product-card, product-grid, listing/*, filters/*, sort, …
src/features/home/                  # sections/*
src/features/product/               # variant.ts (algorithm), components/*
src/features/cart/                  # api.ts (client), hooks.ts, components (add-to-cart-button, mini-cart, cart-badge)
src/features/wishlist/              # hooks.ts, heart-button.tsx
src/features/quick-view/
src/features/compare/               # store.ts, compare-bar.tsx, compare-table.tsx
src/features/recently-viewed/       # store.ts, strip.tsx
src/features/search/                # suggest-box.tsx, search-overlay.tsx, results/*
src/app/(shop)/page.tsx
src/app/(shop)/product-category/[...path]/page.tsx
src/app/(shop)/brand/page.tsx, brand/[slug]/page.tsx
src/app/(shop)/product/[slug]/page.tsx
src/app/(shop)/product/list/page.tsx, product/list/[slug]/page.tsx
src/app/(shop)/search/page.tsx
src/app/(shop)/compare/page.tsx
tests/unit/** , tests/e2e/catalog/**
```

**Route note:** `src/app/(shop)/product/list/` and `src/app/(shop)/product/[slug]/` coexist. Next.js gives the static segment `list` priority over `[slug]`. A product whose slug is literally `list` is unreachable; this is reported in `BACKEND-ISSUES.md`.

---

### Task 1: Catalog types, server loaders and listing parameters

**Files:**
- Create: `src/lib/api/types/catalog.ts`, `src/lib/api/types/search.ts`, `src/features/catalog/api.ts`, `src/features/catalog/listing-params.ts`, `src/lib/url/slug.ts`
- Test: `tests/unit/catalog/listing-params.test.ts`, `tests/unit/catalog/api.test.ts`, `tests/unit/url/slug.test.ts`

**Interfaces:**
- Consumes: `apiFetch`, `ApiError`, `Paginated` (Plan 1).
- Produces:
  - Types: exactly the interfaces in `product.md` §3 and §4, plus the homepage types in `content.md` §2.
  - `normalizeSlug(raw: string): string | null` (decode once safely, then `encodeURIComponent` per segment; `null` on malformed input)
  - `getProductSettings(): Promise<ProductSettings>` (defaults `{ paginator_number: 24, show_out_of_stock_label: true, related_items_display_status: true, related_items_number: 8 }` on failure)
  - `getHomePage(): Promise<HomePage>` (throws on failure, so the error boundary shows)
  - `getCategory(slug)`, `getBrand(slug)` and `getListPage(slug)`, each returning the detail or `null` on 404 and throwing otherwise
  - `getBrands(): Promise<BrandCard[]>` (all pages)
  - `getProductList(q: ListingApiQuery): Promise<Paginated<ProductCard>>`
  - `getFilters(ctx: { category?: string; brand?: string; list?: string }): Promise<FiltersMetadata | null>` (`null` on 404)
  - `getProductDetail(slug): Promise<ProductDetail | null>`
  - `type ListingApiQuery = { search?: string; category?: string; brand?: string[]; attribute_values?: number[]; min_price?: number; max_price?: number; in_stock?: boolean; is_special?: boolean; has_discount?: boolean; special_first?: boolean; sort?: SortValue; page?: number; limit?: number; list?: string }`
  - `parseListingParams(sp: Record<string, string | string[] | undefined>, opts?: { context?: ListingContext }): ListingApiQuery`, where `type ListingContext = { category?: string; brand?: string; list?: string }`
    - drops unknown keys and invalid values (bad sort, non-numeric prices, booleans other than `true`/`false`/`1`/`0`);
    - `brand` and `attribute_values` come comma-separated;
    - `page < 1` drops the page;
    - the route context wins: each key present in `opts.context` replaces the URL value (`brand` becomes `[context.brand]`), while keys not in the context stay URL filters, so `brand=apple` still filters a category page and `category=…` still filters a brand page.
  - `toSearchParams(q: ListingApiQuery): URLSearchParams` (stable key order, omits defaults)

- [ ] **Step 1: Write failing tests.**
  - `parseListingParams({ sort: 'bad', min_price: 'abc', in_stock: 'yes', brand: 'samsung,,apple', attribute_values: '10005,x,10015', page: '0' })` → `{ brand: ['samsung', 'apple'], attribute_values: [10005, 10015] }`.
  - `parseListingParams({ has_discount: 'true', sort: 'price-asc', page: '2' })` → `{ has_discount: true, sort: 'price-asc', page: 2 }`.
  - `toSearchParams` round-trips that value to `has_discount=true&page=2&sort=price-asc` in sorted key order.
  - `normalizeSlug('%DA%AF%D9%88%D8%B4%DB%8C')` equals `normalizeSlug('گوشی')`, and `normalizeSlug('abc%ZZ')` → `null`.
  - With mocked fetch, `getFilters({ category: 'nope' })` resolves `null` on a 404 envelope.
  - `getProductSettings` returns the defaults when fetch rejects.
- [ ] **Step 2:** FAIL. **Step 3:** Implement. Loaders are `server-only`, wrapped in React `cache()`, with the lifetimes from the Global Constraints and tags `product:<slug>`, `category:<slug>`, `brand:<slug>`, `list:<slug>`, `home` and `catalog`. **Step 4:** PASS.
- [ ] **Step 5:** Commit: `feat: catalog types, server loaders and listing parameter parsing`.

### Task 2: Product card, grid, wishlist heart and client stores

**Files:**
- Create: `src/features/catalog/components/product-card.tsx`, `product-grid.tsx`, `product-card-skeleton.tsx`, `src/features/wishlist/hooks.ts`, `src/features/wishlist/heart-button.tsx`, `src/features/compare/store.ts`, `src/features/recently-viewed/store.ts`
- Test: `tests/unit/catalog/product-card.test.tsx`, `tests/unit/compare/store.test.ts`, `tests/unit/recently-viewed/store.test.ts`, `tests/unit/wishlist/hooks.test.tsx`

**Interfaces:**
- Consumes: `ProductCard`, `Price`, `Rating`, `Badge`, `SmartImage`, `Countdown`, `useSession`, `useStoreConfig`, `bffFetch`.
- Produces:
  - `ProductCard({ product: ProductCard, priority?: boolean, showOutOfStockLabel: boolean, onQuickView?: (slug: string) => void, addSlot?: ReactNode })`. Server-renderable; its interactive parts (heart, compare toggle, add button) are client leaves.
  - `ProductGrid({ products, showOutOfStockLabel, emptyState? })`: 2 columns on phone, 3 on `md`, 4 on `lg`, 5 on `2xl`.
  - `useWishlistIds(): { ids: Set<number>; isLoading: boolean }`. Only when `hasSession`: it reads `GET product/wishlist/list/?limit=100` and follows pages.
  - `useToggleWishlist()`: an optimistic toggle by product `slug` and `id`.
    - It calls `POST` or `DELETE product/detail/<slug>/wishlist/` (the DELETE returns 204).
    - On error it reverts and shows the error detail.
    - Without a session it routes to `/login/?next=<current>`.
  - `HeartButton({ productId, slug, size? })`: animates on toggle, with `aria-pressed` and the label «افزودن به علاقه‌مندی‌ها» or «حذف از علاقه‌مندی‌ها».
  - `useCompare` (Zustand persist key `ff-compare`, max 4): `{ items: CompareItem[]; add(item): 'added' | 'full' | 'exists'; remove(slug); clear() }`, where `CompareItem = { slug; name; image; categoryId: number | null }`.
  - `useRecentlyViewed` (persist key `ff-recent`, max 20, most-recent first, dedupe by slug): `{ items: RecentItem[]; record(item: RecentItem); clear() }`, where `RecentItem` holds the `ProductCard` subset needed to render a card.

**Card design** (spec §8.3; data only from the card):
- Square image with a skeleton until load. The badge pill uses `badge_color` and `text_color`. A sale pill shows the percent. The heart sits at the top-start corner and compare at the top-end, both visible on hover on desktop and always on touch.
- Two-line clamped name, then the `default_variant_attributes` chips (at most 2).
- Rating (or «بدون امتیاز»), then the price block. The countdown shows only when `discount_time_remaining` is set and in the future.
- When `!in_stock && showOutOfStockLabel`, a «ناموجود» overlay label is shown and the price is muted.
- The whole card is one link to `/product/<slug>/`; the inner buttons stop propagation.
- Hover lift with `shadow-raised` and an image scale of 1.03, using `motion-safe` only.

- [ ] **Step 1: Write failing tests.**
  - The card shows `۲۵٪`, the struck original and the final price when `has_discount`.
  - It shows «ناموجود» only when `!in_stock && showOutOfStockLabel`.
  - It links to `/product/samsung-galaxy-s25-ultra/`.
  - The compare store rejects a fifth item with `'full'` and an existing slug with `'exists'`.
  - The recently-viewed store dedupes, keeps 20, and puts the newest first.
  - `useToggleWishlist` reverts optimistic state when the mutation rejects.
- [ ] **Step 2:** FAIL. **Step 3:** Implement. **Step 4:** PASS.
- [ ] **Step 5:** Commit: `feat: product card, grid, wishlist heart, compare and recently-viewed stores`.

### Task 3: Cart core — client API, hooks, add-to-cart button, badge and mini-cart

**Files:**
- Create: `src/lib/api/types/cart.ts`, `src/features/cart/api.ts`, `src/features/cart/hooks.ts`, `src/features/cart/components/add-to-cart-button.tsx`, `src/features/cart/components/cart-badge.tsx`, `src/features/cart/components/mini-cart.tsx`, `src/features/cart/components/added-to-cart-toast.tsx`
- Modify: `src/components/layout/header-actions.tsx` (render `CartBadge` and open the mini-cart), `src/components/layout/mobile-bottom-nav.tsx` (badge on the cart tab)
- Test: `tests/unit/cart/hooks.test.tsx`, `tests/unit/cart/add-to-cart-button.test.tsx`

**Interfaces:**
- Consumes: `bffFetch`, `ApiError`, `useFeature`, `notify`, `Sheet`, `QuantityStepper`, `Price`, `SmartImage`.
- Produces:
  - `Cart` and `CartLine` types exactly as in `cart-address.md` §4.
  - `cartApi.get()`, `cartApi.add(variant: number, quantity: number)`, `cartApi.setQuantity(variant, quantity)`, `cartApi.remove(variant)` and `cartApi.clear()` (all through the BFF; the cart token is handled by the BFF cookie).
  - `useCart(): UseQueryResult<Cart>` (query key `['cart']`, `staleTime: 0`, refetch on focus).
  - `useAddToCart(): { add(variant: number, quantity: number, meta: { name: string; image: string }): Promise<void>; isPending: boolean }`. On success it sets the `['cart']` cache from the response and shows `AddedToCartToast` (image, name, «مشاهدهٔ سبد خرید» link to `/cart/`). On `ApiError` it shows `err.detail` and rethrows nothing.
  - `useUpdateCartLine()` and `useRemoveCartLine()`. The stepper debounces 400 ms and sends the final value.
  - `cartCount(cart: Cart | undefined): number` = the sum of line quantities.
  - `AddToCartButton({ variantId: number | null, quantity: number, product: { name: string; image: string }, disabled?, size?, fullWidth?, label? })`. Default label is `t('add_to_cart')`. With `variantId === null` it is disabled and says «ناموجود».
  - `MiniCart`: a sheet listing lines (image, name, variant name, stepper, remove), the payable total from the API, and buttons «ثبت سفارش» (`/checkout/`) and «مشاهدهٔ سبد خرید» (`/cart/`). Its empty state links to the home page.

- [ ] **Step 1: Write failing tests** (mock `bffFetch`).
  - A successful `add` updates the `['cart']` data, and `cartCount` reflects the new quantity.
  - A rejected `add` with `cart_item_limit_exceeded` shows the detail via `notify.error` and leaves the cache unchanged.
  - `AddToCartButton` shows a spinner while pending and has `aria-busy`.
  - With `variantId=null` the button is disabled and labelled «ناموجود».
- [ ] **Step 2:** FAIL. **Step 3:** Implement. Read `cart-address.md` §2 and §3.1–3.5 first. **Step 4:** PASS.
- [ ] **Step 5: Live check** with `pnpm dev`. As a guest, run `add` for variant 10001 through the browser BFF (a quick Playwright script). Expect the `ff_cart` cookie to be set and the badge to show `۱`. Put the output in the report.
- [ ] **Step 6:** Commit: `feat: cart core with BFF client, hooks, badge and mini-cart`.

### Task 4: Homepage sections

**Files:**
- Create in `src/features/home/sections/`: `section-renderer.tsx`, `slider-section.tsx`, `banner-group-section.tsx`, `product-carousel-section.tsx`, `category-grid-section.tsx`, `post-carousel-section.tsx`, `rich-text-section.tsx`, `section-header.tsx`; plus `src/features/recently-viewed/strip.tsx`, `src/features/content/rich-content.tsx`, `src/lib/links/store-link.tsx`
- Modify: `src/app/(shop)/page.tsx`
- Test: `tests/unit/home/section-renderer.test.tsx`, `tests/e2e/catalog/home.spec.ts`

**Interfaces:**
- Consumes: `getHomePage`, `getProductSettings`, `ProductCard`, `Carousel`, `SmartImage`.
- Produces:
  - `SectionRenderer({ sections: HomeSection[] })` switches on `type`. Unknown types render `null`.
  - `StoreLink({ href, children, className, newTab? })`: an internal `/…` href gives Next `Link`; an absolute href gives `<a rel="noopener">`. A short-link href (`/s/<code>`, tested with `isShortLinkPath()` from `@/lib/links/short-link`, as `MenuLink` does) is always a plain `<a>`: never a Next `Link`, since its prefetch would count a visit on every page view.
  - `RichContent({ html, className? })` renders trusted backend HTML in `.rich-content`, and intercepts clicks on root-relative links for client-side navigation.
  - `seeAllHref(section: HomeSection): string | null` follows `content.md` §6.1 and §6.5: the operator link wins; otherwise `/product/list/?${new URLSearchParams(listing_query)}`.

Rendering rules: `content.md` §6.3–6.8. LCP rule: only the first image of the first image section gets `priority`. The slider autoplays every 6 s, pauses on hover, focus and touch, and is not autoplayed under reduced motion. Banner grid by count, per the table in `content.md` §6.4. Category grid: a circle or rounded tile with image and name, in a horizontal scroller on mobile. The post carousel uses a compact post card (image, title, date) linking to `/blog/<slug>/`. The page metadata comes from the homepage SEO fields (`title: { absolute: page_title }` when non-empty). After the sections comes the `RecentlyViewedStrip` (client; renders nothing when empty).

**Carousel rails:** a product (or post) rail inside `Carousel` must reserve inline padding for the arrows (at least 56 px each side while arrows show) or place the arrows outside the track: the 44 px arrows sit 8 px from the edges and otherwise overlap the first and last cards from `sm` up.

- [ ] **Step 1: Write failing tests.**
  - `SectionRenderer` with an unknown type renders nothing.
  - A product carousel with `listing_query: { sort: 'sale', in_stock: 'true', special_first: 'false' }` and `link: null` renders a «مشاهدهٔ همه» link to `/product/list/?sort=sale&in_stock=true&special_first=false`.
  - A slider item with `mobile_image` renders a `<source media="(max-width: 767px)">`.
  - `StoreLink` with `href="/s/phone-fest/"` renders a plain `<a>` (no Next `Link`), and with `href="/product/x/"` a Next `Link`.
- [ ] **Step 2:** FAIL. **Step 3:** Implement. **Step 4:** PASS.
- [ ] **Step 5: e2e `home.spec.ts`** (all projects):
  - the first slide title «کمپین جمعهٔ سیاه» is visible;
  - the carousel «پیشنهاد ویژهٔ فایرفلای» shows product cards;
  - clicking a card navigates to its product page (Plan 2 Task 7 may not exist yet, so assert the URL only).

  Take screenshots at 375, 768 and 1440 px and review them.
- [ ] **Step 6:** Commit: `feat: homepage sections renderer with slider, banners, carousels and grids`.

### Task 5: Listing experience — filters, sort, chips, pagination

**Files:**
- Create in `src/features/catalog/components/listing/`: `product-listing.tsx` (server wrapper), `listing-toolbar.tsx`, `sort-select.tsx`, `filter-panel.tsx`, `filter-sheet.tsx`, `price-range.tsx`, `facet-list.tsx`, `active-filter-chips.tsx`, `load-more.tsx`, `use-listing-url.ts`
- Test: `tests/unit/catalog/use-listing-url.test.tsx`, `tests/unit/catalog/facet-list.test.tsx`

**Interfaces:**
- Consumes: `getProductList`, `getFilters`, `parseListingParams`, `toSearchParams`, `ProductGrid`, `Pagination`, `Sheet`, `Checkbox`, `Chip`.
- Produces:
  - `ProductListing({ context: { category?: string; brand?: string; list?: string }, searchParams, basePath: string, defaultSort?: SortValue, title?: ReactNode })`. A Server Component that fetches the list and filters in parallel and renders:
    - a toolbar (result count «۱۲۳ کالا», sort, and a «فیلترها» button on mobile with the active count);
    - a desktop sidebar with collapsible facet groups;
    - the active chips with «حذف همه»;
    - the grid, real-link pagination and a client «نمایش بیشتر» button that appends the next page.
  - Facets: category children (hidden at 0), brands (searchable list when more than 8), attributes (colour swatches for `input_type === 'color'`, pattern images, otherwise checkboxes), the price range slider (bounds from `filters.price`), and toggles «فقط کالاهای موجود» (`in_stock=true`), «فقط تخفیف‌دارها» (`has_discount=true`) and «کالاهای ویژه» (`is_special=true`).
  - `useListingUrl()`: `{ query: ListingApiQuery; set(patch: Partial<ListingApiQuery>): void; clear(): void }`. It pushes `router.replace` with `scroll: false`, resets `page`, and wraps in `startTransition` so the grid shows a pending state.
  - The sort dropdown comes from `filters.sort_options`. The empty state is «محصولی با این فیلترها یافت نشد» with «حذف فیلترها».
  - Page-out-of-range: an API 404 on the list → `notFound()`.

- [ ] **Step 1: Write failing tests.**
  - `useListingUrl().set({ brand: ['apple'] })` on `?page=3&sort=sale` produces `?brand=apple&sort=sale` (page dropped).
  - `FacetList` hides category options with `product_count === 0` and renders colour swatches with `aria-label` equal to the value name.
- [ ] **Step 2:** FAIL. **Step 3:** Implement. **Step 4:** PASS.
- [ ] **Step 5:** Commit: `feat: product listing with URL-driven filters, sort, chips and pagination`.

### Task 6: Category, brand, curated-list and generic listing routes

**Files:**
- Create: `src/app/(shop)/product-category/[...path]/page.tsx`, `src/app/(shop)/brand/page.tsx`, `src/app/(shop)/brand/[slug]/page.tsx`, `src/app/(shop)/product/list/page.tsx`, `src/app/(shop)/product/list/[slug]/page.tsx`, `src/features/seo/json-ld.tsx`, `src/features/seo/metadata.ts`, `src/features/catalog/components/listing-hero.tsx`, `src/features/catalog/components/subcategory-chips.tsx`, `src/features/catalog/components/consider-before-buying.tsx`, `src/features/catalog/components/admin-faq.tsx`
- Test: `tests/unit/seo/metadata.test.ts`, `tests/unit/seo/json-ld.test.tsx`, `tests/e2e/catalog/listing.spec.ts`

**Interfaces:**
- Produces:
  - `JsonLd({ data: object | object[] })` renders one `<script type="application/ld+json">` per object, with `<` escaped as `<`.
  - `seoMetadata(input: { pageTitle?: string; description?: string; keywords?: string; canonical?: string | null; path: string; image?: string | null; noindex?: boolean }): Metadata`
    - title absolute when present;
    - empty strings omitted (never `undefined` keys that wipe the layout defaults);
    - canonical falls back to `path`;
    - Open Graph (`type: 'website'`, `locale: 'fa_IR'`, image) and Twitter `summary_large_image`.
  - Routes:
    - **Category:** fetch by the last slug. On `null` → `notFound()`. If `data.path !== requested path` → `permanentRedirect('/product-category/' + data.path + '/' + search)`, which is a 308. The hero shows name, short description and image. Then subcategory chips (from `filters.categories`), then `ProductListing` with `context.category` and `defaultSort = default_sorting`. Below the grid: `content` (`RichContent`), consider-before-buying, the admin FAQ accordion. Breadcrumbs, plus JSON-LD from `breadcrumb_structured_data`.
    - **Brand:** hero with logo (70 px) and name, then the listing with context brand, then content and breadcrumb JSON-LD.
    - **Brands index `/brand/`:** a grid of all brands with logo and name.
    - **List page:** as `product.md` §6.6.
    - **Generic `/product/list/`:** the title is built from the params (`has_discount` → «تخفیف‌ها», `sort=sale` → «پرفروش‌ترین‌ها», `sort=date-desc` → «جدیدترین‌ها», `is_special` → «پیشنهادهای ویژه», otherwise «همهٔ محصولات»). Robots `noindex, follow`. Canonical is self without query (only on the bare path; a filtered URL has none).
    - Listings with any query parameter other than `page` use `robots: { index: false, follow: true }` and **no canonical** (final-review ruling: noindex plus a canonical to another URL is a mixed signal; the same goes for a filtered generic listing and `/search/?q=`). Paginated pages keep `index` with a self canonical including `page`, and their title ends with «- صفحهٔ N» (Persian digits).
    - An empty `page_description` falls back to the entity's own text (`short_description`, `description`, then `content` as plain text, about 155 characters), never the shop's slogan.

- [ ] **Step 1: Write failing tests.**
  - `seoMetadata({ pageTitle: 'X', description: '', path: '/a/' })` has `title.absolute === 'X'`, no `description` key and `alternates.canonical === '/a/'`.
  - `JsonLd` escapes `</script>` inside a string.
- [ ] **Step 2:** FAIL. **Step 3:** Implement. **Step 4:** PASS.
- [ ] **Step 5: e2e `listing.spec.ts`:**
  - `/product-category/digital/mobile-phone/` shows the heading «گوشی موبایل» and at least 6 cards.
  - Choosing brand «اپل» in filters updates the URL with `brand=apple` and the grid.
  - `/product-category/mobile-phone/` → 308 to `/product-category/digital/mobile-phone/`.
  - `/brand/samsung/` lists products.
  - `/product/list/flagship-phones/` shows 6 products.
  - `/product/list/?has_discount=true` shows the empty state (dev has no discounts) with heading «تخفیف‌ها».
  - `?page=999` on a category returns 404.
  - Mobile: the filter sheet opens and closes.

  Take screenshots of the category page at 375, 768 and 1440 px and review them.
- [ ] **Step 6:** Commit: `feat: category, brand, curated list and generic listing pages with SEO`.

### Task 7: Product page — data, gallery, variant picker, price and buy box

**Files:**
- Create: `src/features/product/variant.ts`, and in `src/features/product/components/`: `product-gallery.tsx`, `gallery-lightbox.tsx`, `product-summary.tsx`, `variant-picker.tsx`, `buy-box.tsx`, `sticky-buy-bar.tsx`, `notify-me.tsx`, `wholesale-note.tsx`, `share-button.tsx`, `record-recently-viewed.tsx`, `product-provider.tsx` (client context holding the selected variant)
- Create: `src/app/(shop)/product/[slug]/page.tsx`
- No `loading.tsx` for this segment (R9): a segment `loading.tsx` streams the page and turns `notFound()` into a 200 soft 404. Await the product and call `notFound()` before any `<Suspense>`; stream only secondary sections (reviews, related products) through in-page `<Suspense>`.
- Test: `tests/unit/product/variant.test.ts`, `tests/unit/product/buy-box.test.tsx`, `tests/unit/product/notify-me.test.tsx`

**Interfaces:**
- Produces:
  - `type Selection = Map<number, number>`
  - `initialSelection(options, variants, defaultId): Selection`
  - `resolveVariant(variants, sel): Variant | null`
  - `valueState(variants, sel, axisId, valueId): 'buyable' | 'out_of_stock' | 'no_such_combo'`
  - `selectValue(options, variants, sel, axisId, valueId): Selection`, with the auto-adjust rule from `product.md` §5.2: pick the variant containing the clicked value with the most matches to the current selection, preferring `in_stock`, then server order.
  - `ProductProvider({ product: ProductDetail, children })` and `useProduct(): { product; selection; variant: Variant | null; select(axisId, valueId); quantity; setQuantity }`.

**Page composition:**
- Server: `getProductDetail(slug)` → `notFound()` on `null`. Metadata via `seoMetadata` with OG image `product.image`. JSON-LD: each `structured_data` element plus `breadcrumb_structured_data`. If `is_unpublished`, add a banner and `noindex`.
- Desktop: a two-column grid.
  - Gallery (start): main image plus a thumbnail rail. Clicking opens the lightbox (swipe and keyboard arrows, natural size).
  - Summary (end): breadcrumb, brand link, name, `extra_detail`, rating link to the reviews, `product_code`, highlighted specs (at most 5), and the variant picker.
  - The sticky buy box in its own card: price block with countdown, stock text (`low_stock_quantity > 0` gives «تنها {n} عدد باقی مانده»), packing note, quantity stepper (min/max from the variant), add to cart, buy now (add, then `router.push('/checkout/')`), the wholesale note when `enable_major`, and wishlist, compare and share.
- Mobile: full-width swipe gallery with dots, the summary, then a fixed `StickyBuyBar` at the bottom (price and add) that hides the bottom navigation on this route.
- Variant picker renderers per `input_type`, as in `product.md` §5.2. Out-of-stock values are struck through but selectable; `no_such_combo` values are dimmed and auto-adjust when clicked. A single-value axis shows as static text. Selecting a value updates the image, price, stock and limits with no request.
- Notify-me: only when the product-level `in_stock === false` and the feature `stock_notifications` is enabled. Logged-in users send `{}`; guests enter name and mobile. Contract in `product.md` §3.14.
- `RecordRecentlyViewed` records the card subset on mount.

- [ ] **Step 1: Write failing tests** with the S25 Ultra variant fixture copied from the live API (`GET /api/v1/product/detail/samsung-galaxy-s25-ultra/`) into `tests/fixtures/product-s25.json`:
  - `initialSelection` equals the values of variant `default_variant_id`.
  - `valueState` for silver is `'out_of_stock'` or `'no_such_combo'`, matching the fixture's variants.
  - `resolveVariant` returns `null` for a non-existent combination.
  - `selectValue` auto-adjusts to an existing variant.
  - The `BuyBox` add button is disabled with «این ترکیب موجود نیست» when the variant is `null`.
  - `NotifyMe` does not render when product `in_stock` is true, even if the selected variant is out of stock.
- [ ] **Step 2:** FAIL. **Step 3:** Implement. **Step 4:** PASS.
- [ ] **Step 5:** Commit: `feat: product page with gallery, variant picker and buy box`.

### Task 8: Product page — content, specifications, reviews and questions, related

**Files:**
- Create in `src/features/product/components/`: `product-sections.tsx` (in-page tab bar that scrolls to sections, sticky under the header), `description-section.tsx`, `specifications-table.tsx`, `bundle-items.tsx`, `related-products.tsx`, `reviews/rating-summary.tsx`, `reviews/comment-thread.tsx`, `reviews/comment-list.tsx`, `reviews/review-form.tsx`, `reviews/question-form.tsx`, `reviews/use-comments.ts`
- Modify: `src/app/(shop)/product/[slug]/page.tsx`
- Test: `tests/unit/product/specifications-table.test.tsx`, `tests/unit/product/review-form.test.tsx`, `tests/e2e/catalog/product.spec.ts`

**Interfaces:**
- Produces:
  - `useComments(slug, type: 'comment' | 'question')`: an infinite query over `product/detail/<slug>/comment/list/?comment_type=…&page=…`, loaded when the section enters the viewport.
  - `ReviewForm({ slug, parentId?: number, onDone })`:
    - fields: rating (1–5 stars, optional), title, review (required), positive and negative points (dynamic list, at most 10), and name/email for guests only;
    - a honeypot `website` field placed off-screen;
    - the payload omits empty optionals;
    - a 201 shows `msg` and resets the form, with no optimistic insert;
    - errors map to fields via `fieldErrors()`;
    - the `product_comments` feature switch hides the form, leaving the list.
  - `QuestionForm`: the same with `comment_type: 'question'`.
  - `CommentThread`: renders replies oldest-first, caps indentation at 2 levels, and shows badges «پاسخ فروشنده» (`is_user_admin`), «خریدار» (`is_verified_buyer`) and «شما».

**Sections in order:**
1. «معرفی»: `description` as plain text with pre-wrap, plus `content` as `RichContent` behind a «ادامهٔ مطلب» expander when tall.
2. «مشخصات»: the spec rows rule from `product.md` §5.7.
3. «دیدگاه‌ها»: the rating summary (average, count, 5→1 bars), sorted list and «ثبت دیدگاه».
4. «پرسش‌ها»: list and «ثبت پرسش».
5. Consider-before-buying and the admin FAQ, when present.
6. The bundle contents when `is_collection`.
7. Related products in a carousel, honouring `related_items_display_status`. The rail reserves inline padding for the arrows or places them outside the track (Task 4, «Carousel rails»): the 44 px arrows 8 px from the edges otherwise overlap the card edges from `sm` up.
8. The recently-viewed strip, excluding the current product.

- [ ] **Step 1: Write failing tests.**
  - The specs table skips fully empty rows and joins `values` with «، ».
  - `ReviewForm` for a guest without a name surfaces the backend `invalid` error under the name field (mocked).
  - The review payload omits `email` when it is empty.
- [ ] **Step 2:** FAIL. **Step 3:** Implement. **Step 4:** PASS.
- [ ] **Step 5: e2e `product.spec.ts`:**
  - `/product/samsung-galaxy-s25-ultra/` shows the name heading, a price with «تومان», and a variant picker with the colour axis.
  - Selecting another storage value changes the price or keeps it consistent with the fixture.
  - «افزودن به سبد خرید» updates the cart badge.
  - The reviews section lists at least one review.
  - `/product/chips-pack-family/` shows the notify-me form.
  - `/product/does-not-exist/` returns 404.

  Take screenshots at 375, 768 and 1440 px and review them.
- [ ] **Step 6:** Commit: `feat: product page content, specifications, reviews, questions and related products`.

### Task 9: Quick view, compare and recently viewed

**Files:**
- Create: `src/features/quick-view/quick-view.tsx` (dialog on `md` and up, bottom sheet below), `src/features/quick-view/use-quick-view.ts`, `src/features/compare/compare-bar.tsx`, `src/features/compare/compare-table.tsx`, `src/app/(shop)/compare/page.tsx`
- Modify: `src/features/catalog/components/product-card.tsx` (wire quick view and compare), the shop layout (mount `QuickViewHost` and `CompareBar`)
- Test: `tests/unit/compare/compare-table.test.tsx`, `tests/e2e/catalog/extras.spec.ts`

**Interfaces:**
- Produces:
  - `useQuickView(): { open(slug: string): void }` (global host).
  - The quick view loads `GET product/detail/<slug>/` through the BFF and renders the gallery (swipe), name, rating, `VariantPicker`, price, stepper, `AddToCartButton` and «مشاهدهٔ جزئیات کامل».
  - `buildCompareRows(products: ProductDetail[]): { label: string; values: string[] }[]` builds the union of spec rows by `attribute_id` in first-seen order. Missing values are «—».
  - `CompareBar`: a floating bar that appears when there is at least one item. It shows thumbnails, «مقایسه» (enabled at 2+) and «پاک کردن».
  - `/compare/` reads the store client-side, fetches the details through the BFF, and shows a sticky header row with image, name, price and add-to-cart. It has a «فقط تفاوت‌ها» toggle and horizontal scroll on mobile with the first column sticky. The page is `noindex`.
  - Mixed categories: when adding a product whose deepest category differs from the first item's, show «این کالا با کالاهای فهرست مقایسه هم‌دسته نیست» and still allow it.

- [ ] **Step 1: Write failing tests.** `buildCompareRows` with two products (fixtures) produces the union, and the «فقط تفاوت‌ها» filter removes rows whose values are all equal.
- [ ] **Step 2:** FAIL. **Step 3:** Implement. **Step 4:** PASS.
- [ ] **Step 5: e2e `extras.spec.ts`:**
  - From a category grid, quick view on a variable product opens the picker and adds to cart.
  - Adding two products to compare shows the bar; «مقایسه» opens `/compare/` with both names.
  - After visiting two products, the home page shows «بازدیدهای اخیر» with them.
- [ ] **Step 6:** Commit: `feat: quick view, product comparison and recently viewed`.

### Task 10: Search — suggestions, mobile overlay and results page

**Files:**
- Create: `src/features/search/use-suggestions.ts`, `src/features/search/suggest-box.tsx`, `src/features/search/search-overlay.tsx` (mobile full screen), `src/features/search/recent-searches.ts` (localStorage, max 8), `src/features/search/results/search-results.tsx`, `src/features/search/results/result-group.tsx`, `src/app/(shop)/search/page.tsx`
- Modify: `src/components/layout/header-search-form.tsx` (desktop uses `SuggestBox`; mobile opens `SearchOverlay`)
- Test: `tests/unit/search/use-suggestions.test.tsx`, `tests/e2e/catalog/search.spec.ts`

**Interfaces:**
- Produces:
  - `useSuggestions(q: string): { data: SearchSuggestions | null; isLoading }`
    - normalises with `toLatinDigits` and trims;
    - no request under 2 characters;
    - 250 ms debounce;
    - `AbortController` per keystroke;
    - responses for stale queries are ignored;
    - errors become `null`.
  - `SuggestBox`: a combobox (`role="combobox"`, listbox options, arrow navigation, Enter goes to the highlighted item or submits to `/search/?q=`). Groups: products (thumbnail and name), categories and brands. Shows «جستجوی «{q}» در همهٔ محصولات». Recent searches show when the input is empty and focused.
  - `/search/?q=`: server-rendered, `cache: 'no-store'`. Calls `search/?q=` with the visitor's `X-Forwarded-For`. Shows `data.query` in the heading «نتایج جستجو برای «…»» and the groups (products as a grid, with categories, brands, posts and pages as compact lists). Each group's «مشاهدهٔ همه» appears when `count > items.length` and `listing_query` is set; product groups link to `/product/list/?…`. An empty state when `total === 0`, with tips and popular categories. `noindex`.
  - An empty or whitespace-only `q` (`/search/`, `/search/?q=%20`) never calls `search/`: the header's search form may prefetch `/search/`, and every search call is logged by the backend. It renders the empty/tips state only.

- [ ] **Step 1: Write failing tests** with fake timers and mocked `bffFetch`:
  - typing `'گ'` sends no request;
  - typing `'گوش'` quickly then `'گوشی'` sends exactly one request, for `'گوشی'`, after 250 ms;
  - a late response for an older query is ignored;
  - a rejected request yields `data: null` without throwing;
  - the `/search/` page with `q` missing, empty or only whitespace renders the tips state and makes no `search/` call (mocked `apiFetch` not called).
- [ ] **Step 2:** FAIL. **Step 3:** Implement. **Step 4:** PASS.
- [ ] **Step 5: e2e `search.spec.ts`:**
  - typing «سامسونگ» in the header shows a suggestion list containing «سامسونگ», and Enter goes to `/search/?q=…` showing product results;
  - mobile: tapping the search field opens the overlay.
- [ ] **Step 6:** Commit: `feat: search suggestions, mobile search overlay and results page`.

### Task 11: Catalog quality gate

**Files:**
- Modify: as needed for fixes found by the gate.
- Test: `tests/e2e/catalog/*.spec.ts` (all projects)

- [ ] **Step 1:** Run `pnpm typecheck && pnpm lint && pnpm test && pnpm build && pnpm test:e2e`. All pass.
- [ ] **Step 2: Visual pass.** Use Playwright to screenshot the home, category, product (variable and simple), brand, search, compare and quick-view pages at 375, 768 and 1440 px into the report directory. Review each one for alignment, RTL correctness, truncation, contrast and spacing. Fix what is off.
- [ ] **Step 3: Performance smoke.** `next build` output: First Load JS for `/product/[slug]` under 200 kB gzip. If it is over, lazy-load the lightbox, review forms, quick view and compare with `next/dynamic`.
- [ ] **Step 4:** Commit: `test: catalog e2e gate and visual polish`. Push to `origin main`.
