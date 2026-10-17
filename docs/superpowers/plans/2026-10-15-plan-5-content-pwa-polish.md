# Plan 5 — Content, PWA, SEO Audit and Release Polish — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the remaining customer-facing features:
- the blog (home, archive, categories, post, comments, reading list);
- content pages with comments;
- FAQ, contact and the linker page;
- dynamic content slots;
- the installable PWA with offline support.

Then run the release audits (SEO, accessibility, performance and full regression) so the storefront is production-ready.

**Architecture:** As in previous plans. Blog post detail is fetched **once** per render (the backend counts a view per GET), so metadata and page share one React `cache()` call. The service worker from Plan 3 (`/sw.js`) gains offline caching.

**Spec:** `docs/superpowers/specs/2026-10-15-storefront-design.md` (§8.11, §8.12 PWA, §8.13, §9). API contracts: `blog-faq-dashboard-notification.md` (§1 blog, §2 FAQ), `content.md` (§3 pages, §4 page comments, §7–§8 linker and contact), `auth-settings.md` §7.8–7.11 (dynamic content), `seo-cache-deploy.md` (§7 SEO matrix, §13 checklists).

## Global Constraints

Everything in Plans 1–4's Global Constraints, plus:

- Account pages live under `src/app/(shop)/account/…` (Plan 3 ruling P3-R1); the reading list replaces the «به‌زودی» placeholder at `src/app/(shop)/account/reading-list/`. Every new per-visitor query key (the reading list, blog comment lists marked `is_current_user`…) is registered in `SESSION_QUERIES` or `VIEWER_AWARE_QUERIES` (`src/lib/session/viewer-queries.ts`) and listed in `tests/unit/session/session-query-keys.test.tsx`, as Plan 4 states.

- Blog routes respect the `blog` feature. When it is off, blog routes render a friendly «وبلاگ موقتاً در دسترس نیست» page with HTTP 503, and blog links in storefront-owned UI are hidden.
- Comment forms (blog, pages) use the honeypot `website` field, omit empty optionals, never insert optimistically, and show the 201 `msg`.
- Blog category URLs are canonicalised to `data.path` with a 308, as for product categories.
- JSON-LD is always escaped (`<` → `<`).
- The service worker never caches `/api/bff/*`, `/account/*`, `/cart/`, `/checkout/`, `/payment/*`, `/order/*` or any non-GET request.

## Review Focus

1. **The blog switch is turned off while a user is on a post** (503 `feature_disabled`). The page shows the operator's reason, not a crash. Test in Task 1.
2. **Post views are double-counted.** The detail endpoint must be called exactly once per request. Test in Task 2 (the mocked loader is called once for metadata plus page).
3. **Offline navigation to an uncached page** shows the offline page, while a cached page still renders. Test in Task 6 (e2e with `context.setOffline(true)`).
4. **Contact form with only a phone number, a non-mobile phone, or a stale subject.** `contact_channel_required`, `invalid_iranian_mobile` and stale-subject codes map to the right UI, and subjects refetch. Test in Task 4.
5. **Rich HTML from the operator** (FAQ answers, dynamic content) containing scripts or relative `/media` paths. It is sanitised and the paths are made absolute. Test in Task 4 (FAQ) and Task 5 (dynamic content).

---

### Task 1: Blog — home, archive and category pages

**Files:**
- Create: `src/lib/api/types/blog.ts`, `src/features/blog/api.ts`, `src/features/blog/components/post-card.tsx`, `post-grid.tsx`, `blog-sidebar.tsx` (the `blog-sidebar` menu plus the category list), `blog-hero.tsx`, `reading-list-button.tsx`, `src/app/(shop)/blog/page.tsx`, `src/app/(shop)/blog/category/[...path]/page.tsx`, `src/app/(shop)/blog/unavailable.tsx`
- Test: `tests/unit/blog/api.test.ts`, `tests/unit/blog/post-card.test.tsx`

