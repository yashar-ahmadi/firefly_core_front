import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'
import { SectionHeader } from '@/components/layout/section-header'
import { cn } from '@/components/ui/cn'
import type { DisplayStyle } from '@/features/display/display-style'
import type { PageBlock, PageBlockItem } from '@/lib/api/types/page'
import { blockHeadingId, text } from './blocks'

// The `faq` block (content digest §2): questions (`title`) and their plain-text answers
// (`description`), in one of four styles.

export interface FaqBlockProps {
  block: PageBlock
  items: PageBlockItem[]
  style: DisplayStyle
}

/** One accordion of questions, each a heading (h3) with its button, the answer under it. */
function Questions({ items, className }: { items: PageBlockItem[]; className?: string }) {
  return (
    <Accordion
      type="multiple"
      className={cn('rounded-card bg-white px-4 shadow-card md:px-6', className)}
    >
      {items.map((item) => (
        <AccordionItem key={item.id} value={String(item.id)}>
          <AccordionTrigger>{item.title}</AccordionTrigger>
          <AccordionContent className="leading-8 whitespace-pre-line text-ink-700">
            {item.description}
          </AccordionContent>
        </AccordionItem>
      ))}
    </Accordion>
  )
}

/**
 * The questions in one of four styles: 1. one accordion; 2. two accordions side by side (one
 * under the other when narrow); 3. the block's title, subtitle and link in a column at the
 * start (it stays in view from 48rem of room), the accordion beside them; 4. every answer open,
 * a question and answer list on a card. Styles 1, 2 and 4 sit under the block's own header
 * (BlockFrame); style 3 draws it in its side column.
 */
export function FaqBlock({ block, items, style }: FaqBlockProps) {
  if (style === 'style_2') {
    const half = Math.ceil(items.length / 2)
    return (
      <div className="grid items-start gap-4 @3xl:grid-cols-2">
        <Questions items={items.slice(0, half)} />
        {items.length > half && <Questions items={items.slice(half)} />}
      </div>
    )
  }

  if (style === 'style_3') {
    const title = text(block.title)
    const subtitle = text(block.subtitle)
    const url = text(block.link?.url)
    return (
      <div className="grid items-start gap-4 @3xl:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] @3xl:gap-8">
        {(title || subtitle || url) && (
          <div className="rounded-card bg-linear-to-b from-brand-50 to-white p-5 ring-1 ring-brand-100 @3xl:sticky @3xl:top-[calc(var(--header-offset)+1rem)]">
            <SectionHeader
              id={blockHeadingId(block)}
              title={title}
              subtitle={subtitle}
              link={
                url ? { href: url, label: text(block.link?.title) || 'مشاهده\u{0654} همه' } : null
              }
            />
          </div>
        )}
        <Questions items={items} />
      </div>
    )
  }

  if (style === 'style_4') {
    return (
      <dl className="divide-y divide-ink-100 rounded-card bg-white px-4 shadow-card md:px-6">
        {items.map((item) => (
          <div key={item.id} className="py-4 md:py-5">
            <dt className="flex gap-2 text-base leading-7 font-bold text-ink-900">
              <span aria-hidden className="text-brand-700">
                {'؟'}
              </span>
              <span className="min-w-0">{item.title}</span>
            </dt>
            <dd className="mt-1 ps-5 text-base leading-8 whitespace-pre-line text-ink-700">
              {item.description}
            </dd>
          </div>
        ))}
      </dl>
    )
  }

  return <Questions items={items} />
}
