import type { Metadata } from 'next'
import { buttonClasses } from '@/components/ui/button-styles'
import { cn } from '@/components/ui/cn'
import { CONTACT_US_PATH } from '@/features/content/pages/page-routes'
import { notFoundMetadata } from '@/features/seo/not-found-metadata'
import { shopName } from '@/features/seo/shop-name'
import { getTranslations } from '@/features/settings/api'
import { createTranslator } from '@/lib/i18n/translator'

export function generateMetadata(): Promise<Metadata> {
  return notFoundMetadata()
}

const TITLE_ID = 'not-found-title'

/**
 * The root 404: `notFound()` outside the shop layout (a malformed thanks code, a linker never
 * saved, the dev pages in production). Next shows it inside the nearest layout of the page that
 * threw (the checkout's frame, the linker's), so it is a labelled region, never a second
 * `<main>`: those frames hold the skip link's `<main id="main">`. Unknown URLs get the shop's full
 * 404 instead, through the catch-all `(shop)/[...missing]` (ruling P5-R2).
 *
 * Light on purpose: Next 16.4.1 builds the root not-found's element on every request and puts it
 * in every page's payload, shown or not (`create-component-tree.js`, the `notFound` of the root
 * LayoutRouter), and the browser loads the code of every client component in that payload. With
 * the shop shell here, every page outside the shop layout (checkout, payment, auth, linker)
 * downloaded the shop's header, search and menus: about 27 KB gzip. So this is server HTML only
 * (tests/unit/layout/root-not-found.test.tsx walks its imports: no client module): the store's
 * name, «صفحه پیدا نشد», a sentence and three ways on, plain links (a full page load). The
 * response is a real 404; Next adds noindex.
 */
export default async function NotFound() {
  const [name, translations] = await Promise.all([shopName(), getTranslations()])
  const t = createTranslator(translations)
  const ways = [
    { href: '/', label: t('home_page'), variant: 'primary' as const },
    { href: '/search/', label: 'جستجو در فروشگاه', variant: 'outline' as const },
    { href: CONTACT_US_PATH, label: 'تماس با پشتیبانی', variant: 'outline' as const },
  ]
  return (
    <section
      aria-labelledby={TITLE_ID}
      className="flex flex-col items-center px-4 py-10 text-center md:py-16"
    >
      {/* Plain links: next/link is a client component, and this element is in every payload. */}
      {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
      <a
        href="/"
        dir="auto"
        className="inline-flex min-h-11 items-center rounded-control px-3 text-xl font-bold text-ink-900 hover:text-brand-800"
      >
        {name}
      </a>
      <div className="mt-8 flex w-full max-w-xl flex-col items-center md:mt-12">
        <p className="rounded-pill bg-brand-50 px-3 py-1 text-sm font-medium text-brand-800">
          {t('not_found_code')}
        </p>
        <h1
          id={TITLE_ID}
          className="mt-3 text-2xl leading-10 font-bold text-ink-900 md:text-3xl md:leading-12"
        >
          {t('not_found_meta_title')}
        </h1>
        <p className="mt-3 text-base leading-8 text-ink-600">
          {
            'نشانی این صفحه درست نیست یا صفحه دیگر وجود ندارد. از یکی از راه\u{200C}های زیر ادامه دهید.'
          }
        </p>
        <nav aria-label={'راه\u{200C}های ادامه'} className="mt-8 w-full">
          <ul className="mx-auto flex max-w-xs flex-col gap-3 sm:max-w-none sm:flex-row sm:flex-wrap sm:justify-center">
            {ways.map((way) => (
              <li key={way.href}>
                <a
                  href={way.href}
                  className={cn(
                    buttonClasses({ variant: way.variant, fullWidth: true }),
                    'sm:w-auto',
                  )}
                >
                  {way.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </section>
  )
}
