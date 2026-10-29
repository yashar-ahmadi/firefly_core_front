import { displayStyle } from '@/features/display/display-style'
import { StyledRichText } from '@/features/display/styled-rich-text'
import { richContentHtml } from '@/features/content/rich-content'
import type { HomeSection } from '@/lib/api/types/catalog'
import { SectionShell } from './section-header'

export interface RichTextSectionProps {
  section: Extract<HomeSection, { type: 'rich_text' }>
  seeAllLabel: string
}

/**
 * Operator HTML (content.md §6.8) in the operator's style (`StyledRichText`: a card, plain, a
 * tinted panel, or a centred statement under a centred title), through RichContent's pipeline:
 * sanitised once here, so a section left with nothing visible renders nothing, not even its
 * title.
 */
export function RichTextSection({ section, seeAllLabel }: RichTextSectionProps) {
  const html = richContentHtml(section.content)
  if (html === null) return null
  const style = displayStyle(section.style)
  return (
    <SectionShell
      section={section}
      seeAllLabel={seeAllLabel}
      align={style === 'style_4' ? 'center' : 'start'}
    >
      <StyledRichText html={html} style={style} />
    </SectionShell>
  )
}
