import type { ContentHeading } from '@/lib/api/types/blog-post'
import { isUsableHeadingId } from '@/lib/html/heading-ids'

// The rows of a post's table of contents, from the API's `headings` (blog digest §1.5): their ids
// are the ones the API put on the content's headings, which the page keeps (`headingIds` in the
// sanitiser, by the same rules: lib/html/heading-ids.ts), so the content is never parsed for
// them. Pure.

export interface TocEntry {
  /** The heading's id in the content; the link is `#` + it encoded. */
  id: string
  text: string
  /** The API's outline numbering («2-1»). */
  number: string
  /** 0: an h2 (an h1 in the content is shown as one); 1: an h3 under it. */
  depth: 0 | 1
}

/**
 * The h2 and h3 headings, in order (an h1 counts as an h2: the sanitiser shows it as one). A
 * heading without an id (punctuation only) cannot be linked to, nor one whose id the page's own
 * markup uses (`isUsableHeadingId`: the sanitiser dropped it), and a repeated id (two headings
 * with the same text) is only on the first one: all are left out. h4 to h6 are too deep.
 */
export function tocEntries(headings: readonly ContentHeading[]): TocEntry[] {
  const seen = new Set<string>()
  const entries: TocEntry[] = []
  for (const heading of headings) {
    if (heading.level > 3 || !isUsableHeadingId(heading.id) || seen.has(heading.id)) continue
    seen.add(heading.id)
    entries.push({
      id: heading.id,
      text: heading.text.trim(),
      number: heading.number,
      depth: heading.level === 3 ? 1 : 0,
    })
  }
  return entries
}

/** The link to a heading: `#` and its id encoded (Persian ids). */
export function tocHref(id: string): string {
  return `#${encodeURIComponent(id)}`
}