**Behaviour** (`blog-faq-dashboard-notification.md` §1.3, §1.4, §1.6, §1.8):
- Blog home: featured and composition from `blog/home/`, then the latest posts with pagination (`?page=`), a category chips row, and the sidebar.
- Category page: canonicalised path, header, posts filtered by `category`, and breadcrumbs with JSON-LD. Validate the category through its detail endpoint first, because the list ignores unknown slugs.
- Reading list button: only with a session; optimistic; DELETE returns 204.
- Post card: image, category, title, excerpt, author avatar and name, Jalali date, reading-list toggle.

- [ ] **Step 1: Write failing tests.** `getBlogCategory` returns `null` on 404, and a 503 `feature_disabled` maps to a `BlogUnavailableError`. `PostCard` renders the Jalali date and links to `/blog/<slug>/`.
- [ ] **Step 2:** FAIL. **Step 3:** Implement. **Step 4:** PASS. **Step 5:** Commit: `feat: blog home, archive and category pages`.

### Task 2: Blog post page, comments and reading list account page

**Files:**
- Create: `src/app/(shop)/blog/[slug]/page.tsx`, and in `src/features/blog/components/`: `post-article.tsx`, `post-toc.tsx` (built from the `h2`/`h3` in content; sticky on desktop, collapsible on mobile), `reading-progress.tsx`, `post-comments.tsx` (reuses the comment-thread pattern from Plan 2, adapted to the blog contract), `related-posts.tsx`; plus `src/app/(shop)/account/reading-list/page.tsx` (replaces the placeholder) and `src/features/account/reading-list/reading-list-page.tsx`
- Modify: remove the reading-list placeholder.
- Test: `tests/unit/blog/post-page.test.ts` (loader called once), `tests/unit/blog/post-toc.test.tsx`

**Behaviour:**
- Article: title, author, dates, reading time (from words ÷ 200, in Persian digits), the hero image, content (`RichContent` with heading anchors) and categories.
- Comments and questions: tabs; forms per `blog_comments`.
- Related posts.
- JSON-LD: the backend structured data plus breadcrumbs; `og:type` `article`.
- The reading list page lists saved posts with remove, sort and a category filter.

- [ ] **Step 1: Write failing tests.** A page and its metadata call `getPost` once (React `cache()`). The TOC extracts `h2` and `h3` with stable ids from a fixture.
- [ ] **Step 2:** FAIL. **Step 3:** Implement. **Step 4:** PASS. **Step 5:** Commit: `feat: blog post page with comments and reading list`.

### Task 3: Content pages with layouts and comments

**Files:**
- Create: `src/app/(shop)/page/[slug]/page.tsx`, `src/features/content/pages/content-page.tsx`, `page-comments.tsx`, `pages-aside.tsx`
- Test: `tests/unit/content/content-page.test.tsx`

**Behaviour** (`content.md` §3–§4):
- The `default`, `full_width` and `with_sidebar` layouts. The aside lists other pages.
- Comments block per `enable_comments` and the counts.
- SEO mapping with `meta_tags`: `og:*` as `property`, others through `metadata.other`.
- When the slug is `contact-us`, the contact form (Task 4) renders under the content.

- [ ] **Step 1: Write failing tests.** `with_sidebar` renders the aside. `meta_tags` with `og:image` render a `meta[property="og:image"]`. Comments are hidden when `enable_comments` is false and the counts are 0.
- [ ] **Step 2:** FAIL. **Step 3:** Implement. **Step 4:** PASS. **Step 5:** Commit: `feat: content pages with layouts, meta tags and comments`.

### Task 4: FAQ, contact and linker pages

