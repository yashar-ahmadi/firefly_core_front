import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CommentComposer } from '@/features/product/components/reviews/comment-composer'
import { FeatureProvider, type FeatureMap } from '@/features/settings/feature-context'
import { ApiError } from '@/lib/api/errors'
import { clientProviders } from '../support/providers'

const mocks = vi.hoisted(() => ({ bffFetch: vi.fn() }))

vi.mock('@/lib/api/client', () => ({ bffFetch: mocks.bffFetch }))

const SLUG = 'samsung-galaxy-s25-ultra'
const PATH = `product/detail/${SLUG}/comment/submit/`
const OK = 'نظر شما با موفقیت ثبت شد و پس از تأیید نمایش داده می شود.'
const OFF = 'ثبت دیدگاه موقتاً غیرفعال است.'

function renderComposer(type: 'comment' | 'question', comments: boolean | null = true) {
  const { wrapper: Base } = clientProviders()
  const features: Partial<FeatureMap> = {
    product_comments: {
      key: 'product_comments',
      name: 'ثبت نظر روی محصولات',
      enabled: comments !== false,
      reason: comments === false ? OFF : null,
    },
  }
  const wrapper = ({ children }: { children: ReactNode }) => (
    <Base>
      <FeatureProvider initial={features}>{children}</FeatureProvider>
    </Base>
  )
  render(<CommentComposer slug={SLUG} type={type} />, { wrapper })
  return userEvent.setup()
}

beforeEach(() => {
  mocks.bffFetch.mockReset()
})

describe('CommentComposer for reviews', () => {
  it('opens the review form in place, and closes it again', async () => {
    const user = renderComposer('comment')
    const open = screen.getByRole('button', { name: 'ثبت دیدگاه' })
    expect(open).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('form')).toBeNull()
    await user.click(open)
    expect(open).toHaveAttribute('aria-expanded', 'true')
    const form = screen.getByRole('form', { name: 'ثبت دیدگاه' })
    expect(open).toHaveAttribute('aria-controls', form.parentElement!.id)
    expect(screen.getByRole('textbox', { name: /^متن دیدگاه/ })).toHaveFocus()
    await user.click(screen.getByRole('button', { name: 'انصراف' }))
    expect(screen.queryByRole('form')).toBeNull()
    expect(open).toHaveFocus()
  })

  it('shows the moderation message in place of the form once sent (no optimistic entry)', async () => {
    mocks.bffFetch.mockResolvedValue({ data: {}, msg: OK, status: 201 })
    const user = renderComposer('comment')
    await user.click(screen.getByRole('button', { name: 'ثبت دیدگاه' }))
    await user.type(screen.getByRole('textbox', { name: /^متن دیدگاه/ }), 'عالی')
    await user.type(screen.getByRole('textbox', { name: /^نام \(/ }), 'سارا')
    await user.click(screen.getByRole('button', { name: 'ارسال دیدگاه' }))
    const status = await screen.findByRole('status')
    expect(status).toHaveTextContent(OK)
    expect(status).toHaveFocus()
    expect(screen.queryByRole('form')).toBeNull()
  })

  it('is hidden with the reason while product comments are switched off', () => {
    renderComposer('comment', false)
    expect(screen.queryByRole('button', { name: 'ثبت دیدگاه' })).toBeNull()
    expect(screen.getByText(OFF)).toBeInTheDocument()
  })

  it('goes away when the switch is turned off meanwhile (503)', async () => {
    mocks.bffFetch.mockRejectedValue(
      new ApiError({
        status: 503,
        feature: 'product_comments',
        errors: [{ code: 'feature_disabled', attr: null, detail: OFF }],
      }),
    )
    const user = renderComposer('comment')
    await user.click(screen.getByRole('button', { name: 'ثبت دیدگاه' }))
    await user.type(screen.getByRole('textbox', { name: /^متن دیدگاه/ }), 'عالی')
    await user.type(screen.getByRole('textbox', { name: /^نام \(/ }), 'سارا')
    await user.click(screen.getByRole('button', { name: 'ارسال دیدگاه' }))
    await waitFor(() => expect(screen.queryByRole('form')).toBeNull())
    expect(screen.getByText(OFF)).toBeInTheDocument()
  })
})

describe('CommentComposer for questions (QuestionForm)', () => {
  it('asks a text-only question', async () => {
    mocks.bffFetch.mockResolvedValue({ data: {}, msg: OK, status: 201 })
    const user = renderComposer('question')
    await user.click(screen.getByRole('button', { name: 'ثبت پرسش' }))
    const form = screen.getByRole('form', { name: 'ثبت پرسش' })
    expect(screen.queryByRole('radio')).toBeNull()
    expect(screen.queryByRole('textbox', { name: /^عنوان/ })).toBeNull()
    await user.type(within(form).getByRole('textbox', { name: /^متن پرسش/ }), 'گارانتی دارد؟')
    await user.type(within(form).getByRole('textbox', { name: /^نام \(/ }), 'علی')
    await user.click(within(form).getByRole('button', { name: 'ارسال پرسش' }))
    expect(mocks.bffFetch).toHaveBeenCalledWith(PATH, {
      method: 'POST',
      body: { review: 'گارانتی دارد؟', name: 'علی', comment_type: 'question' },
    })
    expect(await screen.findByRole('status')).toHaveTextContent(OK)
  })
})
