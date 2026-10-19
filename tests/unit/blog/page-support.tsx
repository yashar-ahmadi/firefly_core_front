import { render } from '@testing-library/react'
import type { ReactNode } from 'react'
import { FeatureProvider } from '@/features/settings/feature-context'
import type { Paginated } from '@/lib/api/types/common'
import { clientProviders } from '../support/providers'
import { resolveServerTree } from '../support/server-tree'

// What the blog pages' tests share: the client contexts of the shell and the server tree resolved
// as the server would render it. Each test file mocks the loaders itself (vi.mock is per file).

/** A post-list page as the API sends it. */
export function paginated<T>(results: T[], { count = results.length, page = 1, pages = 1 } = {}) {
  const data: Paginated<T> = {
    count,
    total_pages: pages,
    current_page: page,
    page_size: 12,
    next: page < pages ? `https://api.test/api/v1/blog/post/list/?page=${page + 1}` : null,
    previous: page > 1 ? 'https://api.test/api/v1/blog/post/list/' : null,
    results,
  }
  return data
}

/** Renders an async page's tree inside the session, query and feature contexts. */
export async function renderTree(tree: unknown) {
  const { wrapper: Session } = clientProviders()
  const wrapper = ({ children }: { children: ReactNode }) => (
    <Session>
      <FeatureProvider initial={{}}>{children}</FeatureProvider>
    </Session>
  )
  return render(await resolveServerTree(tree as ReactNode), { wrapper })
}

/** The page's JSON-LD blocks, parsed, with their raw text (to check the escaping). */
export function jsonLdBlocks(): { raw: string; data: Record<string, unknown> }[] {
  return [...document.querySelectorAll('script[type="application/ld+json"]')].map((script) => ({
    raw: script.innerHTML,
    data: JSON.parse(script.innerHTML) as Record<string, unknown>,
  }))
}

/** What a page threw (a redirect, a 404), or a failure when it rendered. */
export async function thrown(rendering: Promise<unknown>): Promise<unknown> {
  try {
    await rendering
  } catch (error) {
    return error
  }
  throw new Error('expected the page to stop rendering')
}
