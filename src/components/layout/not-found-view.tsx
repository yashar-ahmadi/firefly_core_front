import { House, LayoutGrid } from 'lucide-react'
import Link from 'next/link'
import type { CSSProperties } from 'react'
import { buttonClasses } from '@/components/ui/button-styles'
import { cn } from '@/components/ui/cn'
import { getCategoryTree, getTranslations } from '@/features/settings/api'
import { createTranslator } from '@/lib/i18n/translator'
import { CONTAINER } from './container'
import { HeaderSearchForm } from './header-search-form'
import { categoryHref } from './menu-tree'

/** How many top-level categories are offered as a way on. */
const CATEGORY_LIMIT = 8

/**
 * public/images/not-found.svg is one colour at several opacities; as a mask over a brand-coloured
 * box it is painted in the shop's own colour (an <img> could not read the theme).
 */
const ILLUSTRATION: CSSProperties = {
  maskImage: 'url(/images/not-found.svg)',
  maskSize: 'contain',
  maskRepeat: 'no-repeat',
  maskPosition: 'center',
  WebkitMaskImage: 'url(/images/not-found.svg)',
  WebkitMaskSize: 'contain',
  WebkitMaskRepeat: 'no-repeat',
  WebkitMaskPosition: 'center',
}

/**
 * The body of the 404 page: an illustration, «صفحه‌ای که دنبالش بودید پیدا نشد», a short hint,
 * the search box, buttons to the home page and the categories, and the top-level categories as
 * chips. The page around it (header and footer) comes from the shop shell.
 */
export async function NotFoundView() {
  const [translations, tree] = await Promise.all([getTranslations(), getCategoryTree()])
  const t = createTranslator(translations)
  const categories = tree.slice(0, CATEGORY_LIMIT)

  return (
    <div className={cn(CONTAINER, 'flex flex-col items-center py-10 text-center md:py-16')}>
      <span
        aria-hidden
        data-illustration="not-found"
        style={ILLUSTRATION}
        className="block aspect-4/3 w-60 bg-brand-600 md:w-80"
      />
      <p className="mt-4 rounded-pill bg-brand-50 px-3 py-1 text-sm font-medium text-brand-800">
        {t('not_found_code')}
      </p>
      <h1 className="mt-3 max-w-2xl text-2xl leading-10 font-bold text-ink-900 md:text-3xl md:leading-12">
        {t('not_found_title')}
      </h1>
      <p className="mt-3 max-w-xl text-base leading-8 text-ink-600">{t('not_found_text')}</p>

      <HeaderSearchForm className="mt-8 w-full max-w-lg" />

      <div className="mt-6 flex flex-wrap justify-center gap-3">
        <Link href="/" className={buttonClasses()}>
          <House aria-hidden />
          {t('home_page')}
        </Link>
        <Link href="/categories/" className={buttonClasses({ variant: 'outline' })}>
          <LayoutGrid aria-hidden />
          {t('categories')}
        </Link>
      </div>

      {categories.length > 0 && (
        <section className="mt-12 w-full max-w-3xl border-t border-ink-200 pt-8">
          <h2 id="not-found-categories" className="text-base font-bold text-ink-800">
            {t('not_found_main_categories')}
          </h2>
          <ul
            aria-labelledby="not-found-categories"
            className="mt-4 flex flex-wrap justify-center gap-2"
          >
            {categories.map((category) => (
              <li key={category.id}>
                <Link
                  href={categoryHref(category.path)}
                  prefetch={false}
                  className="inline-flex min-h-11 items-center rounded-pill border border-ink-200 bg-white px-4 text-sm font-medium text-ink-800 transition-colors hover:border-brand-300 hover:text-brand-800"
                >
                  {category.name}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
