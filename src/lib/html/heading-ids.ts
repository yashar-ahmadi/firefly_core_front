import type sanitizeHtml from 'sanitize-html'
import { RESERVED_IDS } from '@/lib/html/reserved-ids'

// Which `id` a sanitised heading keeps (a blog post's: the anchors of its table of contents).
// Pure; the sanitiser's transform calls it per element, in document order.

export const HEADING_TAGS: readonly string[] = ['h2', 'h3', 'h4', 'h5', 'h6']

/** Whether `id` can anchor a content heading: not empty, and not one of the page's own ids. */
export function isUsableHeadingId(id: string): boolean {
  return id !== '' && !RESERVED_IDS.has(id)
}

/** The allowed attributes, with `id` on headings when there are heading ids to keep. */
export function withHeadingIds(
  allowed: Record<string, string[]>,
  headingIds: ReadonlySet<string> | undefined,
): Record<string, string[]> {
  if (!headingIds?.size) return allowed
  return {
    ...allowed,
    ...Object.fromEntries(HEADING_TAGS.map((tag) => [tag, [...(allowed[tag] ?? []), 'id']])),
  }
}

/**
 * For one document: an element's attributes with its `id` kept only on a heading, when the id is
 * one of `headingIds`, usable (`isUsableHeadingId`) and not already on an earlier heading (two
 * headings of the same text: the first keeps it, so the document never has it twice). Every
 * other element's `id` is dropped. Make one per sanitised document: it remembers the ids used.
 */
export function headingIdFilter(
  headingIds: ReadonlySet<string> | undefined,
): (tagName: string, attribs: sanitizeHtml.Attributes) => sanitizeHtml.Attributes {
  const used = new Set<string>()
  return (tagName, attribs) => {
    if (attribs.id === undefined) return attribs
    const { id, ...rest } = attribs
    const kept =
      HEADING_TAGS.includes(tagName) &&
      headingIds?.has(id) === true &&
      isUsableHeadingId(id) &&
      !used.has(id)
    if (!kept) return rest
    used.add(id)
    return attribs
  }
}
