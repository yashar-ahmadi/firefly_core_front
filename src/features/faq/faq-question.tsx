import { Disclosure } from '@/components/ui/disclosure'
import { RichContentBody } from '@/features/content/rich-content-body'
import type { FaqEntry } from './faq-sections'

/** The anchor of one question (blog-faq digest §2.1: ids are unique across the help centre). */
export const questionAnchor = (id: number) => `faq-${id}`
/** The anchor of one category's section (the chips lead there). */
export const categoryAnchor = (id: number) => `faq-category-${id}`

/** Under the sticky header and the chip row, with a little air. */
export const UNDER_STICKY = 'scroll-mt-[calc(var(--header-full)+4.5rem)]'

/**
 * One question as the kit's native disclosure (blog-faq digest §2.2: `<details id="faq-<id>">`),
 * its summary the question as an h3 under its category's h2 (escaped by React; its line breaks
 * kept: `pre-line`), then the sanitised answer, whose shop links route in the browser. Works and
 * is crawlable without JavaScript; Enter and Space open and close it. `hidden` while a search
 * leaves it out.
 */
export function FaqQuestion({ entry, hidden }: { entry: FaqEntry; hidden: boolean }) {
  return (
    <Disclosure
      id={questionAnchor(entry.id)}
      hidden={hidden}
      title={<span className="whitespace-pre-line">{entry.question}</span>}
      className={UNDER_STICKY}
      summaryClassName="rounded-control leading-7 focus-visible:-outline-offset-2"
      contentClassName="pt-0"
    >
      {entry.html && (
        <RichContentBody html={entry.html} className="rich-content text-base leading-8" />
      )}
    </Disclosure>
  )
}
