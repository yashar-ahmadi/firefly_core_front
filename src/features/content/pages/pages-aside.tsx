import { FileText } from 'lucide-react'
import Link from 'next/link'
import { contentPagePath } from '@/features/content/pages/page-routes'
import type { PageCard } from '@/lib/api/types/page'
import { PAGES_ASIDE_HEADING_ID } from '@/lib/html/reserved-ids'

const TITLE = 'صفحه\u{200C}های دیگر'

/** Every published page but `current`, in the list's order (by title). */
export function otherPages(pages: readonly PageCard[], current: string): PageCard[] {
  return pages.filter((page) => page.slug !== current)
}

/**
 * The `with_sidebar` layout's aside (content digest §3.2: its content is the storefront's
 * choice; the guide's is the other pages): «صفحه‌های دیگر», as plain links (a page counts no
 * views: prefetching is harmless). Beside the content from lg, sticky; below it on phones.
 * Nothing when there is no other page (or the list could not be read).
 */
export function PagesAside({ pages }: { pages: readonly PageCard[] }) {
  if (pages.length === 0) return null
  return (
    <aside
      aria-labelledby={PAGES_ASIDE_HEADING_ID}
      className="rounded-card bg-white p-4 shadow-card lg:sticky lg:top-[calc(var(--header-offset)+1rem)] lg:transition-[top] lg:duration-200"
    >
      <h2 id={PAGES_ASIDE_HEADING_ID} className="mb-2 px-2 text-base font-bold text-ink-900">
        {TITLE}
      </h2>
      <ul className="flex flex-col">
        {pages.map((page) => (
          <li key={page.id}>
            <Link
              href={contentPagePath(page.slug)}
              className="flex min-h-11 items-center gap-2 rounded-control px-2 py-2.5 text-base leading-6 text-ink-700 transition-colors duration-150 hover:bg-ink-50 hover:text-ink-900"
            >
              <FileText aria-hidden className="size-5 shrink-0 text-brand-700" />
              <span dir="auto" className="min-w-0">
                {page.title}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </aside>
  )
}
