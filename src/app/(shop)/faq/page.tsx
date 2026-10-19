import type { Metadata } from 'next'
import { Breadcrumbs } from '@/components/layout/breadcrumbs'
import { CONTAINER } from '@/components/layout/container'
import { cn } from '@/components/ui/cn'
import { getFaqSections } from '@/features/faq/api'
import { FaqPage } from '@/features/faq/faq-page'
import { FAQ_TITLE, faqMetadata, faqPageJsonLd } from '@/features/faq/faq-seo'
import { JsonLd } from '@/features/seo/json-ld'
import { shopName } from '@/features/seo/shop-name'

export async function generateMetadata(): Promise<Metadata> {
  const [sections, shop] = await Promise.all([getFaqSections(), shopName()])
  return faqMetadata(sections, shop)
}

/**
 * `/faq/` (blog-faq digest §2): the help centre in the shop's layout, indexable: its FAQPage
 * JSON-LD (when a question is shown), the trail, then the page (FaqPage). Every category
 * is read once per 600 s for everyone (`getFaqCategories`; shared with `generateMetadata` by
 * React `cache()`). The page is rendered per request (the root layout is dynamic, R5) from that
 * cached read. No loading.tsx (R9): a failed read is the shop's error page.
 */
export default async function FaqRoute() {
  const sections = await getFaqSections()
  const jsonLd = faqPageJsonLd(sections)
  return (
    <div className={cn(CONTAINER, 'pt-2 pb-10 md:pt-4 md:pb-14')}>
      {jsonLd && <JsonLd data={jsonLd} />}
      <Breadcrumbs items={[{ name: FAQ_TITLE }]} className="mx-auto mb-2 max-w-3xl" />
      <FaqPage sections={sections} />
    </div>
  )
}
