import { EyeOff } from 'lucide-react'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { Breadcrumbs } from '@/components/layout/breadcrumbs'
import { CONTAINER } from '@/components/layout/container'
import { isPlaceholderImage } from '@/components/layout/menu-tree'
import { cn } from '@/components/ui/cn'
import { getStoreConfig } from '@/config/store-config'
import { getProductDetail, getProductSettings } from '@/features/catalog/api'
import { AdminFaq } from '@/features/catalog/components/admin-faq'
import { ConsiderBeforeBuying } from '@/features/catalog/components/consider-before-buying'
import { categoryPath, productPath } from '@/features/catalog/listing-routes'
import { toClientProduct } from '@/features/product/client-product'
import { BundleItems } from '@/features/product/components/bundle-items'
import { BuyBox } from '@/features/product/components/buy-box'
import {
  DescriptionSection,
  INTRO_ID,
  INTRO_TITLE,
  introParts,
} from '@/features/product/components/description-section'
import { ProductGallery } from '@/features/product/components/product-gallery'
import { ProductProvider } from '@/features/product/components/product-provider'
import {
  ProductSectionsNav,
  type SectionLink,
} from '@/features/product/components/product-sections'
import { ProductSummary } from '@/features/product/components/product-summary'
import { RecordRecentlyViewed } from '@/features/product/components/record-recently-viewed'
import { RelatedProducts } from '@/features/product/components/related-products'
import {
  QUESTIONS,
  QuestionsSection,
  REVIEWS,
  ReviewsSection,
} from '@/features/product/components/reviews/comments-section'
import { SectionCard } from '@/features/product/components/section-card'
import { SpecificationsTable, specRows } from '@/features/product/components/specifications-table'
import { StickyBuyBar } from '@/features/product/components/sticky-buy-bar'
import { RecentlyViewedStrip } from '@/features/recently-viewed/strip'
import { siteBreadcrumb } from '@/features/seo/breadcrumb-json-ld'
import { JsonLd } from '@/features/seo/json-ld'
import { seoMetadata } from '@/features/seo/metadata'
import { notFoundMetadata } from '@/features/seo/not-found-metadata'
import { siteProductJsonLd } from '@/features/seo/product-json-ld'
import { shopName } from '@/features/seo/shop-name'
import { getSiteSettings } from '@/features/settings/api'

interface ProductPageProps {
  params: Promise<{ slug: string }>
}

/** Below the sticky header, with a little air (grid items only: `self-start` keeps them short). */
const STICKY_TOP = 'top-[calc(var(--header-offset)+1rem)]'
const SPECS = { id: 'specs', title: 'مشخصات' } as const

export async function generateMetadata({ params }: ProductPageProps): Promise<Metadata> {
  const product = await getProductDetail((await params).slug)
  if (product === null) return notFoundMetadata()
  const meta = seoMetadata({
    pageTitle: product.page_title,
    description: product.page_description,
    keywords: product.page_keywords,
    // `?variant=` is the same page: the canonical is always the product.
    canonical: product.canonical_link,
    path: productPath(product.slug),
    image: isPlaceholderImage(product.image) ? null : product.image,
    siteName: await shopName(),
  })
  // A draft in a staff preview (product digest §5.1).
  return product.is_unpublished ? { ...meta, robots: { index: false, follow: false } } : meta
}

function UnpublishedBanner() {
  return (
    <p
      role="status"
      className="mb-3 flex items-center gap-2 rounded-control bg-warning/10 px-4 py-3 text-base font-medium text-warning"
    >
      <EyeOff aria-hidden className="size-5 shrink-0" />
      این صفحه هنوز منتشر نشده است
    </p>
  )
}

/**
 * `/product/<slug>/` (product digest §5): the gallery, the summary with the variant picker, and
 * the buy box; on phones a buy bar replaces the bottom navigation.
 *
 * Below them, under a sticky section bar: the introduction, the specifications, the reviews and
 * the questions; then the shop's notes (consider-before-buying, FAQ), a bundle's contents,
 * related products and the visitor's recently viewed products (this one left out).
 *
 * Status codes (R9, ruling P2-R1): no loading.tsx for this segment. The product (anonymous, 60 s
 * Data Cache, no token) is awaited and `notFound()` called before anything streams, so an
 * unknown product answers a real 404 and any other failure reaches the error boundary. Nothing
 * streams: the related products come with the product, and the reviews and questions load in
 * the browser when their section comes near (CommentList).
 *
 * `?variant=<id>` (a shared link) is read by ProductProvider from the URL: the server renders
 * that variant, the browser hydrates the same, and Back/Forward restores match their URL.
 */
