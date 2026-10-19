import type { PageDetail, PageLayout } from '@/lib/api/types/page'

// A content page's URL, layout and what it shows (content digest §3.2, §10.1). Pure: safe in any
// bundle.

/** The page Task 4's contact form renders under (content digest §3.2). */
export const CONTACT_US_SLUG = 'contact-us'

/** `/page/<slug>/`, the URL the backend emits for a page (menus, sitemap, search). */
export function contentPagePath(slug: string): string {
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
