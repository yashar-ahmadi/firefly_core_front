import { EyeOff } from 'lucide-react'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { Suspense } from 'react'
import { Breadcrumbs } from '@/components/layout/breadcrumbs'
import { CONTAINER } from '@/components/layout/container'
import { cn } from '@/components/ui/cn'
import { getStoreConfig } from '@/config/store-config'
import { loadBlog } from '@/features/blog/availability'
import { categoryLinks, chainTrail } from '@/features/blog/blog-categories'
import { BLOG_PATH } from '@/features/blog/blog-routes'
import { BLOG_NAME, blogUnavailableMetadata } from '@/features/blog/blog-seo'
import { BlogProducts } from '@/features/blog/components/blog-products'
import { PostArticle } from '@/features/blog/components/post-article'
import { PostCommentPlaceholders } from '@/features/blog/components/post-comment-list'
import { PostComments } from '@/features/blog/components/post-comments'
import { ReadingProgress } from '@/features/blog/components/reading-progress'
import { RelatedPosts } from '@/features/blog/components/related-posts'
import { SeededPostComments } from '@/features/blog/components/seeded-post-comments'
import { getFirstPostComments } from '@/features/blog/post-api'
import { loadPost, postContentHtml } from '@/features/blog/post-data'
import { postJsonLd, postMetadata } from '@/features/blog/post-seo'
import { JsonLd } from '@/features/seo/json-ld'
import { notFoundMetadata } from '@/features/seo/not-found-metadata'
import { shopName } from '@/features/seo/shop-name'
import { POST_ARTICLE_ID, POST_PRODUCTS_ID } from '@/lib/html/reserved-ids'
import { BlogUnavailable } from '../unavailable'

interface BlogPostPageProps {
  params: Promise<{ slug: string }>
}

export async function generateMetadata({ params }: BlogPostPageProps): Promise<Metadata> {
  const { slug } = await params
  const [loaded, shop] = await Promise.all([loadBlog(() => loadPost(slug)), shopName()])
  if (loaded.off) return blogUnavailableMetadata(shop)
  if (loaded.data === null) return notFoundMetadata()
  return postMetadata(loaded.data.post, shop, getStoreConfig().siteUrl)
}

/** A staff preview of a draft or a scheduled post (blog digest §1.5). */
function PreviewBar() {
  return (
    <p
      role="status"
      className="mx-auto mb-3 flex max-w-6xl items-center gap-2 rounded-control bg-warning/10 px-4 py-3 text-base font-medium text-warning"
    >
      <EyeOff aria-hidden className="size-5 shrink-0" />
      {'پیش\u{200C}نمایش — این پست هنوز منتشر نشده است'}
    </p>
  )
}

/**
 * `/blog/<slug>/` (blog digest §1.5, §1.7, §1.9): the post (its head, banner, content and table
 * of contents, under a reading progress bar), its related posts and products, then its comments
 * and questions. Indexable (a staff preview is not); BlogPosting and BreadcrumbList JSON-LD on
 * the shop's origin.
 *
 * **One read of the post per page view** (Review Focus #2): `GET blog/post/<slug>/` counts a view
 * on every call, so `generateMetadata` and the page share one React-cached `getPost`, read per
 * request as the visitor and never cached (docs/ARCHITECTURE.md, «Blog post views»); every link
 * to a post is `prefetch={false}` (P5-R1), and nothing at or above this segment is a loading
 * boundary, so no prefetch ever renders it.
 *
 * Status codes (R9): no loading.tsx; the post is awaited and `notFound()` called (missing, a
 * draft, not yet due) before anything streams. Only the comments' first page streams, in its own
 * in-page `<Suspense>`. The blog switched off renders «وبلاگ موقتاً در دسترس نیست» (the proxy
 * made it a 503); other failures reach the error boundary.
 */
export default async function BlogPostPage({ params }: BlogPostPageProps) {
  const { slug } = await params
  const loaded = await loadBlog(() => loadPost(slug))
  if (loaded.off) return <BlogUnavailable reason={loaded.off.reason} />
  if (loaded.data === null) notFound()
  const { post, categories } = loaded.data
  // Comment lists of an unpublished post answer 404, even for staff.
  const comments = !post.is_unpublished
  // Start page 1 of the comments now (React cache() shares it with SeededPostComments).
  if (comments && post.comment_count > 0) void getFirstPostComments(post.slug, 'comment')
  const links = categoryLinks(categories)
  const trail = [
    { name: BLOG_NAME, href: BLOG_PATH },
    ...chainTrail(post.breadcrumb, links),
    { name: post.name },
  ]

  return (
    <div className={cn(CONTAINER, 'pt-2 pb-10 md:pt-4 md:pb-14')}>
      <ReadingProgress targetId={POST_ARTICLE_ID} />
      <JsonLd data={postJsonLd(post, getStoreConfig().siteUrl)} />
      {post.is_unpublished && <PreviewBar />}
      <Breadcrumbs items={trail} className="mx-auto mb-2 max-w-6xl" />
      <PostArticle
        id={POST_ARTICLE_ID}
        post={post}
        html={postContentHtml(post)}
        categoryLinks={links}
      />
      <div className="mx-auto mt-8 flex max-w-6xl flex-col gap-8 md:mt-10 md:gap-10">
        <RelatedPosts posts={post.related_posts} categoryLinks={links} />
        <BlogProducts
          products={post.related_products}
          title="محصولات مرتبط"
          headingId={POST_PRODUCTS_ID}
          className=""
        />
        {comments ? (
          <PostComments
            slug={post.slug}
            commentCount={post.comment_count}
            questionCount={post.question_count}
          >
            <Suspense
              fallback={<PostCommentPlaceholders type="comment" count={post.comment_count} />}
            >
              <SeededPostComments slug={post.slug} count={post.comment_count} />
            </Suspense>
          </PostComments>
        ) : (
          <p className="rounded-card bg-white p-4 text-base text-ink-600 shadow-card">
            {'دیدگاه\u{200C}ها و پرسش\u{200C}ها پس از انتشار مطلب نمایش داده می\u{200C}شوند.'}
          </p>
        )}
      </div>
    </div>
  )
}
