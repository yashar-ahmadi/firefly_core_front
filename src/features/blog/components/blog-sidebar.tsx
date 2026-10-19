import Link from 'next/link'
import { MenuLink } from '@/components/layout/menu-link'
import { cn } from '@/components/ui/cn'
import type { BlogCategoryNode } from '@/features/blog/blog-categories'
import { blogPostPath } from '@/features/blog/blog-routes'
import type { PostCard } from '@/lib/api/types/blog'
import type { MenuNode } from '@/lib/api/types/settings'
import { formatJalaliDate } from '@/lib/format'

const BOX = 'rounded-card bg-white p-4 shadow-card'
const HEADING = 'mb-2 text-base leading-8 font-bold text-ink-900'
const ROW_LINK =
  'flex min-h-11 items-center rounded-control px-2 text-base text-ink-700 transition-colors hover:bg-ink-50 hover:text-ink-900 aria-[current=page]:bg-brand-50 aria-[current=page]:font-bold aria-[current=page]:text-brand-800'

function CategoryList({ nodes, currentId }: { nodes: BlogCategoryNode[]; currentId?: number }) {
  return (
    <ul className="flex flex-col gap-0.5">
      {nodes.map((node) => (
        <li key={node.id}>
          <Link
            href={node.href}
            aria-current={node.id === currentId ? 'page' : undefined}
            className={ROW_LINK}
          >
            {node.name}
          </Link>
          {node.children.length > 0 && (
            <div className="ms-3 border-s border-ink-100 ps-2">
              <CategoryList nodes={node.children} currentId={currentId} />
            </div>
          )}
        </li>
      ))}
    </ul>
  )
}

function RecentPosts({ posts }: { posts: PostCard[] }) {
  return (
    <ol className="flex flex-col divide-y divide-ink-100">
      {posts.map((post) => (
        <li key={post.id}>
          <Link
            href={blogPostPath(post.slug)}
            prefetch={false}
            className="group flex min-h-16 flex-col justify-center gap-0.5 rounded-control px-2 py-2 transition-colors hover:bg-ink-50"
          >
            <span
              dir="auto"
              className="line-clamp-2 text-base leading-7 font-medium text-ink-800 group-hover:text-brand-700"
            >
              {post.name}
            </span>
            {post.published_at && (
              <time dateTime={post.published_at} className="text-sm text-ink-600">
                {formatJalaliDate(post.published_at)}
              </time>
            )}
          </Link>
        </li>
      ))}
    </ol>
  )
}

/** The operator's `blog-sidebar` menu: links, a group heading with its links under it. */
function SidebarMenu({ nodes }: { nodes: MenuNode[] }) {
  return (
    <ul className="flex flex-col gap-0.5">
      {nodes.map((node) => (
        <li key={node.id}>
          {node.url === null ? (
            <span className="flex min-h-9 items-center px-2 text-sm font-bold text-ink-600">
              {node.title}
            </span>
          ) : (
            <MenuLink node={node} withIcon prefetch={false} className={cn(ROW_LINK, 'gap-2')} />
          )}
          {node.children.length > 0 && (
            <div className="ms-3 ps-2">
              <SidebarMenu nodes={node.children} />
            </div>
          )}
        </li>
      ))}
    </ul>
  )
}

export interface BlogSidebarProps {
  /** The category tree (`categoryTree`); the page's own category is marked current. */
  categories: BlogCategoryNode[]
  currentCategoryId?: number
  /** The blog home's `recent_posts` (its first page only). */
  recentPosts?: PostCard[]
  /** `getMenu('blog-sidebar')`: pre-filtered by the API. */
  menu: MenuNode[]
}

/**
 * The blog's side column (below the posts on phones, beside them from lg): the categories as a
 * tree, the recent posts (the home), and the operator's `blog-sidebar` menu. Each box is left out
 * when empty, and the whole column when all are.
 */
export function BlogSidebar({
  categories,
  currentCategoryId,
  recentPosts = [],
  menu,
}: BlogSidebarProps) {
  if (categories.length === 0 && recentPosts.length === 0 && menu.length === 0) return null
  return (
    <aside aria-label="ستون کناری وبلاگ" className="flex min-w-0 flex-col gap-4">
      {categories.length > 0 && (
        <section aria-labelledby="blog-sidebar-categories" className={BOX}>
          <h2 id="blog-sidebar-categories" className={HEADING}>
            دسته‌بندی‌ها
          </h2>
          <CategoryList nodes={categories} currentId={currentCategoryId} />
        </section>
      )}
      {recentPosts.length > 0 && (
        <section aria-labelledby="blog-sidebar-recent" className={BOX}>
          <h2 id="blog-sidebar-recent" className={HEADING}>
            مطالب اخیر
          </h2>
          <RecentPosts posts={recentPosts} />
        </section>
      )}
      {menu.length > 0 && (
        <section aria-labelledby="blog-sidebar-menu" className={BOX}>
          <h2 id="blog-sidebar-menu" className={HEADING}>
            پیشنهادها
          </h2>
          <SidebarMenu nodes={menu} />
        </section>
      )}
    </aside>
  )
}
