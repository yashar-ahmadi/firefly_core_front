import { richContentHtml } from '@/features/content/rich-content'
import { RichContentBody } from '@/features/content/rich-content-body'
import { htmlToText } from '@/lib/html/to-text'
import { ReadMore } from './read-more'
import { SectionCard } from './section-card'

export const INTRO_ID = 'intro'
export const INTRO_TITLE = 'معرفی'

/** Whitespace-insensitive: the description and the text of the content start alike. */
function repeats(content: string, description: string): boolean {
  const flat = (text: string) => text.replace(/\s+/g, ' ').trim()
  return flat(content).startsWith(flat(description))
}

export interface IntroParts {
  /** The description, unless the content already opens with it. */
  lead: string | null
  /** The content, sanitised; null when nothing visible is left. */
  html: string | null
}

/** What «معرفی» shows, or null when there is nothing to show (no section, no tab). Server only. */
export function introParts(description: string | null, content: string | null): IntroParts | null {
  const html = content ? richContentHtml(content) : null
  const text = description?.trim() ?? ''
  const lead = text !== '' && (html === null || !repeats(htmlToText(html), text)) ? text : null
  return lead === null && html === null ? null : { lead, html }
}

/**
 * «معرفی» (product digest §3.10): the plain-text description with its line breaks, then the
 * operator's content, collapsed behind «read more» when tall. Operators often open the content
 * with the description itself: then it is shown once. The page works out `intro` once
 * (`introParts`, which also decides whether the tab exists) and renders this only when it is
 * not null.
 */
export function DescriptionSection({ intro }: { intro: IntroParts }) {
  const { lead, html } = intro
  return (
    <SectionCard id={INTRO_ID} title={INTRO_TITLE}>
      <div className="flex max-w-4xl flex-col gap-4">
        {lead !== null && (
          <p className="text-base leading-8 whitespace-pre-wrap text-ink-800">{lead}</p>
        )}
        {html !== null && (
          <ReadMore>
            <RichContentBody html={html} className="rich-content" />
          </ReadMore>
        )}
      </div>
    </SectionCard>
  )
}
