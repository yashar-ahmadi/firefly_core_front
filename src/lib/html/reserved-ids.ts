// The ids the storefront's own markup uses on a page that shows operator content with heading
// ids (a blog post: its `headings`, the table of contents' anchors). A content heading never
// takes one of them (the sanitiser drops it, and the table of contents leaves it out), so the
// skip link, `#comments` and every `aria-labelledby` keep finding ours, and the document never
// holds an id twice. The components render these constants; the shell's are listed as written
// there (tests/unit/html/reserved-ids.test.ts checks both). Pure: safe in any bundle.

/** `<main>`: the skip link's target and NavigationProgress's `aria-busy`. */
export const MAIN_ID = 'main'
/** The comments section (`/blog/<slug>/#comments`). */
export const COMMENTS_ID = 'comments'
/** Its heading, which names it. */
export const COMMENTS_HEADING_ID = 'comments-heading'
/** A post's article (the reading progress follows it) and its title, which names it. */
export const POST_ARTICLE_ID = 'post-article'
export const POST_TITLE_ID = 'post-title'
/** A post's «مطالب مرتبط» and «محصولات مرتبط» headings. */
export const RELATED_POSTS_ID = 'related-posts'
export const POST_PRODUCTS_ID = 'post-products'

/** The shell's own (src/components/layout, the theme's head), on every page. */
const SHELL_IDS = [
  'ff-announcement',
  'theme-vars',
  'footer-trust',
  'footer-contact',
  'footer-socials',
  'footer-apps',
  'not-found-categories',
]

export const RESERVED_IDS: ReadonlySet<string> = new Set([
  MAIN_ID,
  COMMENTS_ID,
  COMMENTS_HEADING_ID,
  POST_ARTICLE_ID,
  POST_TITLE_ID,
  RELATED_POSTS_ID,
  POST_PRODUCTS_ID,
  ...SHELL_IDS,
])
