import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import { PageBlocks } from '@/features/content/blocks/page-blocks'
import { CategoryBanners } from '@/features/display/category-banners'
import { DISPLAY_STYLES, type DisplayStyle } from '@/features/display/display-style'
import { BannerGroupSection } from '@/features/home/sections/banner-group-section'
import { CategoryGridSection } from '@/features/home/sections/category-grid-section'
import { PostCarouselSection } from '@/features/home/sections/post-carousel-section'
import { ProductCarouselSection } from '@/features/home/sections/product-carousel-section'
import { RichTextSection } from '@/features/home/sections/rich-text-section'
import { SliderSection } from '@/features/home/sections/slider-section'
import type { HomeSection } from '@/lib/api/types/catalog'
import { createTranslator } from '@/lib/i18n/translator'
import { QuickViewHost } from '@/features/quick-view/quick-view-host'
import { assertDevOnly } from '../dev-only'
import { Section } from '../ui/showcase'
import { CONTACT, categoryBanners, homeSections, pageBlocks } from './fixtures'

// Development-only review of the panel's «سبک نمایش»: every home section, page block and
// category banner set in its four styles, with sample content (./fixtures.ts), in this shop's
// colours. It needs no API.

export const metadata: Metadata = {
  title: 'سبک‌های نمایش',
  robots: { index: false, follow: false },
}

const STYLE_NAMES: Record<DisplayStyle, string> = {
  style_1: 'طرح ۱',
  style_2: 'طرح ۲',
  style_3: 'طرح ۳',
  style_4: 'طرح ۴',
}

const SEE_ALL = 'مشاهده\u{0654} همه'

const HOME: { type: HomeSection['type']; id: string; title: string; description: string }[] = [
  {
    type: 'slider',
    id: 'home-slider',
    title: 'اسلایدر',
    description:
      '۱ کلاسیک · ۲ اسلاید وسط با لبهٔ اسلایدهای کناری · ۳ دوتکه با پنل متن · ۴ با تصاویر کوچک',
  },
  {
    type: 'banner_group',
    id: 'home-banners',
    title: 'گروه بنر (و بنرهای صفحه و دسته‌بندی)',
    description: '۱ شبکه بر اساس تعداد · ۲ کاروسل · ۳ کارت با متن زیر تصویر · ۴ موزاییکی',
  },
  {
    type: 'product_carousel',
    id: 'home-products',
    title: 'کاروسل محصولات',
    description: '۱ ریل · ۲ شبکه · ۳ نوار «پیشنهاد شگفت‌انگیز» · ۴ فهرست فشردهٔ شماره‌دار',
  },
  {
    type: 'category_grid',
    id: 'home-categories',
    title: 'شبکهٔ دسته‌بندی',
    description: '۱ تصویر گرد · ۲ کارت · ۳ تراشه · ۴ کاشی تصویری',
  },
  {
    type: 'post_carousel',
    id: 'home-posts',
    title: 'کاروسل مطالب',
    description: '۱ کاروسل · ۲ شبکه · ۳ مطلب ویژه و فهرست · ۴ فهرست فشرده',
  },
  {
    type: 'rich_text',
    id: 'home-text',
    title: 'متن',
    description: '۱ کارت · ۲ بدون کارت · ۳ پنل رنگی · ۴ وسط‌چین',
  },
]

/** One home section in its style, as the homepage draws it. */
function HomePreview({ section }: { section: HomeSection }) {
  switch (section.type) {
    case 'slider':
      return <SliderSection section={section} priority={false} seeAllLabel={SEE_ALL} />
    case 'banner_group':
      return <BannerGroupSection section={section} priority={false} seeAllLabel={SEE_ALL} />
    case 'product_carousel':
      return <ProductCarouselSection section={section} showOutOfStockLabel seeAllLabel={SEE_ALL} />
    case 'category_grid':
      return <CategoryGridSection section={section} seeAllLabel={SEE_ALL} />
    case 'post_carousel':
      return <PostCarouselSection section={section} seeAllLabel={SEE_ALL} />
    case 'rich_text':
      return <RichTextSection section={section} seeAllLabel={SEE_ALL} />
  }
}

