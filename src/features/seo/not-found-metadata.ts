import type { Metadata } from 'next'
import { shopName } from '@/features/seo/shop-name'
import { getTranslations } from '@/features/settings/api'
import { createTranslator } from '@/lib/i18n/translator'

/**
 * The 404 page's head: «صفحه پیدا نشد | <shop>», absolute (the layout's template does not reach
 * the root segment). Used by both not-found files and by the `generateMetadata` of pages that
 * call `notFound()`. When a page throws `notFound()`, Next drops that page's own metadata and
 * takes the nearest not-found file's instead, so that file must export it too. Next adds
 * `noindex` to the 404 itself.
 */
export async function notFoundMetadata(): Promise<Metadata> {
  const [name, translations] = await Promise.all([shopName(), getTranslations()])
  const t = createTranslator(translations)
  return { title: { absolute: `${t('not_found_meta_title')} | ${name}` } }
}