**Files:**
- Create: `src/app/(shop)/faq/page.tsx`, `src/features/faq/faq-page.tsx`, `src/app/(shop)/contact-us/page.tsx`, `src/features/contact/contact-form.tsx`, `src/features/contact/contact-info.tsx`, `src/app/links/page.tsx` (its own minimal layout using the linker theme), `src/features/linker/linker-page.tsx`
- Test: `tests/unit/faq/faq-page.test.tsx`, `tests/unit/contact/contact-form.test.tsx`, `tests/unit/linker/linker-page.test.tsx`

**Behaviour:**
- FAQ: categories as tabs or a sticky chip row; accordion answers with sanitised HTML and absolute `/media`; client-side search filtering questions; FAQPage JSON-LD.
- Contact: the form (subjects, name, email, phone, message, honeypot), the store contact details, the map link and response hours. `/contact/` redirects to `/contact-us/` through `next.config` redirects (`permanent: true`).
- Linker: rendered per `content.md` §7 (theme colours, rounded edges, social position, thumbnails on the physical side, video embeds for Aparat and YouTube). `noindex` is not needed; it is a public page.

- [ ] **Step 1: Write failing tests.**
  - The FAQ sanitiser removes `<script>` and makes `/media/x.png` absolute.
  - The contact form without email and phone shows the `contact_channel_required` detail.
  - A `contact_subject_unavailable` refetches the subjects.
  - The linker applies `theme.background` to the root.
- [ ] **Step 2:** FAIL. **Step 3:** Implement. **Step 4:** PASS. **Step 5:** Commit: `feat: FAQ, contact and linker pages`.

### Task 5: Dynamic content slots and footer and legal links

**Files:**
- Create: `src/features/content/dynamic/api.ts`, `src/features/content/dynamic/dynamic-slot.tsx`
- Modify: the cart page (slot `cart`), checkout review (slots `terms` and `return-policy` as «مطالعهٔ قوانین» dialogs), product page (slot `product`), and `docs/CUSTOMIZATION.md` (slot keys table)
- Test: `tests/unit/content/dynamic-slot.test.tsx`

**Behaviour:** `DynamicSlot({ pageType: string, variant: 'inline' | 'dialog-link' })` fetches `global/dynamic-content/<key>/` (300 s). On 404 it renders nothing. Content is sanitised operator HTML. The slot keys used by the storefront are `home`, `product`, `cart`, `checkout`, `terms` and `return-policy`. They are documented so operators can create them in the panel.

- [ ] **Step 1: Write failing tests.** A 404 renders nothing; content is sanitised; `dialog-link` renders a button opening a dialog with the content.
- [ ] **Step 2:** FAIL. **Step 3:** Implement. **Step 4:** PASS. **Step 5:** Commit: `feat: dynamic content slots`.

### Task 6: PWA — manifest, service worker offline caching, install prompt

**Files:**
- Create: `src/app/manifest.ts` (dynamic from settings and config), `src/app/icons/[size]/route.ts` (generates 192 and 512 PNG icons from the favicon or logo with `sharp`, or falls back to a brand-colour monogram SVG converted to PNG), `src/app/offline/page.tsx`, `src/features/pwa/register-sw.tsx`, `src/features/pwa/install-prompt.tsx`
- Modify: `src/features/pwa/sw-source.ts` (add caching), `src/app/layout.tsx` (register; manifest link)
- Test: `tests/unit/pwa/sw-source.test.ts`, `tests/e2e/pwa.spec.ts`

**Behaviour:**
- Manifest: the store name and short name, `lang: 'fa'`, `dir: 'rtl'`, `theme_color` from primary, `background_color` `#ffffff`, `display: 'standalone'`, `start_url: '/?source=pwa'`, icons and shortcuts (search, cart, orders).
- SW strategies:
  - precache `/offline/` and the app shell CSS on install;
  - `/_next/static/*` cache-first;
  - images (`/_next/image`, `/media/`) stale-while-revalidate with 200 entries;
  - navigations network-first with a 4 s timeout, falling back to cache and then to `/offline/`;
  - the exclusion list from the Global Constraints;
  - a version string from the build id, and old caches are deleted on activate.
