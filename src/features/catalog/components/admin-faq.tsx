import { Disclosure } from '@/components/ui/disclosure'
import type { QuestionAnswer } from '@/lib/api/types/catalog'

const HEADING_ID = 'admin-faq'

/**
 * The operator's FAQ of a category or list page (not shoppers' questions): each question a native
 * disclosure, one answer open at a time where the browser supports named `<details>`. The answers
 * are plain text (line breaks kept). They stay in the HTML while closed, so search engines read
 * them, and no JavaScript is needed to open them. Nothing when there is no usable item.
 */
export function AdminFaq({ items }: { items: readonly QuestionAnswer[] }) {
  const usable = items.filter((item) => item.question.trim() && item.answer.trim())
  if (usable.length === 0) return null
  return (
    <section aria-labelledby={HEADING_ID}>
      <h2 id={HEADING_ID} className="mb-3 text-lg leading-8 font-bold text-ink-900 md:text-xl">
        پرسش‌های متداول
      </h2>
      <div className="rounded-card bg-white px-4 shadow-card md:px-6">
        {usable.map((item, index) => (
          <Disclosure key={index} name={HEADING_ID} title={item.question.trim()}>
            <p className="leading-8 whitespace-pre-line">{item.answer.trim()}</p>
          </Disclosure>
        ))}
      </div>
    </section>
  )
}
