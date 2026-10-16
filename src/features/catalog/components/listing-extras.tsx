import { richContentHtml } from '@/features/content/rich-content'
import { RichContentBody } from '@/features/content/rich-content-body'
import type {
  ConsiderBeforeBuying as ConsiderBeforeBuyingData,
  QuestionAnswer,
} from '@/lib/api/types/catalog'
import { AdminFaq } from './admin-faq'
import { ConsiderBeforeBuying } from './consider-before-buying'

export interface ListingExtrasProps {
  /** Operator HTML (category, brand or list `content`). */
  content?: string | null
  considerBeforeBuying?: ConsiderBeforeBuyingData | null
  questions?: readonly QuestionAnswer[]
}

/**
 * Below a listing's grid (product digest §6.1): the operator's content (a card as wide as the
 * page, its text kept to a readable measure), the consider-before-buying card, then the FAQ.
 * Each part is left out when empty, and the whole block (`:empty`) when all are.
 */
export function ListingExtras({
  content,
  considerBeforeBuying,
  questions = [],
}: ListingExtrasProps) {
  const html = content ? richContentHtml(content) : null
  return (
    <div className="mt-8 flex flex-col gap-6 empty:hidden md:mt-12 md:gap-8">
      {html && (
        <div className="rounded-card bg-white p-4 shadow-card md:p-6">
          <RichContentBody html={html} className="rich-content max-w-4xl" />
        </div>
      )}
      {considerBeforeBuying && <ConsiderBeforeBuying data={considerBeforeBuying} />}
      <AdminFaq items={questions} />
    </div>
  )
}
