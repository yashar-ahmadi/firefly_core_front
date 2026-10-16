import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'
import type { QuestionAnswer } from '@/lib/api/types/catalog'

const HEADING_ID = 'admin-faq'

/**
 * The operator's FAQ of a category or list page (not shoppers' questions): an accordion, one
 * answer open at a time. The answers are plain text (line breaks kept). They stay in the HTML
 * while closed, so search engines read them: `forceMount` keeps Radix from unmounting them, and
 * since it also keeps Radix from setting `hidden`, a closed panel's body is hidden by CSS on the
 * panel's own `data-state`. Nothing when there is no usable item.
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
        <Accordion type="single" collapsible>
          {usable.map((item, index) => (
            <AccordionItem key={index} value={`faq-${index}`}>
              <AccordionTrigger>{item.question.trim()}</AccordionTrigger>
              <AccordionContent
                forceMount
                className="leading-8 whitespace-pre-line [[data-state=closed]>&]:hidden"
              >
                {item.answer.trim()}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>
    </section>
  )
}
