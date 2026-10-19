'use client'

import { BookX } from 'lucide-react'
import type { ReactNode } from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { BLOG_UNAVAILABLE_TITLE } from '@/features/blog/blog-copy'
import { TabCount } from '@/features/comments/tab-count'
import { useFeature } from '@/features/settings/feature-context'
import { COMMENTS_HEADING_ID, COMMENTS_ID } from '@/lib/html/reserved-ids'
import { PostCommentComposer } from './post-comment-composer'
import { PostCommentList } from './post-comment-list'

export interface PostCommentsProps {
  slug: string
  /** The post's counts of visible root entries: the tabs' badges. */
  commentCount: number
  questionCount: number
  /** The comments' list, its first page server-rendered (`<SeededPostComments>` in a Suspense). */
  children: ReactNode
}

/**
 * «دیدگاه‌ها و پرسش‌ها» (blog digest §1.7): two tabs, «دیدگاه‌ها» (first) and «پرسش و پاسخ», with
 * the post's counts (TabCount: «دیدگاه‌ها، ۲ دیدگاه» to a screen reader), keyboard-operable
 * (Radix, RTL: the arrows follow the reading order). Each has its composer (the form loads on
 * first use) above its list; the questions are read once their tab is opened. While the blog is switched off (a refused read or write, or the shell's feature
 * map) the section says «وبلاگ موقتاً در دسترس نیست» with the operator's reason instead.
 */
export function PostComments({ slug, commentCount, questionCount, children }: PostCommentsProps) {
  const blog = useFeature('blog')
  return (
    <section
      id={COMMENTS_ID}
      aria-labelledby={COMMENTS_HEADING_ID}
      className="scroll-mt-[calc(var(--header-full)+1rem)] rounded-card bg-white p-4 shadow-card md:p-6"
    >
      <h2
        id={COMMENTS_HEADING_ID}
        className="mb-2 text-lg leading-8 font-bold text-ink-900 md:text-xl"
      >
        {'دیدگاه\u{200C}ها و پرسش\u{200C}ها'}
      </h2>
      {blog.enabled ? (
        <Tabs defaultValue="comment">
          <TabsList aria-label={'دیدگاه\u{200C}ها و پرسش\u{200C}ها'} className="-mx-1">
            <TabsTrigger value="comment">
              {'دیدگاه\u{200C}ها'}
              <TabCount value={commentCount} unit="دیدگاه" />
            </TabsTrigger>
            <TabsTrigger value="question">
              پرسش و پاسخ
              <TabCount value={questionCount} unit="پرسش" />
            </TabsTrigger>
          </TabsList>
          <TabsContent value="comment" className="flex flex-col gap-2">
            <PostCommentComposer slug={slug} type="comment" />
            {children}
          </TabsContent>
          <TabsContent value="question" className="flex flex-col gap-2">
            <PostCommentComposer slug={slug} type="question" />
            <PostCommentList slug={slug} type="question" count={questionCount} />
          </TabsContent>
        </Tabs>
      ) : (
        <div className="flex items-start gap-3 rounded-control bg-ink-50 px-4 py-4 text-base text-ink-700">
          <BookX aria-hidden className="mt-1 size-5 shrink-0 text-brand-600" />
          <div>
            <p className="font-medium text-ink-900">{BLOG_UNAVAILABLE_TITLE}</p>
            {blog.reason && <p className="mt-1">{blog.reason}</p>}
          </div>
        </div>
      )}
    </section>
  )
}