- Install prompt: a dismissible banner on mobile after the second visit (`beforeinstallprompt`), plus iOS instructions.
- Registered only in production and when `FEATURE_PWA`.

- [ ] **Step 1: Write failing tests.** `buildServiceWorker({ firebase: null, version: 'x' })` contains no Firebase import and contains each excluded path in its bypass list.
- [ ] **Step 2:** FAIL. **Step 3:** Implement. **Step 4:** PASS.
- [ ] **Step 5: e2e `pwa.spec.ts`** (desktop project, production build):
  - `/manifest.webmanifest` is valid JSON with the store name;
  - the SW registers;
  - after visiting the home page, going offline and reloading `/` still renders;
  - an unvisited page shows «اتصال اینترنت برقرار نیست».
- [ ] **Step 6:** Commit: `feat: installable PWA with offline support`.

### Task 7: SEO audit and site-wide structured data

**Files:**
- Create: `src/features/seo/organization-jsonld.tsx` (Organization plus WebSite with SearchAction `/search/?q={search_term_string}`, rendered on the home page), `tests/e2e/seo.spec.ts`
- Modify: any route missing metadata, canonical or robots rules.

- [ ] **Step 1: e2e `seo.spec.ts`.** For each indexable route type (home, category, brand, list page, product, blog home, post, blog category, page, FAQ):
  - exactly one `<h1>`;
  - a non-empty `<title>`;
  - a canonical `link` ending with `/`;
  - at least one valid JSON-LD block that parses with `JSON.parse`;
  - `og:title`;
  - and robots `noindex` on cart, checkout, account, search, compare, generic listing and auth pages.
- [ ] **Step 2:** Fix what fails. Run `curl` on `/sitemap.xml` and `/robots.txt` through the storefront and confirm a `Sitemap:` line and storefront URLs.
- [ ] **Step 3:** Commit: `feat: site-wide structured data and SEO audit fixes`.

### Task 8: Accessibility and performance audit

**Files:**
- Create: `tests/e2e/a11y.spec.ts` (uses `@axe-core/playwright`, a dev dependency), `scripts/lighthouse.mjs` (runs Lighthouse CLI with the preinstalled Chromium on the production build for home, category and product, at mobile emulation, and writes JSON reports into the system temp dir)

- [ ] **Step 1:** Add `@axe-core/playwright`. The a11y spec runs axe on home, category, product, cart, checkout, login and account dashboard, and asserts zero `serious` or `critical` violations. Fix what fails.
- [ ] **Step 2:** Run Lighthouse (mobile) on home, category and product. Targets: Performance ≥ 85, Accessibility ≥ 95, Best Practices ≥ 95, SEO ≥ 95. Record the scores in the report. Fix the top issues: image sizes and priority, unused JS (dynamic imports), render-blocking resources, font preload.
- [ ] **Step 3:** Commit: `perf: accessibility and performance fixes from audits`.

### Task 9: Preset showcase, documentation and final regression

**Files:**
- Modify: `docs/CUSTOMIZATION.md` (screenshots of all six presets on home and product at 375 and 1440 px, stored under `docs/images/presets/`), `docs/DEPLOYMENT.md`, `README.md`, `docs/BACKEND-ISSUES.md` (add anything new found during development, in Persian, in the same format)

- [ ] **Step 1:** For each `STORE_PRESET`, run the production build with that preset and capture the screenshots. Review them for contrast and tone, and adjust preset values where a combination fails WCAG AA for text on brand colours (use `readableTextOn`).
- [ ] **Step 2:** Full regression: `pnpm typecheck && pnpm lint && pnpm format:check && pnpm test && pnpm build && pnpm test:e2e` (all projects). All pass.
- [ ] **Step 3:** Update the docs. Commit: `docs: presets showcase, deployment and customization guides, backend issues update`. Push to `origin main`.
