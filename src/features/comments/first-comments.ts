import 'server-only'
import { cache } from 'react'
import { BLOG_TAG } from '@/features/blog/api'
import { oneSegment } from '@/features/catalog/loaders/read'
import { subjectRules, type CommentSubjectKind } from '@/features/comments/subjects'
import { PAGES_TAG } from '@/features/content/pages/api'
import { ApiError } from '@/lib/api/errors'
import { apiFetch } from '@/lib/api/server'
import type { Paginated } from '@/lib/api/types/common'
import type { SubjectComment, SubjectCommentType } from '@/lib/api/types/subject-comment'

const COMMENTS_REVALIDATE = 60

/** The Data Cache tags of a subject's comment lists: its own, and its family's. */
const TAGS: Record<CommentSubjectKind, (slug: string) => string[]> = {
  post: (slug) => [`blog-post:${slug}`, BLOG_TAG],
  page: (slug) => [`page:${slug}`, PAGES_TAG],
}

/**
 * Page 1 of a post's or a page's comments or questions for the server-rendered HTML (spec §8.13:
 * what is indexable is in the HTML), anonymous (no token, no visitor IP: `is_current_user` is
 * false everywhere, one cache entry for everyone) and cached 60 s, like a product's first
 * comments. Never throws: null on any failure (logged once), and the list then loads in the
 * browser. A draft's lists answer 404 even for staff: never asked for one.
 */
export const getFirstComments = cache(
  async (
    kind: CommentSubjectKind,
    slug: string,
    type: SubjectCommentType,
  ): Promise<Paginated<SubjectComment> | null> => {
    const segment = oneSegment(slug)
    if (segment === null) return null
    try {
      const { data } = await apiFetch<Paginated<SubjectComment>>(
        `${subjectRules(kind).root}/${segment.path}/comment/list`,
        {
          query: { comment_type: type, page: 1 },
          revalidate: COMMENTS_REVALIDATE,
          tags: TAGS[kind](segment.text),
        },
      )
      return data
    } catch (error) {
      const reason =
        error instanceof ApiError ? `${error.status} ${error.code}` : (error as Error).name
      console.error(`[comments] getFirstComments(${kind}, ${type}) failed:`, reason)
      return null
    }
  },
)
