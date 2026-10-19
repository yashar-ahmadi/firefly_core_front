import 'server-only'
import { getBlogCategories } from '@/features/blog/api'
import { getPost } from '@/features/blog/post-api'
import { richContentHtml } from '@/features/content/rich-content'
import type { BlogCategoryListItem } from '@/lib/api/types/blog'
import type { PostDetail } from '@/lib/api/types/blog-post'

// What a post's page loads; both loaders are React-cached, so `generateMetadata` and the page
// share one request of each (the post's counts a view: post-api.ts). Wrap it in `loadBlog`
// (./availability.ts) for the blog switch.

export interface PostPageData {
  post: PostDetail
  /** Every published category, for the post's category links (its own carry no path). */
  categories: BlogCategoryListItem[]
}

/** The post and the categories at once; null when there is no such post to show (a 404). */
export async function loadPost(slug: string): Promise<PostPageData | null> {
  const [post, categories] = await Promise.all([getPost(slug), getBlogCategories()])
  return post && { post, categories }
}

/**
 * The post's content made safe to render (`richContentHtml`: `/media` absolute, links leaving
 * the shop in a new tab) with the ids the API put on its headings kept: the table of contents
 * links to them. null when nothing visible is left.
 */
export function postContentHtml(post: PostDetail): string | null {
  if (!post.content) return null
  return richContentHtml(post.content, {
    headingIds: new Set(post.headings.map((heading) => heading.id)),
  })
}
