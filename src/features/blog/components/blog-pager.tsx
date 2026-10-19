import { Pagination } from '@/components/ui/pagination'
import { blogListingHref, type BlogQuery } from '@/features/blog/blog-routes'
import { formatNumber, toPersianDigits } from '@/lib/format'
import { PageAnnouncement } from './page-announcement'

/** «صفحهٔ ۲ از ۲، ۱۹ مطلب»: what a move to another page of the listing reads out. */
export function pageSummary(page: number, totalPages: number, count: number): string {
  const posts = count > 0 ? `${formatNumber(count)} مطلب` : 'مطلبی پیدا نشد'
  if (totalPages <= 1) return posts
  return `صفحه\u{0654} ${toPersianDigits(page)} از ${toPersianDigits(totalPages)}، ${posts}`
}

/**
 * A blog listing's pager: real links (crawlable, and the way without JavaScript), the search
 * kept on every page, and the new page announced after a move (PageAnnouncement).
 */
export function BlogPager({
  basePath,
  query,
  page,
  totalPages,
  count,
}: {
  basePath: string
  query: BlogQuery
  page: number
  totalPages: number
  count: number
}) {
  return (
    <>
      <PageAnnouncement
        text={pageSummary(page, totalPages, count)}
        trigger={`${query.search ?? ''}|${page}`}
      />
      <Pagination
        page={page}
        totalPages={totalPages}
        hrefFor={(target) => blogListingHref(basePath, { ...query, page: target })}
        className="mt-6 md:mt-8"
      />
    </>
  )
}
