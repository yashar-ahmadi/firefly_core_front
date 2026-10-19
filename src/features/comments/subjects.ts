import type { FeatureKey } from '@/lib/api/types/common'

// What the comments of a blog post and of a content page differ in (blog digest §1.7, content
// digest §4): where the API keeps them, their query keys, the switch of their forms and a few
// words. Everything else (the lists, the threads, the form, its errors) is shared. Pure: safe in
// any bundle.

/** Whose comments: a blog post's or a content page's. */
export type CommentSubjectKind = 'post' | 'page'

/** One subject: its kind and its slug (as the API wrote it; encoded on the way out). */
export interface CommentSubject {
  kind: CommentSubjectKind
  slug: string
}

/** Every blog post's comment lists (viewer-aware: `is_current_user`). */
export const POST_COMMENTS_KEY = ['blog-comments'] as const
/** Every content page's comment lists (viewer-aware: `is_current_user`). */
export const PAGE_COMMENTS_KEY = ['page-comments'] as const

interface SubjectRules {
  /** The subject's API path before its slug. */
  root: string
  key: typeof POST_COMMENTS_KEY | typeof PAGE_COMMENTS_KEY
  /** The feature switch of its comment forms (the blog's `blog_comments`); pages have none. */
  formSwitch: FeatureKey | null
  /** Said instead of the form while it is closed, when the operator gave no reason. */
  closed: string
  /** The subject went away meanwhile (a 404 on its lists or on a send). */
  gone: string
}

const RULES: Record<CommentSubjectKind, SubjectRules> = {
  post: {
    root: 'blog/post',
    key: POST_COMMENTS_KEY,
    formSwitch: 'blog_comments',
    closed: 'ثبت دیدگاه و پرسش روی مطالب در حال حاضر ممکن نیست.',
    gone: 'این مطلب دیگر در دسترس نیست.',
  },
  page: {
    root: 'pages',
    key: PAGE_COMMENTS_KEY,
    formSwitch: null,
    closed: 'ثبت دیدگاه و پرسش برای این صفحه بسته است.',
    gone: 'این صفحه دیگر در دسترس نیست.',
  },
}

export function subjectRules(kind: CommentSubjectKind): SubjectRules {
  return RULES[kind]
}

/** `blog/post/<slug>/comment/list/`, `pages/<slug>/comment/list/` (through the BFF). */
export function commentListPath({ kind, slug }: CommentSubject): string {
  return `${RULES[kind].root}/${slug}/comment/list/`
}

/** `…/comment/submit/`. */
export function commentSubmitPath({ kind, slug }: CommentSubject): string {
  return `${RULES[kind].root}/${slug}/comment/submit/`
}

/** Both lists of one subject, e.g. to read them again after a stale reply target. */
export function subjectCommentsKey({ kind, slug }: CommentSubject) {
  return [...RULES[kind].key, slug] as const
}
