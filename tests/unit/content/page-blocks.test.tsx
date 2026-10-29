import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ComponentProps } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { contactDetails } from '@/components/layout/contact-block'
import { blocksAt } from '@/features/content/blocks/blocks'
import { PageBlocks } from '@/features/content/blocks/page-blocks'
import { DISPLAY_STYLES } from '@/features/display/display-style'
import type { PageBlock, PageBlockItem } from '@/lib/api/types/page'
import type { SiteSettings } from '@/lib/api/types/settings'
import { createTranslator } from '@/lib/i18n/translator'
import { stubBrowserApis } from '../support/dom-stubs'
import { clientProviders } from '../support/providers'

// A content page's eleven block types (content digest §2), each in its four styles, shaped as the
// dev backend answers them (`about-us`, `contact-us`, `return-policy` on 2026-10-29).

vi.mock('server-only', () => ({}))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock('next/link', () => ({
  default: (props: ComponentProps<'a'> & { href: string; prefetch?: unknown }) => {
    const anchorProps: ComponentProps<'a'> & { prefetch?: unknown } = { ...props }
    delete anchorProps.prefetch
    return <a {...anchorProps} />
  },
}))

stubBrowserApis()

const MEDIA = 'http://localhost:8000/media/pages/blocks/26/10/29'
const t = createTranslator({})

function item(overrides: Partial<PageBlockItem>): PageBlockItem {
  return {
    id: 1,
    title: null,
    subtitle: null,
    description: null,
    value: null,
    image: null,
    mobile_image: null,
    icon: null,
    alt: null,
    link: null,
    ...overrides,
  }
}

function block(overrides: Partial<PageBlock>): PageBlock {
  return {
    id: 10001,
    type: 'rich_text',
    style: 'style_1',
    placement: 'after_content',
    title: '',
    subtitle: null,
    content: null,
    image: null,
    mobile_image: null,
    alt: null,
    video_url: null,
    link: null,
    items: null,
    ...overrides,
  }
}

const CONTACT = contactDetails({
  phone: '+982191000000',
  phone2: null,
  sales_phone: '+982191000100',
  sales_phone2: '+989121110022',
  email: 'support@shop.ir',
  address: 'تهران، خیابان ولیعصر',
  postal_code: '1969734512',
  map: null,
  response_time: 'شنبه تا چهارشنبه ۹ تا ۱۸',
} as unknown as SiteSettings)

function show(
  blocks: PageBlock[],
  placement: 'before_content' | 'after_content' = 'after_content',
) {
  const { wrapper } = clientProviders()
  return render(<>{PageBlocks({ blocks, placement, contact: CONTACT, t })}</>, { wrapper })
}

const slides = (count: number) =>
  Array.from({ length: count }, (_, index) =>
    item({
      id: index + 1,
      title: `اسلاید ${index + 1}`,
      description: 'متن اسلاید',
      image: `${MEDIA}/slide-${index + 1}.jpg`,
      alt: `تصویر اسلاید ${index + 1}`,
      link: { url: `/product/p-${index + 1}/`, title: 'خرید' },
    }),
  )

describe('placement', () => {
  it('keeps each block at its place, in the API’s order; anything unknown goes below', () => {
    const blocks = [
      block({ id: 1, placement: 'before_content' }),
      block({ id: 2, placement: 'after_content' }),
      block({ id: 3, placement: 'beside_content' }),
      block({ id: 4, placement: 'before_content', type: 'carousel_3d' }),
    ]
    expect(blocksAt(blocks, 'before_content').map((b) => b.id)).toEqual([1])
    expect(blocksAt(blocks, 'after_content').map((b) => b.id)).toEqual([2, 3])
  })
})

