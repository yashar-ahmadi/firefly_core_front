import { FileSearch } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Breadcrumbs } from '@/components/layout/breadcrumbs'
import { CONTAINER } from '@/components/layout/container'
import { buttonClasses } from '@/components/ui/button-styles'
import { cn } from '@/components/ui/cn'
import { EmptyState } from '@/components/ui/empty-state'
import { getStoreConfig } from '@/config/store-config'
import { loadBlog } from '@/features/blog/availability'
import { categoryLinks, categoryTree, childCategories } from '@/features/blog/blog-categories'
import { BLOG_PATH, parseBlogQuery, type BlogQuery } from '@/features/blog/blog-routes'
import {
  BLOG_NAME,
  blogHomeJsonLd,
  blogHomeMetadata,
  blogUnavailableMetadata,
} from '@/features/blog/blog-seo'
import { BlogCategoryChips } from '@/features/blog/components/blog-category-chips'
import { BlogHero } from '@/features/blog/components/blog-hero'
import { BlogPager } from '@/features/blog/components/blog-pager'
import { BlogProducts } from '@/features/blog/components/blog-products'
import { BlogSidebar } from '@/features/blog/components/blog-sidebar'
import { PostGrid } from '@/features/blog/components/post-grid'
import { loadBlogHome } from '@/features/blog/page-data'
import { JsonLd } from '@/features/seo/json-ld'
import { notFoundMetadata } from '@/features/seo/not-found-metadata'
import { shopName } from '@/features/seo/shop-name'
import { formatNumber, toPersianDigits } from '@/lib/format'
import { BlogUnavailable } from './unavailable'

type SearchParams = Record<string, string | string[] | undefined>

interface BlogHomeProps {
  searchParams: Promise<SearchParams>
}

const HEADING_ID = 'blog-heading'
const ARCHIVE_ID = 'blog-archive'
const TITLE = 'mb-1 text-xl leading-9 font-bold text-ink-900 md:text-2xl md:leading-10'
const SUBTITLE = 'text-base leading-7 text-ink-600'

export async function generateMetadata({ searchParams }: BlogHomeProps): Promise<Metadata> {
  const sp = await searchParams
  const query = parseBlogQuery(sp)
  const [loaded, shop] = await Promise.all([loadBlog(() => loadBlogHome(query)), shopName()])
  if (loaded.off) return blogUnavailableMetadata(shop)
  if (loaded.data.posts === null) return notFoundMetadata()
  return blogHomeMetadata(sp, query, shop)
}

/** The page's h1: «وبلاگ» (with its page), or the search and how many posts it found. */
function Heading({
  query,
  count,
  totalPages,
}: {
  query: BlogQuery
  count: number
  totalPages: number
}) {
  if (query.search) {
    return (
      <div>
        <h1 id={HEADING_ID} className={cn(TITLE, '[overflow-wrap:anywhere]')}>
          {'نتایج جستجو برای «'}
          <bdi>{query.search}</bdi>
          {'»'}
        </h1>
        <p className={SUBTITLE}>{`${formatNumber(count)} مطلب`}</p>
      </div>
    )
  }
  const page = query.page ?? 1
  return (
    <div>
      <h1 id={HEADING_ID} className={TITLE}>
        {BLOG_NAME}
      </h1>
      <p className={SUBTITLE}>
        {page > 1
          ? `صفحه\u{0654} ${toPersianDigits(page)} از ${toPersianDigits(totalPages)}`
          : 'تازه‌ترین مطالب، راهنماهای خرید، معرفی و بررسی محصولات'}
      </p>
    </div>
  )
}

/** A search without a match: says so, and leads back to the whole blog. */
function NoMatch({ search }: { search: string }) {
  return (
    <EmptyState
      icon={<FileSearch />}
      title={`مطلبی با «${search}» پیدا نشد`}
      description="واژه‌های دیگری را امتحان کنید یا از دسته‌بندی‌ها شروع کنید."
      action={
        <Link href={BLOG_PATH} className={buttonClasses({ variant: 'outline' })}>
          {'همه\u{0654} مطالب وبلاگ'}
        </Link>
      }
      className="rounded-card bg-white shadow-card"
    />
  )
}

/**
 * `/blog/` (blog digest §1.3–1.4, §1.10): the blog home and its archive. On the landing (page 1,
 * no search) the featured posts (1 to 4), the latest posts with the pager, the products and, in
 * the side column, the recent posts; a later page (`?page=`) or a search (`?search=`, the search
 * results' «مشاهدهٔ همه») is the archive alone. A category chip row and the side column (the
 * categories, the `blog-sidebar` menu) are on every page. Indexable (a search is noindex).
 *
 * Status codes (R9): no loading.tsx; everything is awaited before anything renders, so a page
 * past the last answers a real 404. The blog switched off renders «وبلاگ موقتاً در دسترس نیست»
 * (the proxy has made it a 503). Other failures reach the error boundary.
 */
export default async function BlogHomePage({ searchParams }: BlogHomeProps) {
  const query = parseBlogQuery(await searchParams)
  const loaded = await loadBlog(() => loadBlogHome(query))
  if (loaded.off) return <BlogUnavailable reason={loaded.off.reason} />
  const { posts, home, categories, menu } = loaded.data
  if (posts === null) notFound()

  const links = categoryLinks(categories)
  const heading = query.search ? null : query.page ? 'همه\u{0654} مطالب' : 'تازه‌ترین مطالب'
  const featured = home?.featured_posts.length ?? 0

  return (
    <div className={cn(CONTAINER, 'pt-2 pb-10 md:pt-4 md:pb-14')}>
      <JsonLd data={blogHomeJsonLd(getStoreConfig().siteUrl, await shopName())} />
      <Breadcrumbs
        items={
          query.search
            ? [{ name: BLOG_NAME, href: BLOG_PATH }, { name: 'جستجو' }]
            : [{ name: BLOG_NAME }]
        }
        className="mb-2"
      />
      <header className="mb-4 flex flex-col gap-3 md:mb-6 md:gap-4">
        <Heading query={query} count={posts.count} totalPages={posts.total_pages} />
        <BlogCategoryChips
          categories={childCategories(categories, null)}
          label="دسته‌بندی‌های وبلاگ"
        />
      </header>
      {home && <BlogHero posts={home.featured_posts} categoryLinks={links} />}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_18rem] lg:items-start lg:gap-8 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="min-w-0">
          <section aria-labelledby={heading ? ARCHIVE_ID : HEADING_ID}>
            {heading && (
              <h2
                id={ARCHIVE_ID}
                className="mb-3 text-lg leading-8 font-bold text-ink-900 md:mb-4 md:text-xl"
              >
                {heading}
              </h2>
            )}
            <PostGrid
              posts={posts.results}
              categoryLinks={links}
              label={`صفحه\u{0654} ${toPersianDigits(posts.current_page)}`}
              priorityCount={featured > 0 ? 0 : 2}
              emptyState={query.search ? <NoMatch search={query.search} /> : undefined}
            />
            <BlogPager
              basePath={BLOG_PATH}
              query={query}
              page={posts.current_page}
              totalPages={posts.total_pages}
              count={posts.count}
            />
          </section>
          {home && <BlogProducts products={home.recent_products} />}
        </div>
        <BlogSidebar
          categories={categoryTree(categories)}
          recentPosts={home?.recent_posts}
          menu={menu}
        />
      </div>
    </div>
  )
}
