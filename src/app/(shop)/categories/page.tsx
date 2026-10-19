import { LayoutGrid } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { CategoriesBrowser } from '@/components/layout/categories-browser'
import { MenuLink } from '@/components/layout/menu-link'
import { slimCategories } from '@/components/layout/menu-tree'
import { buttonClasses } from '@/components/ui/button-styles'
import { EmptyState } from '@/components/ui/empty-state'
import { seoMetadata } from '@/features/seo/metadata'
import { shopName } from '@/features/seo/shop-name'
import { getCategoryTree, getMenu, getTranslations } from '@/features/settings/api'
import { createTranslator } from '@/lib/i18n/translator'

const PATH = '/categories/'

/** «دسته‌بندی‌ها | shop» (the layout's template), its own canonical and the social cards. */
export async function generateMetadata(): Promise<Metadata> {
  const [translations, shop] = await Promise.all([getTranslations(), shopName()])
  const t = createTranslator(translations)
  return { ...seoMetadata({ path: PATH, siteName: shop }), title: t('categories') }
}

/**
 * `/categories/`: the phone's "categories" tab, a two-pane browser of the category tree. On
 * wider screens it is a centred card. The header's short links are repeated above it on phones,
 * where the header has no row for them.
 */
export default async function CategoriesPage() {
  const [tree, headerMenu, translations] = await Promise.all([
    getCategoryTree(),
    getMenu('header'),
    getTranslations(),
  ])
  const t = createTranslator(translations)
  const categories = slimCategories(tree)

  return (
    <div className="mx-auto w-full max-w-5xl md:px-6 md:py-8">
      <h1 className="sr-only text-2xl leading-10 font-bold text-ink-900 md:not-sr-only md:mb-5">
        {t('categories')}
      </h1>
      {headerMenu.length > 0 && (
        <nav aria-label={t('quick_links')} className="border-b border-ink-200 bg-white md:hidden">
          <ul className="flex [scrollbar-width:none] gap-2 overflow-x-auto px-4 py-2.5">
            {headerMenu.map((item) => (
              <li key={item.id} className="shrink-0">
                <MenuLink
                  node={item}
                  withIcon
                  className="flex min-h-11 items-center gap-2 rounded-pill border border-ink-200 bg-ink-50 px-4 text-sm font-medium text-ink-800"
                />
              </li>
            ))}
          </ul>
        </nav>
      )}
      {categories.length > 0 ? (
        <CategoriesBrowser
          categories={categories}
          className="min-h-[calc(100dvh-11rem)] md:min-h-[32rem] md:overflow-clip md:rounded-card md:border md:border-ink-200 md:shadow-card"
        />
      ) : (
        <EmptyState
          icon={<LayoutGrid />}
          title={t('categories_empty')}
          action={
            <Link href="/" className={buttonClasses()}>
              {t('home')}
            </Link>
          }
        />
      )}
    </div>
  )
}
