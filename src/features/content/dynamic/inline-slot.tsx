import { getDynamicContent } from './api'
import { slotBody } from './slot-body'
import { slotContent } from './slot-content'

export interface InlineSlotProps {
  /** The slot's key (its content page type's `key` in the panel). */
  pageType: string
  /** The level of the descriptions' titles (2 by default). */
  headingLevel?: 2 | 3
  /** Every web link in a new tab (where following one must not lose the page: the checkout). */
  newTabLinks?: boolean
  className?: string
}

/**
 * DynamicSlot's `inline` variant on its own, for pages that show no dialog-link slot (home,
 * product, cart): server HTML only, and nothing client-side in its imports. Turbopack puts
 * every client component a page's server modules import into that page's chunks, rendered or
 * not: importing DynamicSlot (its dialog-link button) cost those pages 0.2–0.7 KB with every
 * slot empty (tests/unit/content/slot-imports.test.ts keeps the button out).
 *
 * The slot read on the server (`getDynamicContent`: cached 300 s, the same for everyone); nothing
 * when it is missing, switched off, empty or unreadable.
 */
export async function InlineSlot({
  pageType,
  headingLevel = 2,
  newTabLinks = false,
  className,
}: InlineSlotProps) {
  const group = await getDynamicContent(pageType)
  const content = group && slotContent(group, pageType, { newTabLinks })
  return content ? slotBody(content, { headingLevel, className }) : null
}