/** A style's label over its preview, on the page background (as the shop's pages are). */
function StylePreview({ style, children }: { style: DisplayStyle; children: ReactNode }) {
  return (
    <div className="grid min-w-0 gap-3">
      <h3 className="inline-flex w-fit items-center rounded-pill bg-brand-50 px-3 py-1 text-sm font-bold text-brand-800">
        {STYLE_NAMES[style]}
      </h3>
      <div className="min-w-0 rounded-card bg-ink-50 p-3 ring-1 ring-ink-100 sm:p-4">
        {children}
      </div>
    </div>
  )
}

export default function DisplayStylesPage() {
  assertDevOnly()
  const t = createTranslator({})
  const blockTypes = pageBlocks('style_1').map(({ label, block }) => ({ label, type: block.type }))
  const nav = [
    ...HOME.map(({ id, title }) => ({ id, title })),
    ...blockTypes.map(({ label, type }) => ({ id: `block-${type}`, title: `بلوک ${label}` })),
    { id: 'category-banners', title: 'بنر دسته‌بندی' },
  ]

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:py-10 lg:px-8">
      <header className="mb-6 sm:mb-8">
        <p className="text-sm font-medium text-brand-700">پنل › سبک نمایش</p>
        <h1 className="mt-1 text-2xl font-bold text-ink-900 sm:text-3xl">سبک‌های نمایش</h1>
        <p className="mt-2 max-w-3xl text-base text-ink-600">
          هر بخش صفحهٔ اصلی، هر بلوک صفحه و بنرهای دسته‌بندی در چهار طرحی که اپراتور در پنل انتخاب
          می‌کند، با محتوای نمونه و رنگ‌های همین فروشگاه. طرح ۱ همان طرح پیش‌فرض است. این صفحه فقط
          در محیط توسعه در دسترس است.
        </p>
      </header>

      <nav
        aria-label="بخش‌ها"
        className="sticky top-0 z-10 -mx-4 mb-6 border-b border-ink-200 bg-ink-50/90 px-4 py-3 backdrop-blur lg:-mx-8 lg:px-8"
      >
        <ul className="flex [scrollbar-width:thin] gap-2 overflow-x-auto pb-1 lg:flex-wrap lg:overflow-visible lg:pb-0">
          {nav.map((entry) => (
            <li key={entry.id} className="shrink-0">
              <a
                href={`#${entry.id}`}
                className="inline-flex h-10 items-center rounded-pill border border-ink-200 bg-white px-4 text-sm font-medium text-ink-700 transition-colors hover:border-brand-300 hover:text-brand-800"
              >
                {entry.title}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      <main id="main" tabIndex={-1} className="grid gap-6 outline-none sm:gap-8">
        {HOME.map(({ type, id, title, description }) => (
          <Section key={id} id={id} title={title} description={description}>
            {DISPLAY_STYLES.map((style) => {
              const section = homeSections(style).find((candidate) => candidate.type === type)!
              return (
                <StylePreview key={style} style={style}>
                  <HomePreview section={section} />
                </StylePreview>
              )
            })}
          </Section>
        ))}

        {blockTypes.map(({ label, type }) => (
          <Section key={type} id={`block-${type}`} title={`بلوک صفحه: ${label}`}>
            {DISPLAY_STYLES.map((style) => {
              const { block } = pageBlocks(style).find((entry) => entry.block.type === type)!
              return (
                <StylePreview key={style} style={style}>
                  <PageBlocks blocks={[block]} placement="after_content" contact={CONTACT} t={t} />
                </StylePreview>
              )
            })}
          </Section>
        ))}

        <Section
          id="category-banners"
          title="بنرهای دسته‌بندی"
          description="یک بنر (تکی) و سه بنر (گروه)، در طرح‌های گروه بنر"
        >
          {DISPLAY_STYLES.map((style) => (
            <StylePreview key={style} style={style}>
              <div className="grid gap-6">
                <CategoryBanners banners={categoryBanners(1)} style={style} name="گوشی موبایل" />
                <CategoryBanners banners={categoryBanners(3)} style={style} name="لپ‌تاپ" />
              </div>
            </StylePreview>
          ))}
        </Section>
      </main>
      {/* The product cards' quick view (the shop layout mounts it on shop pages). */}
      <QuickViewHost />
    </div>
  )
}
