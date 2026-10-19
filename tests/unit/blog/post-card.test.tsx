import { render, screen, within } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { PostCard } from '@/features/blog/components/post-card'
import { FeatureProvider } from '@/features/settings/feature-context'
import type { PostCard as PostCardData } from '@/lib/api/types/blog'
import { clientProviders } from '../support/providers'
import { postFixture } from './fixtures'

// A post card (Plan 2's card pattern): an <article> whose title link stretches over the card,
// with the picture, the first category (linked when it has a page), the title (dir="auto"), the
// excerpt, the author's avatar and name, the Jalali publish date in Persian digits, and the
// reading-list bookmark above the stretched link.

vi.mock('@/lib/api/client', () => ({ bffFetch: vi.fn(() => new Promise(() => {})) }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }))

const LINKS = new Map([[10002, '/blog/category/buying-guide/']])

function renderCard(post: PostCardData = postFixture()) {
  const { wrapper: Session } = clientProviders()
  const wrapper = ({ children }: { children: ReactNode }) => (
    <Session>
      <FeatureProvider initial={{}}>{children}</FeatureProvider>
    </Session>
  )
  return render(<PostCard post={post} categoryLinks={LINKS} />, { wrapper })
}

describe('PostCard', () => {
  it('is an article whose title links to /blog/<slug>/, the link stretched over the card', () => {
    renderCard()
    const article = screen.getByRole('article')
    const title = within(article).getByRole('heading', { level: 3, name: 'بهترین گوشی‌های سال' })
    expect(title).toHaveAttribute('dir', 'auto')
    const link = within(title).getByRole('link')
    expect(link).toHaveAttribute('href', '/blog/best-phones-under-30m/')
    expect(link.className).toContain("after:content-['']")
    expect(link.className).toContain('after:absolute')
  })

  it('shows the Jalali publish date in Persian digits, with the machine date', () => {
    renderCard()
    const time = screen.getByText('۱۰ شهریور ۱۴۰۵')
    expect(time.tagName).toBe('TIME')
    expect(time).toHaveAttribute('dateTime', '2026-09-01T15:00:00+03:30')
  })

  it('shows the excerpt, the author’s name and avatar, and the category linked to its page', () => {
    renderCard()
    expect(screen.getByText('پنج گوشی خوب برای بودجهٔ متوسط.')).toBeInTheDocument()
    expect(screen.getByText('سمیرا کاظمی')).toBeInTheDocument()
    // Decorative (alt=""): the name beside it says who wrote it.
    const avatar = document.querySelector('img[src*="avatars/s.jpg"]')
    expect(avatar).toHaveAttribute('alt', '')
    expect(screen.getByRole('link', { name: 'راهنمای خرید' })).toHaveAttribute(
      'href',
      '/blog/category/buying-guide/',
    )
  })

  it('a draft category is named, unlinked; no author or date: those parts are left out', () => {
    renderCard(
      postFixture({
        categories: [{ id: 99, name: 'پیش‌نویس', slug: 'draft', parent_id: null }],
        author: null,
        published_at: null,
        description: null,
      }),
    )
    expect(screen.getByText('پیش‌نویس').closest('a')).toBeNull()
    expect(screen.queryByText('سمیرا کاظمی')).toBeNull()
    expect(document.querySelector('time')).toBeNull()
  })

  it('carries the reading-list bookmark, described by the title, above the stretched link', () => {
    renderCard()
    const button = screen.getByRole('button', { name: 'افزودن به لیست مطالعه' })
    expect(button).toHaveAccessibleDescription('بهترین گوشی‌های سال')
    expect(button.closest('.relative.z-\\[1\\]')).not.toBeNull()
  })
})
