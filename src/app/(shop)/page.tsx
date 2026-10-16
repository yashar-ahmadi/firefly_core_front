import type { Metadata } from 'next'
import { storeName, storeSlogan } from '@/app/_shell/metadata'
import { CONTAINER } from '@/components/layout/container'
import { cn } from '@/components/ui/cn'
import { getStoreConfig } from '@/config/store-config'
import { getHomePage, getProductSettings } from '@/features/catalog/api'
import { buildHomeMetadata } from '@/features/home/home-metadata'
import { SectionRenderer } from '@/features/home/sections/section-renderer'
import { RecentlyViewedStrip } from '@/features/recently-viewed/strip'
import { propertyMetaTags } from '@/features/seo/page-metadata'
import { getSiteSettings } from '@/features/settings/api'

/** The homepage SEO fields over the shop's name and slogan (content.md §6.9). */
export async function generateMetadata(): Promise<Metadata> {
  const [home, settings] = await Promise.all([getHomePage(), getSiteSettings()])
  return buildHomeMetadata(home, {
    name: storeName(getStoreConfig(), settings),
    slogan: storeSlogan(settings),
  })
}

/**
 * `/`: the sections of the backend's homepage builder, in the operator's order, then the
 * visitor's recently viewed products. No loading.tsx and no Suspense before the homepage: when
 * it cannot be loaded `getHomePage()` throws before anything streams, so the error page answers
 * with a real error status. The recently viewed strip is read on the device after hydration.
 */
export default async function ShopHomePage() {
  const config = getStoreConfig()
  const [home, settings, productSettings] = await Promise.all([
    getHomePage(),
    getSiteSettings(),
    getProductSettings(),
  ])
  return (
    <>
      {/* Open Graph rows need property=, which Next's metadata cannot write; React hoists these. */}
      {propertyMetaTags(home.meta_tags).map((tag, index) => (
        <meta key={`${tag.field}-${index}`} property={tag.field.trim()} content={tag.value} />
      ))}
      <h1 className="sr-only">{storeName(config, settings)}</h1>
      <div className={cn(CONTAINER, 'flex flex-col gap-8 pt-4 pb-10 md:gap-12 md:pt-6 md:pb-14')}>
        <SectionRenderer sections={home.sections} />
        {config.features.recentlyViewed && (
          <RecentlyViewedStrip showOutOfStockLabel={productSettings.show_out_of_stock_label} />
        )}
      </div>
    </>
  )
}
