import { BookX, House, LayoutGrid } from 'lucide-react'
import Link from 'next/link'
import { Breadcrumbs } from '@/components/layout/breadcrumbs'
import { CONTAINER } from '@/components/layout/container'
import { buttonClasses } from '@/components/ui/button-styles'
import { cn } from '@/components/ui/cn'
import { BLOG_NAME, BLOG_UNAVAILABLE_TITLE } from '@/features/blog/blog-seo'
import { LISTING_PATH } from '@/features/catalog/listing-routes'

/** Said when the operator gave no reason for switching the blog off. */
const NO_REASON = 'به‌زودی برمی‌گردیم. لطفاً کمی بعد دوباره سر بزنید.'

/**
 * Every blog page while the blog is switched off (Review Focus #1): «وبلاگ موقتاً در دسترس نیست»
 * with the operator's reason (else a calm sentence), and ways on to the home page and the
 * products, inside the shop's layout. The response is a 503 with `Retry-After` (set by the
 * proxy: src/lib/edge/page-render.ts) and the head says noindex (`blogUnavailableMetadata`).
 * Not a route of its own: the blog's pages render it.
 */
export async function BlogUnavailable({ reason }: { reason: string | null }) {
  return (
    <div className={cn(CONTAINER, 'pt-2 pb-10 md:pt-4 md:pb-16')}>
      <Breadcrumbs items={[{ name: BLOG_NAME }]} className="mb-2" />
      <div className="mx-auto flex max-w-xl flex-col items-center rounded-card bg-white px-4 py-10 text-center shadow-card md:px-8 md:py-14">
        <span
          aria-hidden
          className="mb-5 grid size-20 place-items-center rounded-full bg-brand-50 text-brand-600 ring-8 ring-brand-50/60 [&_svg]:size-9 [&_svg]:stroke-[1.5]"
        >
          <BookX />
        </span>
        <h1 className="text-xl leading-9 font-bold text-ink-900 md:text-2xl md:leading-10">
          {BLOG_UNAVAILABLE_TITLE}
        </h1>
        <p className="mt-2 max-w-md text-base leading-7 text-ink-600">{reason ?? NO_REASON}</p>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          <Link href="/" className={buttonClasses({ variant: 'primary' })}>
            <House aria-hidden />
            {'بازگشت به صفحه\u{0654} اصلی'}
          </Link>
          <Link href={LISTING_PATH} className={buttonClasses({ variant: 'outline' })}>
            <LayoutGrid aria-hidden />
            {'مشاهده\u{0654} محصولات'}
          </Link>
        </div>
      </div>
    </div>
  )
}
