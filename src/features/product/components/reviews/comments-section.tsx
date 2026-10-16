import type { ProductDetail } from '@/lib/api/types/catalog'
import { SectionCard } from '../section-card'
import { CommentComposer } from './comment-composer'
import { CommentList } from './comment-list'
import { RatingSummary } from './rating-summary'

export const REVIEWS = { id: 'reviews', title: 'دیدگاه\u{200C}ها' } as const
export const QUESTIONS = { id: 'questions', title: 'پرسش\u{200C}ها' } as const

type CommentsProduct = Pick<
  ProductDetail,
  'slug' | 'rating' | 'rating_count' | 'rating_breakdown' | 'comment_count' | 'question_count'
>

/**
 * The reviews (`#reviews`, the summary's rating link lands here): the rating summary beside the
 * list from lg (kept in view while the list scrolls), «ثبت دیدگاه» and the reviews, which load
 * in the browser when the section comes near.
 */
export function ReviewsSection({ product }: { product: CommentsProduct }) {
  return (
    <SectionCard id={REVIEWS.id} title={REVIEWS.title}>
      <div className="grid gap-6 lg:grid-cols-[17rem_minmax(0,1fr)] lg:gap-10">
        <div className="lg:sticky lg:top-[calc(var(--header-offset)+4.5rem)] lg:self-start">
          <RatingSummary product={product} />
        </div>
        <div className="flex min-w-0 flex-col gap-2">
          <CommentComposer slug={product.slug} type="comment" />
          <CommentList slug={product.slug} type="comment" count={product.comment_count} />
        </div>
      </div>
    </SectionCard>
  )
}

/** The questions: shoppers' questions (not the shop's FAQ), «ثبت پرسش» and the list. */
export function QuestionsSection({ product }: { product: CommentsProduct }) {
  return (
    <SectionCard id={QUESTIONS.id} title={QUESTIONS.title}>
      <div className="flex max-w-4xl flex-col gap-2">
        <CommentComposer slug={product.slug} type="question" />
        <CommentList slug={product.slug} type="question" count={product.question_count} />
      </div>
    </SectionCard>
  )
}
