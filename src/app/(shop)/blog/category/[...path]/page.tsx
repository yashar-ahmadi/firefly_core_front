import type { Metadata } from 'next'
import { notFound, permanentRedirect } from 'next/navigation'
import { Breadcrumbs } from '@/components/layout/breadcrumbs'
import { CONTAINER } from '@/components/layout/container'
import { cn } from '@/components/ui/cn'
import { getStoreConfig } from '@/config/store-config'
import { loadBlog } from '@/features/blog/availability'
import { categoryLinks, categoryTree, childCategories } from '@/features/blog/blog-categories'
import { BLOG_PATH, blogCategoryPath, parseBlogQuery } from '@/features/blog/blog-routes'
import {
  BLOG_NAME,
  blogCategoryJsonLd,
  blogCategoryMetadata,
  blogUnavailableMetadata,
} from '@/features/blog/blog-seo'
import { BlogCategoryChips } from '@/features/blog/components/blog-category-chips'
import { BlogPager } from '@/features/blog/components/blog-pager'
import { BlogSidebar } from '@/features/blog/components/blog-sidebar'
import { NoPosts } from '@/features/blog/components/no-posts'
import { PostGrid } from '@/features/blog/components/post-grid'
import { loadBlogCategory, loadBlogCategoryPosts } from '@/features/blog/page-data'
import { ListingHero } from '@/features/catalog/components/listing-hero'
import { CategoryBanners } from '@/features/display/category-banners'
import { queryString } from '@/features/catalog/listing-routes'
import { richContentHtml } from '@/features/content/rich-content'
import { RichContentBody } from '@/features/content/rich-content-body'
import { JsonLd } from '@/features/seo/json-ld'
import { notFoundMetadata } from '@/features/seo/not-found-metadata'
import { shopName } from '@/features/seo/shop-name'
import type { BlogCategoryDetail } from '@/lib/api/types/blog'
import { formatNumber, toPersianDigits } from '@/lib/format'
import { BlogUnavailable } from '../../unavailable'

type SearchParams = Record<string, string | string[] | undefined>

interface BlogCategoryPageProps {
  params: Promise<{ path: string[] }>
  searchParams: Promise<SearchParams>
}

const POSTS_ID = 'blog-category-posts'

export async function generateMetadata({
  params,
  searchParams,
}: BlogCategoryPageProps): Promise<Metadata> {
  const segments = (await params).path
  const sp = await searchParams
  const { page } = parseBlogQuery(sp)
  const [loaded, shop] = await Promise.all([
    loadBlog(async () => {
      const found = await loadBlogCategory(segments)
      return found && { ...found, ...(await loadBlogCategoryPosts(found.category, page)) }
    }),
    shopName(),
  ])
  if (loaded.off) return blogUnavailableMetadata(shop)
  if (loaded.data === null || loaded.data.posts === null) return notFoundMetadata()
  return blogCategoryMetadata(loaded.data.category, sp, shop, getStoreConfig().siteUrl)
}

/** The visible trail: «وبلاگ», then each category of the chain at its path (slugs joined). */
function trail(category: BlogCategoryDetail) {
  const chain = category.breadcrumb.map((node, index) => ({
    name: node.name,
    href: blogCategoryPath(
      category.breadcrumb
        .slice(0, index + 1)
        .map((step) => step.slug)
        .join('/'),
    ),
  }))
  return [{ name: BLOG_NAME, href: BLOG_PATH }, ...chain]
}

/**
 * `/blog/category/<path>/` (blog digest §1.6, §1.10). The category is looked up by its own (last)
 * slug before anything else, because the post list ignores an unknown slug and lists every post:
 * a missing or draft one is a real 404. A path that is not its `path` (moved, or shortened)
 * answers 308 to the canonical one with the query kept, as product categories do; segments are
 * compared decoded. Then its head (picture, name, short description, how many posts, its
 * subcategories), its banners in its `banner_style` (CategoryBanners), its posts (descendants' included) with the pager, its content, and the side
 * column. Indexable; BreadcrumbList and CollectionPage JSON-LD on the shop's origin.
 *
 * Status codes (R9): no loading.tsx; the category is awaited and `notFound()` or the redirect
 * happen before anything renders; a page past the last is a 404 too. The blog switched off
 * renders «وبلاگ موقتاً در دسترس نیست» (a 503 from the proxy).
 */
export default async function BlogCategoryPage({ params, searchParams }: BlogCategoryPageProps) {
  const segments = (await params).path
  const sp = await searchParams
  const { page } = parseBlogQuery(sp)

  const found = await loadBlog(() => loadBlogCategory(segments))
  if (found.off) return <BlogUnavailable reason={found.off.reason} />
  if (found.data === null) notFound()
  const { category, requested } = found.data
  const path = blogCategoryPath(category.path)
  if (requested !== category.path) permanentRedirect(`${path}${queryString(sp)}`)

  const loaded = await loadBlog(() => loadBlogCategoryPosts(category, page))
  if (loaded.off) return <BlogUnavailable reason={loaded.off.reason} />
  const { posts, categories, menu } = loaded.data
  if (posts === null) notFound()
  const content = category.content ? richContentHtml(category.content) : null

  return (
    <div className={cn(CONTAINER, 'pt-2 pb-10 md:pt-4 md:pb-14')}>
      <JsonLd data={blogCategoryJsonLd(category, getStoreConfig().siteUrl)} />
      <Breadcrumbs items={trail(category)} className="mb-2" />
      <div className="mb-4 md:mb-6">
        <ListingHero
          title={category.name}
          description={category.short_description}
          image={{ src: category.image, kind: 'category' }}
        >
          <BlogCategoryChips
            categories={childCategories(categories, category.id)}
            label="زیردسته‌ها"
            className="mt-4 border-t border-ink-100 pt-3 md:pt-4"
          />
        </ListingHero>
      </div>
      <CategoryBanners
        banners={category.banners}
        style={category.banner_style}
        name={category.name}
        className="mb-4 md:mb-6"
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_18rem] lg:items-start lg:gap-8 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="min-w-0">
          <section aria-labelledby={POSTS_ID}>
            <div className="mb-3 flex min-h-8 items-baseline justify-between gap-3 md:mb-4">
              <h2 id={POSTS_ID} className="text-lg leading-8 font-bold text-ink-900 md:text-xl">
                مطالب این دسته
              </h2>
              <p className="shrink-0 text-sm text-ink-600">
                {posts.count > 0 ? `${formatNumber(posts.count)} مطلب` : 'هنوز مطلبی ندارد'}
              </p>
            </div>
            <PostGrid
              posts={posts.results}
              categoryLinks={categoryLinks(categories)}
              label={`صفحه\u{0654} ${toPersianDigits(posts.current_page)}`}
              emptyState={<NoPosts />}
            />
            <BlogPager
              basePath={path}
              query={page === undefined ? {} : { page }}
              page={posts.current_page}
              totalPages={posts.total_pages}
              count={posts.count}
            />
          </section>
          {content && (
            <div className="mt-8 rounded-card bg-white p-4 shadow-card md:mt-10 md:p-6">
              <RichContentBody html={content} className="rich-content max-w-4xl" />
            </div>
          )}
        </div>
        <BlogSidebar
          categories={categoryTree(categories)}
          currentCategoryId={category.id}
          menu={menu}
        />
      </div>
    </div>
  )
}
