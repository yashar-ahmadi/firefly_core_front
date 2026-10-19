import { Tags } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { Breadcrumbs } from '@/components/layout/breadcrumbs'
import { CategoryThumb } from '@/components/layout/category-thumb'
import { CONTAINER } from '@/components/layout/container'
import { buttonClasses } from '@/components/ui/button-styles'
import { cn } from '@/components/ui/cn'
import { EmptyState } from '@/components/ui/empty-state'
import { getBrands } from '@/features/catalog/api'
import { getStoreConfig } from '@/config/store-config'
import { BRANDS_PATH, brandPath } from '@/features/catalog/listing-routes'
import { trailBreadcrumb } from '@/features/seo/breadcrumb-json-ld'
import { JsonLd } from '@/features/seo/json-ld'
import { seoMetadata } from '@/features/seo/metadata'
import { shopName } from '@/features/seo/shop-name'
import { getTranslations } from '@/features/settings/api'
import { formatNumber } from '@/lib/format'
import { createTranslator } from '@/lib/i18n/translator'

const TITLE = 'برندها'
const HEADING_ID = 'brands-heading'

export async function generateMetadata(): Promise<Metadata> {
  return { ...seoMetadata({ path: BRANDS_PATH, siteName: await shopName() }), title: TITLE }
}

/** The API orders brands by code point (پ چ ژ گ last): this is Persian alphabetical order. */
const byName = new Intl.Collator('fa').compare

/**
 * `/brand/`: every published brand, A to Z, as a grid of logo cards (the logo fits its square,
 * never cut) linking to the brand's page. Indexable; its visible trail (home › «برندها») is its
 * BreadcrumbList JSON-LD. An API failure reaches the error boundary.
 */
export default async function BrandsPage() {
  const [all, translations] = await Promise.all([getBrands(), getTranslations()])
  const brands = [...all].sort((a, b) => byName(a.name, b.name))
  const home = createTranslator(translations)('home')
  return (
    <div className={cn(CONTAINER, 'pt-2 pb-10 md:pt-4 md:pb-14')}>
      <JsonLd
        data={trailBreadcrumb([{ name: TITLE, path: BRANDS_PATH }], getStoreConfig().siteUrl, home)}
      />
      <Breadcrumbs items={[{ name: TITLE }]} className="mb-2" />
      <h1
        id={HEADING_ID}
        className="mb-4 text-xl leading-9 font-bold text-ink-900 md:mb-6 md:text-2xl md:leading-10"
      >
        {TITLE}
      </h1>
      {brands.length > 0 ? (
        <ul
          aria-labelledby={HEADING_ID}
          className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 md:gap-4 lg:grid-cols-5 xl:grid-cols-6"
        >
          {brands.map((brand) => (
            <li key={brand.id}>
              <Link
                href={brandPath(brand.slug)}
                className="flex h-full flex-col items-center gap-3 rounded-card bg-white px-3 py-5 text-center shadow-card transition-shadow duration-150 hover:shadow-raised"
              >
                <CategoryThumb
                  category={{ name: brand.name, image: brand.image }}
                  fit="contain"
                  sizes="70px"
                  className="size-[70px] rounded-control bg-white text-2xl"
                />
                <span className="text-base leading-7 font-medium text-ink-900">{brand.name}</span>
                <span className="text-sm text-ink-600">{`${formatNumber(brand.product_count)} کالا`}</span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState
          icon={<Tags />}
          title="هنوز برندی ثبت نشده است"
          action={
            <Link href="/" className={buttonClasses()}>
              صفحهٔ اصلی
            </Link>
          }
        />
      )}
    </div>
  )
}
