import type { PageDetail, PageLayout } from '@/lib/api/types/page'

// A content page's URL, layout and what it shows (content digest §3.2, §10.1). Pure: safe in any
// bundle.

/** The operator's contact page (content digest §3.2): its content shows above the contact form. */
export const CONTACT_US_SLUG = 'contact-us'
/**
 * The contact page (`src/app/(shop)/contact-us/`): the backend's `support_link` (seo digest
 * §2.2), so the canonical URL; `/contact/` and `/page/contact-us/` redirect here (next.config).
 */
export const CONTACT_US_PATH = '/contact-us/'

/**
 * `/page/<slug>/`, the URL the backend emits for a page (menus, sitemap, search); the
 * `contact-us` page's is the contact page, so the shop's own links skip the redirect.
 */
export function contentPagePath(slug: string): string {
  if (slug === CONTACT_US_SLUG) return CONTACT_US_PATH
  return `/page/${encodeURIComponent(slug)}/`
}

const LAYOUTS: readonly PageLayout[] = ['default', 'full_width', 'with_sidebar']

/** The operator's layout; anything the storefront does not know is `default`. */
export function pageLayout(layout: string): PageLayout {
  return (LAYOUTS as readonly string[]).includes(layout) ? (layout as PageLayout) : 'default'
}

/**
 * Whether the page shows its comments block (content digest §3.2): while its form is open, or
 * while it has approved comments or questions (they stay listed after the operator closes the
 * form). Never in a staff preview of a draft: its lists answer 404, even for staff.
 */
export function commentsShown(
  page: Pick<PageDetail, 'enable_comments' | 'comment_count' | 'question_count' | 'is_unpublished'>,
): boolean {
  if (page.is_unpublished) return false
  return page.enable_comments || page.comment_count + page.question_count > 0
}
