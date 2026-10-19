import { render, screen, waitFor, within } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PostGrid } from '@/features/blog/components/post-grid'
import { RelatedPosts } from '@/features/blog/components/related-posts'
import { FeatureProvider } from '@/features/settings/feature-context'
import { clientProviders } from '../support/providers'
import { postFixture } from './fixtures'

// A post's page is read per request as the visitor (blog digest §1.5), and so are its related
// posts: their `is_in_reading_list` is the viewer's own (the API serialises them with the same
// request; the detail is never cached). Their bookmarks start from it, so they never flash
// unpressed while the visitor's saved ids load. A cached grid (the blog's home and archive, read
// anonymously: always false) has no such flag to trust.

const mocks = vi.hoisted(() => ({ bffFetch: vi.fn() }))
vi.mock('@/lib/api/client', () => ({ bffFetch: mocks.bffFetch }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }))

const REMOVE = 'حذف از لیست مطالعه'
const SAVE = 'افزودن به لیست مطالعه'
const SAVED = postFixture({ id: 10002, slug: 'saved', name: 'ذخیره‌شده', is_in_reading_list: true })
const OTHER = postFixture({ id: 10003, slug: 'other', name: 'دیگری', is_in_reading_list: false })

function renderSignedIn(children: ReactNode) {
  const { wrapper: Session } = clientProviders({ hasSession: true })
  const wrapper = ({ children }: { children: ReactNode }) => (
    <Session>
      <FeatureProvider initial={{}}>{children}</FeatureProvider>
    </Session>
  )
  render(children, { wrapper })
}

/** The bookmark of the card whose title link says `name`. */
const bookmarkOf = (name: string) =>
  within(screen.getByRole('link', { name }).closest('article')!).getByRole('button', {
    name: /لیست مطالعه/,
  })

beforeEach(() => {
  // The visitor's saved ids never come: the test looks at what shows meanwhile.
  mocks.bffFetch.mockReset().mockReturnValue(new Promise(() => {}))
})

describe('related posts’ bookmarks', () => {
  it('start from the viewer’s own flag while the saved ids load', async () => {
    renderSignedIn(<RelatedPosts posts={[SAVED, OTHER]} categoryLinks={new Map()} />)
    await waitFor(() => expect(bookmarkOf('ذخیره‌شده')).toHaveAttribute('aria-disabled', 'true'))
    expect(bookmarkOf('ذخیره‌شده')).toHaveAttribute('aria-pressed', 'true')
    expect(bookmarkOf('ذخیره‌شده')).toHaveAccessibleName(REMOVE)
    expect(bookmarkOf('دیگری')).toHaveAttribute('aria-pressed', 'false')
  })

  it('a cached grid (the archive) trusts no card flag: unpressed until the ids are in', async () => {
    renderSignedIn(<PostGrid posts={[SAVED, OTHER]} categoryLinks={new Map()} />)
    await waitFor(() => expect(bookmarkOf('ذخیره‌شده')).toHaveAttribute('aria-disabled', 'true'))
    expect(bookmarkOf('ذخیره‌شده')).toHaveAccessibleName(SAVE)
  })
})
