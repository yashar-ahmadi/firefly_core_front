import type { ContactDetails } from '@/components/layout/contact-block'
import { richContentHtml } from '@/features/content/rich-content'
import { displayStyle, type DisplayStyle } from '@/features/display/display-style'
import { PromoBanners } from '@/features/display/promo-banners'
import { toPromoItems } from '@/features/display/promo-item'
import { PromoSlider } from '@/features/display/promo-slider'
import { StyledRichText } from '@/features/display/styled-rich-text'
import type { BlockPlacement, PageBlock, PageBlockItem } from '@/lib/api/types/page'
import type { Translate } from '@/lib/i18n/translator'
import { BlockFrame } from './block-frame'
import { blocksAt, text } from './blocks'
import { CardsBlock } from './cards-block'
import { ContactInfoBlock } from './contact-info-block'
import { CtaBlock } from './cta-block'
import { FaqBlock } from './faq-block'
import { GalleryBlock } from './gallery-block'
import { StatsBlock } from './stats-block'
import { TestimonialsBlock } from './testimonials-block'
import { VideoBlock, videoDrawsTitle } from './video-block'

export interface PageBlocksProps {
  blocks: PageBlock[]
  placement: BlockPlacement
  /** The shop's contact details (`contactDetails(settings)`), for `contact_info`; null: none. */
  contact: ContactDetails | null
  t: Translate
}

/** The items a block draws: those with what their type needs (the API sends only those). */
function itemsOf(block: PageBlock, needs: (item: PageBlockItem) => boolean): PageBlockItem[] {
  return (block.items ?? []).filter(needs)
}

const hasTitle = (item: PageBlockItem) => text(item.title) !== ''
const hasImage = (item: PageBlockItem) => text(item.image) !== ''

/** One block in its style, or null when it has nothing to draw. */
function Block({
  block,
  contact,
  t,
}: {
  block: PageBlock
  contact: ContactDetails | null
  t: Translate
}) {
  const style: DisplayStyle = displayStyle(block.style)
  const title = text(block.title)
  const url = text(block.link?.url)
  // «مشاهدهٔ همه» of the types that have one (`slider`, `banners`, `cards`).
  const seeAll = url ? { href: url, label: text(block.link?.title) || t('see_all') } : null

  switch (block.type) {
    case 'slider': {
      const items = toPromoItems(block.items ?? [])
      if (items.length === 0) return null
      return (
        <BlockFrame block={block} style={style} link={seeAll} as="div">
          <PromoSlider items={items} style={style} label={title || 'اسلایدر'} />
        </BlockFrame>
      )
    }
    case 'banners': {
      const items = toPromoItems(block.items ?? [])
      if (items.length === 0) return null
      return (
        <BlockFrame
          block={block}
          style={style}
          link={seeAll}
          as={style === 'style_2' && items.length > 1 ? 'div' : 'section'}
        >
          <PromoBanners items={items} style={style} label={title || 'بنر'} />
        </BlockFrame>
      )
    }
    case 'gallery': {
      const pictures = itemsOf(block, hasImage).map((item) => ({
        id: item.id,
        image: text(item.image),
        alt: text(item.alt),
        caption: text(item.title),
      }))
      if (pictures.length === 0) return null
      return (
        <BlockFrame block={block} style={style} as={style === 'style_3' ? 'div' : 'section'}>
          <GalleryBlock pictures={pictures} style={style} label={title || 'گالری تصاویر'} />
        </BlockFrame>
      )
    }
    case 'cards': {
      const items = itemsOf(block, hasTitle)
      if (items.length === 0) return null
      return (
        <BlockFrame
          block={block}
          style={style}
          link={seeAll}
          as={style === 'style_3' ? 'div' : 'section'}
        >
          <CardsBlock items={items} style={style} label={title || 'کارت\u{200C}ها'} />
        </BlockFrame>
      )
    }
    case 'stats': {
      const items = itemsOf(block, (item) => hasTitle(item) && text(item.value) !== '')
      if (items.length === 0) return null
      return (
        <BlockFrame
          block={block}
          style={style}
          align={style === 'style_1' || style === 'style_3' ? 'center' : 'start'}
        >
          <StatsBlock items={items} style={style} />
        </BlockFrame>
      )
    }
    case 'testimonials': {
      const items = itemsOf(block, (item) => hasTitle(item) && text(item.description) !== '')
      if (items.length === 0) return null
      return (
        <BlockFrame
          block={block}
          style={style}
          as={style === 'style_1' || style === 'style_3' ? 'div' : 'section'}
          align={style === 'style_3' ? 'center' : 'start'}
        >
          <TestimonialsBlock items={items} style={style} label={title || 'نظر مشتریان'} />
        </BlockFrame>
      )
    }
    case 'faq': {
      const items = itemsOf(block, (item) => hasTitle(item) && text(item.description) !== '')
      if (items.length === 0) return null
      return (
        <BlockFrame block={block} style={style} bare={style === 'style_3'}>
          <FaqBlock block={block} items={items} style={style} />
        </BlockFrame>
      )
    }
    case 'video':
      if (!text(block.video_url)) return null
      return (
        <BlockFrame block={block} style={style} bare={videoDrawsTitle(style)}>
          <VideoBlock block={block} style={style} />
        </BlockFrame>
      )
    case 'call_to_action':
      if (!title || !url) return null
      return (
        <BlockFrame block={block} style={style} bare>
          <CtaBlock block={block} style={style} />
        </BlockFrame>
      )
    case 'rich_text': {
      const html = block.content ? richContentHtml(block.content) : null
      if (html === null) return null
      return (
        <BlockFrame block={block} style={style} align={style === 'style_4' ? 'center' : 'start'}>
          <StyledRichText html={html} style={style} />
        </BlockFrame>
      )
    }
    case 'contact_info':
      if (contact === null) return null
      return (
        <BlockFrame block={block} style={style}>
          <ContactInfoBlock details={contact} style={style} t={t} />
        </BlockFrame>
      )
    default:
      // A type added to the backend after this storefront: skipped (`blocksAt` drops it too).
      return null
  }
}

/**
 * A content page's blocks at one place (content digest §2): `before_content` between the title
 * and the text, `after_content` after it, each in the API's order and its own style. A block
 * with nothing to draw, or of a type this storefront does not know, renders nothing.
 */
export function PageBlocks({ blocks, placement, contact, t }: PageBlocksProps) {
  return blocksAt(blocks, placement).map((block) => (
    <Block key={block.id} block={block} contact={contact} t={t} />
  ))
}
