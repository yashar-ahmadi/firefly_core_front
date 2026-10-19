'use client'

import { BookX } from 'lucide-react'
import type { ReactNode } from 'react'
import { BLOG_UNAVAILABLE_TITLE } from '@/features/blog/blog-copy'
import { CommentSection } from '@/features/comments/comment-section'
import { useFeature } from '@/features/settings/feature-context'

export interface PostCommentsProps {
  slug: string
  /** The post's counts of visible root entries: the tabs' badges. */
  commentCount: number
  questionCount: number
  /** The comments' list, its first page server-rendered (`<SeededComments>` in a Suspense). */
  children: ReactNode
}

/**
 * A post's «دیدگاه‌ها و پرسش‌ها» (blog digest §1.7): the shared CommentSection (tabs, composers,
 * lists; its forms follow the `blog_comments` switch). While the blog is switched off (a refused
 * read or write, or the shell's feature map) the section says «وبلاگ موقتاً در دسترس نیست» with
 * the operator's reason instead.
 */
export function PostComments({ slug, commentCount, questionCount, children }: PostCommentsProps) {
  const blog = useFeature('blog')
  return (
    <CommentSection
      subject={{ kind: 'post', slug }}
      commentCount={commentCount}
      questionCount={questionCount}
      unavailable={
        blog.enabled ? null : (
          <div className="flex items-start gap-3 rounded-control bg-ink-50 px-4 py-4 text-base text-ink-700">
            <BookX aria-hidden className="mt-1 size-5 shrink-0 text-brand-600" />
            <div>
              <p className="font-medium text-ink-900">{BLOG_UNAVAILABLE_TITLE}</p>
              {blog.reason && <p className="mt-1">{blog.reason}</p>}
            </div>
          </div>
        )
      }
    >
      {children}
    </CommentSection>
  )
}
