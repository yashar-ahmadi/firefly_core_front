import { productPath } from '@/features/catalog/listing-routes'
import type { CommentSubjectType, MyComment } from '@/lib/api/types/dashboard'
import { blogPostPath } from '@/lib/links/post-link'

// Where a comment's subject lives on the storefront, and what it is called. Pure.

/** «محصول», «مطلب وبلاگ», «صفحه»: said before the subject's name. */
export const SUBJECT_KIND: Record<CommentSubjectType, string> = {
  product: 'محصول',
  post: 'مطلب وبلاگ',
  page: 'صفحه',
}

/**
 * The subject's page: `/product/<slug>/`, `/blog/<slug>/`, `/page/<slug>/`. A post has none while
 * the blog is switched off (every blog route answers 503 then): its name is shown as text. A
 * post's is `blogPostPath`, so a link to it is never prefetched (ruling P5-R1: the link says
 * `prefetch={false}`, and tests/unit/blog/post-links-prefetch.test.ts follows this function).
 */
export function subjectHref(
  { subject_type, subject }: Pick<MyComment, 'subject_type' | 'subject'>,
  blogEnabled: boolean,
): string | null {
  switch (subject_type) {
    case 'product':
      return productPath(subject.slug)
    case 'post':
      return blogEnabled ? blogPostPath(subject.slug) : null
    case 'page':
      return `/page/${encodeURIComponent(subject.slug)}/`
  }
}

/** The order a review was written for (the order pages: Plan 4). */
export function orderHref(code: string): string {
  return `/account/orders/${encodeURIComponent(code)}/`
}
