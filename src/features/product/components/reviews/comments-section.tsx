import type { ReactNode } from 'react'
import type { ProductDetail } from '@/lib/api/types/catalog'
import { SectionCard } from '../section-card'
import { CommentComposer } from './comment-composer'
import { RatingSummary } from './rating-summary'

export const REVIEWS = { id: 'reviews', title: 'دیدگاه\u{200C}ها' } as const
export const QUESTIONS = { id: 'questions', title: 'پرسش\u{200C}ها' } as const

type CommentsProduct = Pick<
  ProductDetail,
  'slug' | 'rating' | 'rating_count' | 'rating_breakdown' | 'comment_count' | 'question_count'
>

/**
 * The reviews (`#reviews`, the summary's rating link lands here): the rating summary beside the
 * list from lg (kept in view while the list scrolls), «ثبت دیدگاه» and the list (`children`: a
 * `<SeededCommentList type="comment">` in its own `<Suspense>`). The summary and the section
 * bar's counts come from the same product payload.
 */
export function ReviewsSection({
  product,
  children,
}: {
  product: CommentsProduct
  children: ReactNode
}) {
  return (
    <SectionCard id={REVIEWS.id} title={REVIEWS.title}>
      <div className="grid gap-6 lg:grid-cols-[17rem_minmax(0,1fr)] lg:gap-10">
        <div className="lg:sticky lg:top-[calc(var(--header-offset)+4.5rem)] lg:self-start">
          <RatingSummary product={product} />
        </div>
        <div className="flex min-w-0 flex-col gap-2">
          <CommentComposer slug={product.slug} type="comment" />
          {children}
        </div>
      </div>
    </SectionCard>
  )
}

/**
 * The questions: shoppers' questions (not the shop's FAQ), «ثبت پرسش» and the list
 * (`children`: a `<SeededCommentList type="question">` in its own `<Suspense>`).
 */
export function QuestionsSection({
  product,
  children,
}: {
  product: CommentsProduct
  children: ReactNode
}) {
  return (
    <SectionCard id={QUESTIONS.id} title={QUESTIONS.title}>
      <div className="flex max-w-4xl flex-col gap-2">
        <CommentComposer slug={product.slug} type="question" />
        {children}
      </div>
    </SectionCard>
  )
}
