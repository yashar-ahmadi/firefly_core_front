'use client'

import type { ReactNode } from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import type { CommentSubject } from '@/features/comments/subjects'
import { countedTabName, TabCount } from '@/features/comments/tab-count'
import { COMMENTS_HEADING_ID, COMMENTS_ID } from '@/lib/html/reserved-ids'
import { SubjectCommentComposer } from './subject-comment-composer'
import { SubjectCommentList } from './subject-comment-list'

const TITLE = 'دیدگاه\u{200C}ها و پرسش\u{200C}ها'
const COMMENTS = 'دیدگاه\u{200C}ها'
const QUESTIONS = 'پرسش و پاسخ'

export interface CommentSectionProps {
  subject: CommentSubject
  /** The subject's counts of visible entries, replies included: the tabs' badges. */
  commentCount: number
  questionCount: number
  /** Shown instead of the tabs (the blog switched off, with the operator's reason). */
  unavailable?: ReactNode
  /** The comments' list, its first page server-rendered (`<SeededComments>` in a Suspense). */
  children: ReactNode
}

/**
 * «دیدگاه‌ها و پرسش‌ها» of a post or a page (blog digest §1.7, content digest §3.2–§4): the
 * section `#comments`, two tabs, «دیدگاه‌ها» (first) and «پرسش و پاسخ», with the subject's
 * counts (a badge, and «دیدگاه‌ها (۲ دیدگاه)» as the tab's name: `countedTabName`), keyboard-operable (Radix, RTL:
 * the arrows follow the reading order). Each has its composer (the form loads on first use)
 * above its list; the questions are read once their tab is opened. `unavailable` replaces the
 * tabs (a post's blog switched off).
 */
export function CommentSection({
  subject,
  commentCount,
  questionCount,
  unavailable,
  children,
}: CommentSectionProps) {
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
        {TITLE}
      </h2>
      {unavailable ?? (
        <Tabs defaultValue="comment">
          <TabsList aria-label={TITLE} className="-mx-1">
            <TabsTrigger
              value="comment"
              aria-label={countedTabName(COMMENTS, commentCount, 'دیدگاه')}
            >
              {COMMENTS}
              <TabCount value={commentCount} />
            </TabsTrigger>
            <TabsTrigger
              value="question"
              aria-label={countedTabName(QUESTIONS, questionCount, 'پرسش')}
            >
              {QUESTIONS}
              <TabCount value={questionCount} />
            </TabsTrigger>
          </TabsList>
          <TabsContent value="comment" className="flex flex-col gap-2">
            <SubjectCommentComposer subject={subject} type="comment" />
            {children}
          </TabsContent>
          <TabsContent value="question" className="flex flex-col gap-2">
            <SubjectCommentComposer subject={subject} type="question" />
            <SubjectCommentList subject={subject} type="question" count={questionCount} />
          </TabsContent>
        </Tabs>
      )}
    </section>
  )
}
