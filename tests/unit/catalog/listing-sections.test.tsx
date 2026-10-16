import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { AdminFaq } from '@/features/catalog/components/admin-faq'
import { ConsiderBeforeBuying } from '@/features/catalog/components/consider-before-buying'
import { ListingExtras } from '@/features/catalog/components/listing-extras'
import { ListingHero } from '@/features/catalog/components/listing-hero'
import { stubBrowserApis } from '../support/dom-stubs'

vi.mock('server-only', () => ({}))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock('@/config/store-config', async () => {
  const pure = await import('@/config/resolve-store-config')
  const { parseServerEnv } = await import('@/config/env-schema')
  const config = () =>
    pure.resolveStoreConfig(
      parseServerEnv({
        FIREFLY_API_URL: 'https://api.shop.ir/',
        SITE_URL: 'https://shop.ir/',
        FIREFLY_API_KEY: 'k',
      }),
    )
  return { ...pure, getStoreConfig: config }
})

stubBrowserApis()

const PLACEHOLDER = 'https://api.shop.ir/static/defaults/default.png'

describe('AdminFaq', () => {
  const items = [
    { question: 'گارانتی دارد؟', answer: 'بله.\nهجده ماه.' },
    { question: 'ارسال رایگان است؟', answer: 'بالای ده میلیون تومان.' },
    { question: '  ', answer: 'بی‌پرسش' },
  ]

  it('keeps every answer in the page, the closed ones hidden, one open at a time', async () => {
    const user = userEvent.setup()
    render(<AdminFaq items={items} />)
    const section = screen.getByRole('region', { name: 'پرسش‌های متداول' })
    expect(
      within(section)
        .getAllByRole('button')
        .map((button) => button.textContent),
    ).toEqual(['گارانتی دارد؟', 'ارسال رایگان است؟'])
    // In the HTML while closed (for search engines), hidden by the closed panel's CSS.
    const answer = screen.getByText('بالای ده میلیون تومان.')
    expect(answer.parentElement).toHaveAttribute('data-state', 'closed')
    expect(answer).toHaveClass('[[data-state=closed]>&]:hidden')

    await user.click(screen.getByRole('button', { name: 'ارسال رایگان است؟' }))
    expect(answer.parentElement).toHaveAttribute('data-state', 'open')
    await user.click(screen.getByRole('button', { name: 'گارانتی دارد؟' }))
    expect(answer.parentElement).toHaveAttribute('data-state', 'closed')
    expect(screen.getByText(/هجده ماه/).parentElement).toHaveAttribute('data-state', 'open')
  })

  it('renders nothing without a usable question and answer', () => {
    const { container } = render(<AdminFaq items={[{ question: 'x', answer: ' ' }]} />)
    expect(container).toBeEmptyDOMElement()
  })
})

describe('ConsiderBeforeBuying', () => {
  it("opens the operator's text in a dialog from the operator's button", async () => {
    const user = userEvent.setup()
    render(
      <ConsiderBeforeBuying
        data={{ title: 'پیش از خرید', text: '<p>به باتری توجه کنید.</p>', button: 'نکات' }}
      />,
    )
    expect(screen.getByRole('heading', { level: 2, name: 'پیش از خرید' })).toBeInTheDocument()
    const button = screen.getByRole('button', { name: 'نکات' })
    expect(button).toHaveAttribute('aria-haspopup', 'dialog')
    await user.click(button)
    // The dialog's code loads on the first opening.
    const dialog = await screen.findByRole('dialog', { name: 'پیش از خرید' })
    expect(within(dialog).getByText('به باتری توجه کنید.')).toBeInTheDocument()
    await user.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(button).toHaveFocus()
  })

  it('falls back to default labels, and is left out when the text is empty', () => {
    const { rerender, container } = render(
      <ConsiderBeforeBuying data={{ title: null, text: '<p>متن</p>', button: ' ' }} />,
    )
    expect(screen.getByRole('heading', { name: 'پیش از خرید بدانید' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'مطالعه' })).toBeInTheDocument()
    rerender(<ConsiderBeforeBuying data={{ title: 'x', text: '<p>&nbsp;</p>', button: null }} />)
    expect(container).toBeEmptyDOMElement()
  })
})

describe('ListingHero', () => {
  it("shows the name as the h1 and the first letter when there is only the API's placeholder", () => {
    render(
      <ListingHero
        title="سامسونگ"
        description="  محصولات اصل  "
        image={{ src: PLACEHOLDER, kind: 'logo' }}
      />,
    )
    expect(screen.getByRole('heading', { level: 1, name: 'سامسونگ' })).toBeInTheDocument()
    expect(screen.getByText('محصولات اصل')).toBeInTheDocument()
    expect(screen.getByText('س')).toHaveClass('size-[70px]', 'rounded-control')
    expect(screen.queryByRole('img')).toBeNull()
  })

  it('shows a real logo whole (contained, not cropped)', () => {
    const { container } = render(
      <ListingHero
        title="اپل"
        image={{ src: 'https://api.shop.ir/media/brand/apple.jpg', kind: 'logo' }}
      />,
    )
    expect(container.querySelector('img')).toHaveClass('object-contain')
    expect(screen.queryByText('اپل', { selector: 'p' })).toBeNull()
  })
})

describe('ListingExtras', () => {
  it('stacks the content, the consider-before-buying card and the FAQ, in that order', () => {
    render(
      <ListingExtras
        content="<h2>راهنما</h2><p>متن</p>"
        considerBeforeBuying={{ title: 'پیش از خرید', text: '<p>نکته</p>', button: null }}
        questions={[{ question: 'پرسش؟', answer: 'پاسخ.' }]}
      />,
    )
    expect(
      screen.getAllByRole('heading', { level: 2 }).map((heading) => heading.textContent),
    ).toEqual(['راهنما', 'پیش از خرید', 'پرسش‌های متداول'])
  })

  it('leaves its block empty (hidden by :empty) when there is nothing to show', () => {
    const { container } = render(
      <ListingExtras content="<p>&nbsp;</p>" considerBeforeBuying={null} questions={[]} />,
    )
    expect(container.firstElementChild).toBeEmptyDOMElement()
    expect(container.firstElementChild).toHaveClass('empty:hidden')
  })
})
