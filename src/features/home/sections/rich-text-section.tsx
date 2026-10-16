import { richContentHtml } from '@/features/content/rich-content'
import { RichContentBody } from '@/features/content/rich-content-body'
import type { HomeSection } from '@/lib/api/types/catalog'
import { SectionShell } from './section-header'

export interface RichTextSectionProps {
  section: Extract<HomeSection, { type: 'rich_text' }>
  seeAllLabel: string
}

/**
 * Operator HTML on a card (content.md §6.8), through RichContent's pipeline: sanitised once
 * here, so a section left with nothing visible renders nothing, not even its title.
 */
export function RichTextSection({ section, seeAllLabel }: RichTextSectionProps) {
  const html = richContentHtml(section.content)
  if (html === null) return null
  return (
    <SectionShell section={section} seeAllLabel={seeAllLabel}>
      <div className="rounded-card bg-white p-5 shadow-card md:p-8">
        {/* A readable line length, even on a wide card. */}
        <RichContentBody html={html} className="rich-content max-w-3xl text-base leading-8" />
      </div>
    </SectionShell>
  )
}
