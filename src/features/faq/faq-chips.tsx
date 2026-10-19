import { categoryAnchor } from './faq-question'
import type { FaqSection } from './faq-sections'

/**
 * The categories as a row of chips that stays under the sticky header and scrolls sideways on
 * phones: plain in-page links (`#faq-category-<id>`), so they work without JavaScript; each
 * section's scroll margin keeps its heading clear of the header and the row. 44px targets.
 */
export function FaqChips({ sections }: { sections: readonly FaqSection[] }) {
  if (sections.length < 2) return null
  return (
    <nav
      aria-label={'دسته\u{200C}های پرسش\u{200C}ها'}
      className="sticky top-(--header-offset) z-30 -mx-4 bg-ink-50/95 px-4 py-2 backdrop-blur transition-[top] duration-200 motion-reduce:transition-none lg:-mx-6 lg:px-6"
    >
      <ul className="flex [scrollbar-width:none] gap-2 overflow-x-auto py-0.5 [&::-webkit-scrollbar]:hidden">
        {sections.map((section) => (
          <li key={section.id} className="shrink-0">
            <a
              href={`#${categoryAnchor(section.id)}`}
              className="inline-flex h-11 items-center rounded-pill border border-ink-500 bg-white px-4 text-sm font-medium whitespace-nowrap text-ink-700 transition-colors hover:border-brand hover:bg-brand-50 hover:text-brand-800 focus-visible:-outline-offset-2"
            >
              {section.name}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  )
}
