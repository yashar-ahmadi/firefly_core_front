import type { ReactNode } from 'react'
import { SnippetHtmlZone } from '@/features/settings/snippets'

/**
 * The linker's own minimal frame (content digest §8: a link-in-bio page has no shop header or
 * footer), outside `(shop)`: inside the root layout (its skip link, providers and operator
 * snippets: the proxy marks `/links/` a `page` like any other page), `<main id="main">` for the
 * skip link, and the operator's bottom HTML zone the shop footer would otherwise hold (the root
 * layout leaves it to the frames). Security headers come from next.config for every path. No
 * loading.tsx (R9).
 */
export default function LinksLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <main id="main" tabIndex={-1} className="outline-none">
        {children}
      </main>
      <SnippetHtmlZone position="bottom" />
    </>
  )
}
