import { describe, expect, it } from 'vitest'
import { OFFLINE_PAGES, OFFLINE_PATH } from '@/features/pwa/offline-rules'
import { directImports, importersOf } from '../support/import-graph'

// The service worker keeps an anonymous copy of the pages in OFFLINE_PAGES and shows it to a
// signed-in visitor too (after 4 s, or offline): each kept shop page mounts KeptCopySession,
// which sets the session right on mount. Only those pages pay for it (a client component a page
// imports is in that page's chunks): no other module imports it.

const KEPT_COPY_SESSION = 'src/lib/session/kept-copy-session.tsx'
/** Each kept shop page's module (`/offline/` is the offline page itself: no session state). */
const PAGE_MODULES: Record<string, string> = { '/': 'src/app/(shop)/page.tsx' }

describe('the kept pages and their session state', () => {
  it('every kept shop page is known here (a page added to OFFLINE_PAGES mounts it too)', () => {
    expect(OFFLINE_PAGES.filter((path) => path !== OFFLINE_PATH)).toEqual(Object.keys(PAGE_MODULES))
  })

  it.each(Object.entries(PAGE_MODULES))('%s mounts KeptCopySession', (_, page) => {
    expect(directImports(page)).toContain(KEPT_COPY_SESSION)
  })

  it('no other module imports it (every other route is byte for byte without it)', () => {
    expect(importersOf(KEPT_COPY_SESSION)).toEqual(Object.values(PAGE_MODULES))
  })
})
