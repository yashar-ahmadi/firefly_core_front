import type { Metadata } from 'next'
import { shopName } from '@/features/seo/shop-name'
import { getTranslations } from '@/features/settings/api'
import { createTranslator } from '@/lib/i18n/translator'

/**
 * A 404's robots: none of its own, and none of its layouts'. Next writes
 * `<meta name="robots" content="noindex">` on every 404 itself (it cannot be turned off), so a
 * layout's own robots (the checkout's, the sign-in pages', the account's) would be a second tag.
 * A `null` key is "none" in Next's metadata merge, over whatever the layouts set.
 */
export const NOT_FOUND_ROBOTS = { robots: null } satisfies Metadata

/**
 * The 404 page's head: «صفحه پیدا نشد | <shop>», absolute (the layout's template does not reach
 * the root segment), and Next's own noindex as its only robots tag (`NOT_FOUND_ROBOTS`). Used
 * by both not-found files and by the `generateMetadata` of pages that call `notFound()`. When a
 * page throws `notFound()`, Next drops that page's own metadata and takes the nearest not-found
 * file's instead, so that file must export it too.
 */
export async function notFoundMetadata(): Promise<Metadata> {
  const [name, translations] = await Promise.all([shopName(), getTranslations()])
  const t = createTranslator(translations)
  return { title: { absolute: `${t('not_found_meta_title')} | ${name}` }, ...NOT_FOUND_ROBOTS }
}
