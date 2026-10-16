import { Lightbulb } from 'lucide-react'
import { richContentHtml } from '@/features/content/rich-content'
import type { ConsiderBeforeBuying as ConsiderBeforeBuyingData } from '@/lib/api/types/catalog'
import { ReadingButton } from './reading-button'

const HEADING_ID = 'consider-before-buying'

/**
 * The operator's «before you buy» card (product digest §5.10): its title and a button, labelled
 * by the operator, that opens the text (operator HTML) in a dialog. Nothing when the text is
 * empty. Defaults: «پیش از خرید بدانید» and «مطالعه». The dialog's code loads on the first opening.
 */
export function ConsiderBeforeBuying({ data }: { data: ConsiderBeforeBuyingData }) {
  const html = richContentHtml(data.text)
  if (html === null) return null
  const title = data.title?.trim() || 'پیش از خرید بدانید'
  return (
    <section
      aria-labelledby={HEADING_ID}
      className="flex flex-wrap items-center gap-x-4 gap-y-3 rounded-card bg-white p-4 shadow-card md:p-6"
    >
      <span
        aria-hidden
        className="grid size-12 shrink-0 place-items-center rounded-full bg-brand-50 text-brand-700 [&_svg]:size-6"
      >
        <Lightbulb />
      </span>
      <h2 id={HEADING_ID} className="min-w-0 flex-1 text-lg leading-8 font-bold text-ink-900">
        {title}
      </h2>
      <ReadingButton label={data.button?.trim() || 'مطالعه'} title={title} html={html} />
    </section>
  )
}
