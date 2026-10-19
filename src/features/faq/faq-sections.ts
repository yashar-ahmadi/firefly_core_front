import { richContentHtml } from '@/features/content/rich-content'
import type { FaqCategory } from '@/lib/api/types/faq'
import { htmlToText } from '@/lib/html/to-text'

// The help centre's categories as the page shows them (blog-faq digest §2.2). Server only: the
// answers are sanitised here (the parser never reaches the browser).

/** One question, its answer sanitised (`html`) and as plain text (`text`: search, JSON-LD). */
export interface FaqEntry {
  id: number
  question: string
  html: string
  text: string
}

export interface FaqSection {
  id: number
  name: string
  entries: FaqEntry[]
}

/**
 * The categories in the API's order (by id; never sorted by name), each question in its order.
 * A category without a visible question is left out: a heading over nothing, and a chip leading
 * to it, would only be noise. Each answer is operator HTML the API does not sanitise, with its
 * `/media/…` URLs relative: always sanitised as HTML (scripts, handlers and `javascript:` URLs
 * dropped, `/media` and `/static` on the API's origin), a plain-text answer included.
 */
export function faqSections(categories: readonly FaqCategory[]): FaqSection[] {
  return categories.flatMap((category) => {
    if (category.items.length === 0) return []
    const entries = category.items.map((item) => {
      const html = richContentHtml(item.answer) ?? ''
      return { id: item.id, question: item.question, html, text: htmlToText(html) }
    })
    return [{ id: category.id, name: category.name, entries }]
  })
}
