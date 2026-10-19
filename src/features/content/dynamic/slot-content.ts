import 'server-only'
import { richContentHtml } from '@/features/content/rich-content-html'
import type { DynamicContentGroup } from '@/lib/api/types/dynamic-content'

// A slot's items made ready to render on the server: each item's HTML through the shared
// sanitiser (scripts, handlers and `javascript:` gone; `/media` and `/static` on the API's origin;
// links leaving the shop, or with `newTabLinks` every web link, in a new tab), and what has
// nothing to show left out.

export interface SlotItem {
  id: number
  /** The operator's optional heading, trimmed. */
  title: string | null
  /** Sanitised HTML, or null when nothing visible is left. */
  html: string | null
}

export interface SlotContent {
  key: string
  /** The slot's own name in the panel (its content page type's title); '' when it has none. */
  title: string
  descriptions: SlotItem[]
  warnings: SlotItem[]
}

function items(list: unknown, linksInNewTab: boolean): SlotItem[] {
  if (!Array.isArray(list)) return []
  return list.flatMap((entry: unknown): SlotItem[] => {
    if (typeof entry !== 'object' || entry === null) return []
    const { id, title, content } = entry as { id?: unknown; title?: unknown; content?: unknown }
    const heading = typeof title === 'string' ? title.trim() || null : null
    const html =
      typeof content === 'string' && content.trim()
        ? richContentHtml(content, { linksInNewTab })
        : null
    return heading || html ? [{ id: typeof id === 'number' ? id : 0, title: heading, html }] : []
  })
}

/** The slot ready to render, or null when it has nothing to show. */
export function slotContent(
  group: DynamicContentGroup,
  key: string,
  { newTabLinks = false }: { newTabLinks?: boolean } = {},
): SlotContent | null {
  const descriptions = items(group.descriptions, newTabLinks)
  const warnings = items(group.warnings, newTabLinks)
  if (descriptions.length === 0 && warnings.length === 0) return null
  const name = typeof group.page_display_name === 'string' ? group.page_display_name.trim() : ''
  return { key, title: name, descriptions, warnings }
}
