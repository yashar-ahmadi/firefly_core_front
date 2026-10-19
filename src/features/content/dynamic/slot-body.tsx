import { cn } from '@/components/ui/cn'
import type { SlotContent, SlotItem } from './slot-content'

// A slot's markup, server HTML only: no component, so nothing of it ships to the browser and no
// link in it is ever prefetched (a post's link included, P5-R1; a short link counts once, on the
// visit). Its links are plain links: a click is a full page load.

/** A warning box without a title of its own says this. */
export const WARNING_LABEL = 'توجه'

export interface SlotBodyOptions {
  /** The level of the descriptions' titles: 2 on a page, 3 in a dialog (its title is the h2). */
  headingLevel?: 2 | 3
  /** Descriptions on cards of their own (on a page); plain in a dialog's body. */
  framed?: boolean
  className?: string
}

/** Lucide's triangle-alert, drawn inline: an icon component would be client code. */
function WarningIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="mt-0.5 size-5 shrink-0 text-warning"
    >
      <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3" />
      <path d="M12 9v4" />
      <path d="M12 17h.01" />
    </svg>
  )
}

function Html({ item, className }: { item: SlotItem; className: string }) {
  return item.html ? (
    <div
      className={cn('rich-content', className)}
      dangerouslySetInnerHTML={{ __html: item.html }}
    />
  ) : null
}

/**
 * The descriptions as content blocks (each with its title as a heading), then the warnings as a
 * distinct note box: an icon, its title (or «توجه») in words, then its text, so the box says
 * what it is without its colour. Called, not rendered as a component (`slotBody(...)`), so the
 * tree it returns is host elements alone.
 */
export function slotBody(
  content: SlotContent,
  { headingLevel = 2, framed = true, className }: SlotBodyOptions = {},
) {
  const Heading = headingLevel === 3 ? 'h3' : 'h2'
  return (
    <div data-slot={content.key} className={cn('flex flex-col gap-3', className)}>
      {content.descriptions.map((item) => (
        <div
          key={`d${item.id}`}
          className={cn(framed && 'rounded-card bg-white p-4 shadow-card md:p-5')}
        >
          {item.title && (
            <Heading className="mb-2 text-lg leading-8 font-bold text-ink-900">
              {item.title}
            </Heading>
          )}
          {Html({ item, className: 'text-base leading-8' })}
        </div>
      ))}
      {content.warnings.map((item) => (
        <aside
          key={`w${item.id}`}
          role="note"
          className="flex items-start gap-3 rounded-card border border-warning/30 bg-warning/10 p-4 text-ink-900"
        >
          {WarningIcon()}
          <div className="min-w-0 flex-1">
            <p className="text-base leading-7 font-bold">{item.title ?? WARNING_LABEL}</p>
            {Html({ item, className: 'mt-1 text-base leading-7' })}
          </div>
        </aside>
      ))}
    </div>
  )
}
