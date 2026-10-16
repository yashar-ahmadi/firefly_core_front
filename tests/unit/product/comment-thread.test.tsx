import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { CommentThread } from '@/features/product/components/reviews/comment-thread'
import { FeatureProvider } from '@/features/settings/feature-context'
import { clientProviders } from '../support/providers'
import { comment, reply } from './comment-fixtures'

vi.mock('@/lib/api/client', () => ({ bffFetch: vi.fn() }))

const SLUG = 'samsung-galaxy-s25-ultra'

function renderThread(node: Parameters<typeof CommentThread>[0]['comment'], canReply = false) {
  const { wrapper: Base } = clientProviders()
  const wrapper = ({ children }: { children: ReactNode }) => (
    <Base>
      <FeatureProvider initial={{}}>{children}</FeatureProvider>
    </Base>
  )
  return render(
    <ol>
      <CommentThread comment={node} slug={SLUG} canReply={canReply} />
    </ol>,
    { wrapper },
  )
}

const articles = () => screen.getAllByRole('article')

describe('CommentThread', () => {
  it('shows the author, the Jalali date, the stars, the title, the text and the points', () => {
    renderThread(comment({ negative_points: ['قیمت بالا'] }))
    const root = articles()[0]!
    expect(within(root).getByText('محمد رضایی')).toBeInTheDocument()
    const date = within(root).getByText('۲۸ خرداد ۱۴۰۵')
    expect(date.tagName).toBe('TIME')
    expect(date).toHaveAttribute('dateTime', '2026-06-18T15:00:00+03:30')
    expect(within(root).getByRole('img', { name: 'امتیاز ۴ از ۵' })).toBeInTheDocument()
    expect(within(root).getByRole('heading', { name: 'عالی ولی گران' })).toBeInTheDocument()
    expect(within(root).getByText(/کیفیت ساخت بی نظیره/)).toBeInTheDocument()
    // Pros and cons differ by icon and by a spoken label, not by colour alone.
    const pros = within(root).getByRole('list', { name: 'نقاط قوت' })
    expect(
      within(pros)
        .getAllByRole('listitem')
        .map((item) => item.textContent),
    ).toEqual(['کیفیت ساخت', 'ارسال سریع'])
    const cons = within(root).getByRole('list', { name: 'نقاط ضعف' })
    expect(within(cons).getByText('قیمت بالا')).toBeInTheDocument()
    expect(pros.querySelector('svg')).not.toBeNull()
    expect(cons.querySelector('svg')?.getAttribute('class')).not.toBe(
      pros.querySelector('svg')?.getAttribute('class'),
    )
  })

  it('marks a buyer, the viewer and the shop', () => {
    renderThread(
      comment({
        is_current_user: true,
        replies: [reply(3, '2026-06-19T10:00:00+03:30', { is_user_admin: true })],
      }),
    )
    const [root, answer] = articles()
    expect(within(root!).getByText('خریدار')).toBeInTheDocument()
    expect(within(root!).getByText('شما')).toBeInTheDocument()
    expect(within(root!).queryByText('پاسخ فروشنده')).toBeNull()
    expect(within(answer!).getByText('پاسخ فروشنده')).toBeInTheDocument()
    expect(within(answer!).queryByText('خریدار')).toBeNull()
  })

  it('shows replies oldest first (the API sends them newest first)', () => {
    renderThread(
      comment({
        replies: [
          reply(5, '2026-06-21T10:00:00+03:30'),
          reply(4, '2026-06-20T10:00:00+03:30'),
          reply(3, '2026-06-19T10:00:00+03:30'),
        ],
      }),
    )
    const texts = articles()
      .slice(1)
      .map((node) => within(node).getByText(/^پاسخ \d$/).textContent)
    expect(texts).toEqual(['پاسخ 3', 'پاسخ 4', 'پاسخ 5'])
  })

  it('indents replies at most two levels deep', () => {
    const deepest = reply(9, '2026-06-23T10:00:00+03:30')
    const third = reply(8, '2026-06-22T10:00:00+03:30', { replies: [deepest] })
    const second = reply(7, '2026-06-21T10:00:00+03:30', { replies: [third] })
    const first = reply(6, '2026-06-20T10:00:00+03:30', { replies: [second] })
    renderThread(comment({ replies: [first] }))
    const depths = articles().map((node) => node.closest('li')?.getAttribute('data-depth'))
    expect(depths).toEqual(['0', '1', '2', '2', '2'])
  })

  it('offers a reply form under a question when replies are allowed', async () => {
    const user = userEvent.setup()
    renderThread(comment({ comment_type: 'question', title: null, rating: null }), true)
    const open = screen.getByRole('button', { name: 'پاسخ' })
    expect(open).toHaveAttribute('aria-expanded', 'false')
    await user.click(open)
    expect(screen.getByRole('form', { name: 'ثبت پاسخ' })).toBeInTheDocument()
  })
})
