import { RichContentBody } from '@/features/content/rich-content-body'
import { cn } from '@/components/ui/cn'
import type { DisplayStyle } from './display-style'

// Operator HTML in the panel's four styles: a homepage `rich_text` section (content digest §6.8)
// and a content page's `rich_text` block (§2) draw the same. The HTML comes sanitised
// (`richContentHtml`): the caller drops a block left with nothing visible.

/** Each style's frame and the text's own classes inside it. */
const STYLES: Record<DisplayStyle, { frame: string; text: string }> = {
  // 1. A white card; a readable line length, even on a wide one.
  style_1: {
    frame: 'rounded-card bg-white p-5 shadow-card md:p-8',
    text: 'max-w-3xl',
  },
  // 2. Plain: the words on the page itself, no card.
  style_2: {
    frame: 'px-1',
    text: 'max-w-3xl',
  },
  // 3. A tinted panel, the brand's bar along its start edge: a note that stands out.
  style_3: {
    frame:
      'rounded-card border-s-4 border-brand bg-linear-to-l from-brand-50 to-white p-5 shadow-card md:p-8',
    text: 'max-w-3xl',
  },
  // 4. A statement: centred, a little larger, narrow.
  style_4: {
    frame: 'rounded-card bg-white px-5 py-8 shadow-card md:px-10 md:py-12',
    text: 'mx-auto max-w-2xl text-center md:text-lg md:leading-9',
  },
}

export interface StyledRichTextProps {
  /** Sanitised operator HTML (`richContentHtml`). */
  html: string
  style: DisplayStyle
}

/** The HTML in its style's frame, through the shop's `rich-content` typography. */
export function StyledRichText({ html, style }: StyledRichTextProps) {
  const { frame, text } = STYLES[style]
  return (
    <div data-style={style} className={frame}>
      <RichContentBody html={html} className={cn('rich-content text-base leading-8', text)} />
    </div>
  )
}
