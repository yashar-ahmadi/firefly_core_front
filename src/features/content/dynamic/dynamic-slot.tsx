import { getDynamicContent } from './api'
import { InlineSlot } from './inline-slot'
import { slotBody } from './slot-body'
import { slotContent } from './slot-content'
import { SlotDialogLink } from './slot-dialog-link'

// The storefront's message slots (auth-settings digest §7.8–7.9): content page types the
// operator creates in the panel, filled with «توضیح» (description) and «هشدار» (warning) items.
// The keys the storefront shows (`SLOT_KEYS`, slot-keys.ts), and where, are in
// docs/CUSTOMIZATION.md (its section on message slots).

export interface DynamicSlotProps {
  /** The slot's key (its content page type's `key` in the panel). */
  pageType: string
  /**
   * `inline`: the content in the page, server HTML only (no client code; `InlineSlot` alone for a
   * page with no dialog-link slot). `dialog-link`: a button opening a dialog with the content,
   * rendered on the server; its dialog's code loads on the first press.
   */
  variant: 'inline' | 'dialog-link'
  /** The button's words (`dialog-link`); the slot's own name when left out. */
  label?: string
  /** The level of the descriptions' titles inline (2 by default). */
  headingLevel?: 2 | 3
  /** Every web link in a new tab (where following one must not lose the page: the checkout). */
  newTabLinks?: boolean
  className?: string
}

/** Words for a slot with no name of its own and no label. */
const FALLBACK_NAME = 'اطلاعات بیشتر'

/**
 * A message slot, read on the server (cached 300 s, the same for everyone: `getDynamicContent`).
 * Renders nothing when the slot is missing, switched off, empty or unreadable, so a page asks for
 * its slot unconditionally and the operator decides by creating it. The `dialog-link` button is
 * shown only when there is content: the server knows from the same cached read, before the page
 * is sent.
 */
export async function DynamicSlot({
  pageType,
  variant,
  label,
  headingLevel = 2,
  newTabLinks = false,
  className,
}: DynamicSlotProps) {
  if (variant === 'inline') {
    return InlineSlot({ pageType, headingLevel, newTabLinks, className })
  }
  const group = await getDynamicContent(pageType)
  const content = group && slotContent(group, pageType, { newTabLinks })
  if (!content) return null
  const name = content.title || label || FALLBACK_NAME
  return (
    <SlotDialogLink label={label || name} title={name}>
      {slotBody(content, { headingLevel: 3, framed: false })}
    </SlotDialogLink>
  )
}