export default async function ProductPage({ params }: ProductPageProps) {
  const product = await getProductDetail((await params).slug)
  if (product === null) notFound()
  const [settings, productSettings] = await Promise.all([getSiteSettings(), getProductSettings()])
  const config = getStoreConfig()
  const intro = introParts(product.description, product.content)
  const hasSpecs = specRows(product.specifications).length > 0
  const sections: SectionLink[] = [
    ...(intro ? [{ id: INTRO_ID, label: INTRO_TITLE }] : []),
    ...(hasSpecs ? [{ id: SPECS.id, label: SPECS.title }] : []),
    { id: REVIEWS.id, label: REVIEWS.title, count: product.comment_count },
    { id: QUESTIONS.id, label: QUESTIONS.title, count: product.question_count },
  ]
  const trail = [
    ...product.breadcrumb.map((node) => ({ name: node.name, href: categoryPath(node.path) })),
    { name: product.name },
  ]

  return (
    <ProductProvider key={product.id} product={toClientProduct(product)}>
      <JsonLd
        data={[
          ...product.structured_data.map((data) => siteProductJsonLd(data, config.siteUrl)),
          siteBreadcrumb(product.breadcrumb_structured_data, config.siteUrl),
        ]}
      />
      <div className={cn(CONTAINER, 'pt-2 pb-6 md:pt-4 md:pb-8')}>
        {product.is_unpublished && <UnpublishedBanner />}
        <Breadcrumbs items={trail} className="mb-2" />
        {/* Gallery at the start (from xl at its natural 500px); from lg the summary and the
            sticky buy box sit side by side after it. */}
        <div className="grid gap-6 md:grid-cols-2 md:gap-8 lg:grid-cols-[22rem_minmax(0,1fr)] xl:grid-cols-[31.25rem_minmax(0,1fr)]">
          <div className={cn('min-w-0 md:sticky md:self-start', STICKY_TOP)}>
            <ProductGallery />
          </div>
          <div className="flex min-w-0 flex-col gap-6 lg:grid lg:grid-cols-[minmax(0,1fr)_17.5rem] lg:items-start xl:grid-cols-[minmax(0,1fr)_20rem]">
            <ProductSummary product={product} />
            <BuyBox
              contactPhone={settings?.phone ?? null}
              className={cn('lg:sticky', STICKY_TOP)}
            />
          </div>
        </div>
      </div>
      <div className={cn(CONTAINER, 'flex flex-col gap-6 pb-10 md:gap-8 md:pb-14')}>
        {/* The bar stays stuck while these four sections pass, then leaves with them. */}
        <div className="flex flex-col gap-4 md:gap-6">
          <ProductSectionsNav items={sections} />
          {intro && (
            <DescriptionSection description={product.description} content={product.content} />
          )}
          {hasSpecs && (
            <SectionCard id={SPECS.id} title={SPECS.title}>
              <div className="max-w-4xl">
                <SpecificationsTable specifications={product.specifications} />
              </div>
            </SectionCard>
          )}
          <ReviewsSection product={product} />
          <QuestionsSection product={product} />
        </div>
        {product.consider_before_buying && (
          <ConsiderBeforeBuying data={product.consider_before_buying} />
        )}
        <AdminFaq items={product.question_answers} />
        {product.is_collection && <BundleItems items={product.bundle_items} />}
        <RelatedProducts products={product.related_products} settings={productSettings} />
        {config.features.recentlyViewed && (
          <RecentlyViewedStrip
            showOutOfStockLabel={productSettings.show_out_of_stock_label}
            excludeSlug={product.slug}
          />
        )}
      </div>
      <StickyBuyBar />
      <RecordRecentlyViewed />
    </ProductProvider>
  )
}
