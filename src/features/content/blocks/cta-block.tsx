import { ChevronLeft, Megaphone } from 'lucide-react'
import { buttonClasses } from '@/components/ui/button-styles'
import { cn } from '@/components/ui/cn'
import type { DisplayStyle } from '@/features/display/display-style'
import { PromoImage } from '@/features/home/promo-image'
import type { PageBlock } from '@/lib/api/types/page'
import { StoreLink } from '@/lib/links/store-link'
import { blockHeadingId, text } from './blocks'

// The `call_to_action` block (content digest §2): a title, a subtitle, one button (`link`,
// always there) and an optional picture (`image`, `mobile_image`), in one of four styles. It
// draws its own title (BlockFrame `bare`).

/** The button's label when the operator wrote none. */
const CTA = 'مشاهده'

export interface CtaBlockProps {
  block: PageBlock
  style: DisplayStyle
}

const WHITE_BUTTON = cn(
  buttonClasses({ size: 'lg' }),
  'bg-white text-brand-800 shadow-sm hover:bg-brand-50 active:bg-brand-100',
)

/**
 * The call in one of four styles: 1. a band of the brand's gradient, its words at the start, a
 * white button at the end, the picture (if any) beside it from 48rem of room; 2. the picture
 * filling the box under a dark veil, the words and button centred over it (the brand's gradient
 * without a picture); 3. a card, the picture on one side and the words with the button on the
 * other (a tinted panel with an icon without a picture); 4. a quiet outlined box, centred.
 */
export function CtaBlock({ block, style }: CtaBlockProps) {
  const title = text(block.title)
  const url = text(block.link?.url)
  if (!title || !url) return null
  const subtitle = text(block.subtitle)
  const label = text(block.link?.title) || CTA
  const image = text(block.image)
  const mobile = text(block.mobile_image) || null
  const alt = text(block.alt)
  const id = blockHeadingId(block)
  const picture = (sizes: string) =>
    image ? <PromoImage image={image} mobileImage={mobile} alt={alt} sizes={sizes} /> : null
  const heading = (className: string) => (
    <h2 id={id} className={className}>
      {title}
    </h2>
  )
  const button = (className: string) => (
    <StoreLink href={url} className={className}>
      {label}
      <ChevronLeft aria-hidden className="ltr:rotate-180" />
    </StoreLink>
  )

  if (style === 'style_2') {
    return (
      <div className="relative isolate flex min-h-72 flex-col items-center justify-center gap-4 overflow-hidden rounded-card bg-linear-to-l from-brand-600 to-brand-800 px-5 py-12 text-center shadow-card md:min-h-80 md:px-10">
        {image && (
          <>
            {picture('(min-width: 1440px) 1392px, 100vw')}
            <span aria-hidden className="absolute inset-0 -z-0 bg-ink-950/60" />
          </>
        )}
        <div className="relative flex max-w-2xl flex-col items-center gap-3">
          {heading(
            cn(
              'text-2xl leading-10 font-bold md:text-3xl md:leading-[3rem]',
              image ? 'text-white' : 'text-brand-fg',
            ),
          )}
          {subtitle && (
            <p
              className={cn(
                'text-base leading-7 md:text-lg md:leading-8',
                image ? 'text-ink-100' : 'text-brand-fg',
              )}
            >
              {subtitle}
            </p>
          )}
          {button(cn(WHITE_BUTTON, 'mt-2'))}
        </div>
      </div>
    )
  }

  if (style === 'style_3') {
    return (
      <div className="grid overflow-hidden rounded-card bg-white shadow-card @3xl:grid-cols-2">
        <div className="relative isolate aspect-video bg-brand-50 @3xl:aspect-auto @3xl:min-h-72">
          {picture('(min-width: 1024px) 50vw, 100vw') ?? (
            <span
              aria-hidden
              className="absolute inset-0 grid place-items-center bg-linear-to-br from-brand-50 to-brand-100 text-brand-600 [&_svg]:size-20"
            >
              <Megaphone />
            </span>
          )}
        </div>
        <div className="flex flex-col justify-center gap-3 p-6 @3xl:p-10">
          {heading('text-2xl leading-10 font-bold text-ink-900')}
          {subtitle && <p className="text-base leading-8 text-ink-600">{subtitle}</p>}
          {button(cn(buttonClasses({ size: 'lg' }), 'mt-2 self-start'))}
        </div>
      </div>
    )
  }

  if (style === 'style_4') {
    return (
      <div className="flex flex-col items-center gap-3 rounded-card border-2 border-dashed border-brand-300 bg-white px-5 py-8 text-center md:px-10">
        {heading('text-xl leading-9 font-bold text-ink-900 md:text-2xl md:leading-10')}
        {subtitle && <p className="max-w-2xl text-base leading-7 text-ink-600">{subtitle}</p>}
        {button(cn(buttonClasses({ size: 'md' }), 'mt-1'))}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6 overflow-hidden rounded-card bg-linear-to-l from-brand-600 to-brand-800 p-6 shadow-card @3xl:flex-row @3xl:items-center @3xl:p-10">
      <div className="flex min-w-0 flex-1 flex-col gap-2 text-brand-fg">
        {heading('text-2xl leading-10 font-bold md:text-3xl md:leading-[3rem]')}
        {subtitle && <p className="text-base leading-7 md:text-lg md:leading-8">{subtitle}</p>}
        {button(cn(WHITE_BUTTON, 'mt-3 self-start'))}
      </div>
      {image && (
        <div className="relative isolate aspect-[4/3] w-full shrink-0 overflow-hidden rounded-card @3xl:w-72 @4xl:w-80">
          {picture('320px')}
        </div>
      )}
    </div>
  )
}