describe.each(DISPLAY_STYLES)('%s', (style) => {
  it('slider: every slide, the block’s see-all', () => {
    show([
      block({
        type: 'slider',
        style,
        title: 'پیشنهادها',
        link: { url: '/product/list/', title: '' },
        items: slides(3),
      }),
    ])
    for (const n of [1, 2, 3]) {
      expect(screen.getAllByRole('img', { name: `تصویر اسلاید ${n}` }).length).toBeGreaterThan(0)
    }
    expect(screen.getByRole('link', { name: 'مشاهده\u{0654} همه' })).toHaveAttribute(
      'href',
      '/product/list/',
    )
  })

  it('banners: every banner linked', () => {
    show([block({ type: 'banners', style, title: 'بنرها', items: slides(3) })])
    for (const n of [1, 2, 3]) {
      expect(screen.getAllByRole('img', { name: `تصویر اسلاید ${n}` }).length).toBeGreaterThan(0)
    }
  })

  it('gallery: every picture opens the viewer at it', async () => {
    const user = userEvent.setup()
    show([
      block({
        type: 'gallery',
        style,
        title: 'گالری فروشگاه',
        items: [1, 2, 3].map((n) =>
          item({ id: n, image: `${MEDIA}/g-${n}.jpg`, alt: `عکس ${n}`, title: `زیرنویس ${n}` }),
        ),
      }),
    ])
    expect(screen.getByText('زیرنویس 2')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'نمایش بزرگ عکس 2' }))
    const viewer = await screen.findByRole('dialog', { name: 'گالری فروشگاه' })
    expect(within(viewer).getByRole('img', { name: 'عکس 2' })).toBeInTheDocument()
    // Embla does not lay out in jsdom: the counter's figure is the browser's to check.
    expect(within(viewer).getByText(/از ۳$/)).toBeInTheDocument()
  })

  it('cards: every card with its words, a linked one as a link', () => {
    show([
      block({
        type: 'cards',
        style,
        title: 'چرا ما؟',
        items: [
          item({
            id: 1,
            title: 'هفت روز ضمانت بازگشت',
            description: 'تا هفت روز پس می‌گیریم.',
            link: { url: '/page/return-policy/', title: 'رویهٔ بازگرداندن کالا' },
          }),
          item({ id: 2, title: 'ارسال سریع', description: 'همان روز تحویل پست.' }),
        ],
      }),
    ])
    expect(screen.getByText('ارسال سریع')).toBeInTheDocument()
    expect(screen.getByText('همان روز تحویل پست.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /هفت روز ضمانت بازگشت/ })).toHaveAttribute(
      'href',
      '/page/return-policy/',
    )
  })

  it('stats: each figure as its label’s description', () => {
    const { container } = show([
      block({
        type: 'stats',
        style,
        title: 'در یک نگاه',
        items: [
          item({ id: 1, title: 'سال تجربه', value: '۷+' }),
          item({ id: 2, title: 'مشتری راضی', value: '۲۵۰۰۰+' }),
        ],
      }),
    ])
    const terms = [...container.querySelectorAll('dt')].map((dt) => dt.textContent)
    expect(terms).toEqual(['سال تجربه', 'مشتری راضی'])
    expect(screen.getByText('۲۵۰۰۰+').tagName).toBe('DD')
  })

  it('testimonials: each quote with its name and role', () => {
    show([
      block({
        type: 'testimonials',
        style,
        title: 'نظر مشتریان',
        items: [
          item({ id: 1, title: 'سارا', subtitle: 'مشتری از ۱۴۰۲', description: 'عالی بود.' }),
          item({ id: 2, title: 'علی', description: 'ارسال سریع.' }),
        ],
      }),
    ])
    expect(screen.getAllByText('عالی بود.')[0]!.closest('blockquote')).not.toBeNull()
    expect(screen.getAllByText('مشتری از ۱۴۰۲').length).toBeGreaterThan(0)
    expect(screen.getAllByText('علی').length).toBeGreaterThan(0)
  })

  it('faq: every question, its answer shown or a press away', async () => {
    const user = userEvent.setup()
    show([
      block({
        type: 'faq',
        style,
        title: 'پرسش‌های پرتکرار',
        items: [
          item({ id: 1, title: 'کی ارسال می‌شود؟', description: 'همان روز.' }),
          item({ id: 2, title: 'هزینهٔ ارسال؟', description: 'رایگان.' }),
        ],
      }),
    ])
    expect(screen.getByRole('heading', { level: 2, name: 'پرسش‌های پرتکرار' })).toBeInTheDocument()
    if (style === 'style_4') {
      expect(screen.getByText('همان روز.')).toBeVisible()
    } else {
      await user.click(screen.getByRole('button', { name: 'کی ارسال می‌شود؟' }))
      expect(screen.getByText('همان روز.')).toBeVisible()
    }
  })

  it('video: a play button that loads the YouTube player only when pressed', async () => {
    const user = userEvent.setup()
    show([
      block({
        type: 'video',
        style,
        title: 'آشنایی با فروشگاه',
        video_url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      }),
    ])
    expect(document.querySelector('iframe')).toBeNull()
    await user.click(screen.getByRole('button', { name: 'پخش ویدیو: آشنایی با فروشگاه' }))
    const player = document.querySelector('iframe')!
    expect(player.getAttribute('src')).toBe(
      'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?autoplay=1&rel=0',
    )
    expect(player).toHaveAttribute('title', 'آشنایی با فروشگاه')
    expect(player.getAttribute('sandbox')).toContain('allow-scripts')
  })

  it('video: a link to a site that cannot be embedded, in a new tab', () => {
    show([block({ type: 'video', style, title: 'ویدیو', video_url: 'https://example.com/v/1' })])
    const link = screen.getByRole('link', { name: /تماشای ویدیو/ })
    expect(link).toHaveAttribute('href', 'https://example.com/v/1')
    expect(link).toHaveAttribute('target', '_blank')
  })

  it('call to action: its title and its button', () => {
    show([
      block({
        type: 'call_to_action',
        style,
        title: 'پیش از ثبت سفارش، قوانین را بخوانید',
        subtitle: 'شرایط ارسال و مرجوعی',
        alt: '',
        link: { url: '/page/terms/', title: 'قوانین و مقررات' },
      }),
    ])
    expect(
      screen.getByRole('heading', { level: 2, name: 'پیش از ثبت سفارش، قوانین را بخوانید' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'قوانین و مقررات' })).toHaveAttribute(
      'href',
      '/page/terms/',
    )
  })

  it('rich text: its HTML sanitised', () => {
    show([
      block({
        type: 'rich_text',
        style,
        title: 'مأموریت ما',
        content: '<p onclick="x()">خرید ساده برای همه</p><script>alert(1)</script>',
      }),
    ])
    expect(screen.getByText('خرید ساده برای همه')).not.toHaveAttribute('onclick')
    expect(document.querySelector('script')).toBeNull()
  })

  it('contact info: the support and sales lines from the settings', () => {
    show([block({ type: 'contact_info', style, title: 'راه‌های ارتباط' })])
    const region = screen.getByRole('region', { name: 'راه‌های ارتباط' })
    for (const [label, tel] of [
      ['۰۲۱ ۹۱۰۰ ۰۰۰۰', '+982191000000'],
      ['۰۲۱ ۹۱۰۰ ۰۱۰۰', '+982191000100'],
    ] as const) {
      const link = within(region)
        .getAllByRole('link')
        .find((a) => a.textContent?.includes(label))
      expect(link, label).toHaveAttribute('href', `tel:${tel}`)
    }
    expect(within(region).getByRole('link', { name: /support@shop.ir/ })).toHaveAttribute(
      'href',
      'mailto:support@shop.ir',
    )
  })
})

describe('blocks with nothing to draw render nothing', () => {
  it('no items, no URL, no visible text, no title or link, no contact details', () => {
    const { container } = render(
      <>
        {PageBlocks({
          blocks: [
            block({ id: 1, type: 'slider', items: [] }),
            block({ id: 2, type: 'gallery', items: [item({ image: null })] }),
            block({ id: 3, type: 'video', video_url: null }),
            block({ id: 4, type: 'rich_text', content: '<p>&nbsp;</p>' }),
            block({ id: 5, type: 'call_to_action', title: 'بدون دکمه', link: null }),
            block({ id: 6, type: 'stats', items: [item({ title: 'بی‌عدد', value: '' })] }),
          ],
          placement: 'after_content',
          contact: null,
          t,
        })}
        {PageBlocks({
          blocks: [block({ id: 7, type: 'contact_info' })],
          placement: 'after_content',
          contact: null,
          t,
        })}
      </>,
    )
    expect(container).toBeEmptyDOMElement()
  })
})
