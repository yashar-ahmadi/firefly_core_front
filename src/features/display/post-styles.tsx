import { CalendarDays } from 'lucide-react'
import Link from 'next/link'
import { cn } from '@/components/ui/cn'
import { SmartImage } from '@/components/ui/smart-image'
import type { PostCard } from '@/lib/api/types/blog'
import { formatJalaliDate } from '@/lib/format'
import { blogPostPath } from '@/lib/links/post-link'

// A post carousel's cards and its four styles' bodies (content digest §6.7). Every card links to
// `/blog/{slug}/`, never prefetched: a post's page counts a view per render (P5-R1).

const TILE_SIZES = '(min-width: 1024px) 320px, (min-width: 768px) 33vw, 60vw'

/** The post's Jalali publish date with its icon; nothing when it has none. */
function PostDate({ post, className }: { post: PostCard; className?: string }) {
  const date = post.published_at ? formatJalaliDate(post.published_at) : ''
  if (!date) return null
  return (
    <p className={cn('flex items-center gap-1.5 text-sm text-ink-600', className)}>
      <CalendarDays aria-hidden className="size-4 shrink-0" />
      <time dateTime={post.published_at ?? undefined}>{date}</time>
    </p>
  )
}

/** A compact post card: picture, title and Jalali publish date; the whole card is the link. */
export function PostTile({ post }: { post: PostCard }) {
  return (
    <Link
      href={blogPostPath(post.slug)}
      prefetch={false}
      className="group flex h-full flex-col gap-3 rounded-card bg-white p-2.5 shadow-card transition-shadow hover:shadow-raised sm:p-3"
    >
      <SmartImage
        src={post.image}
        alt=""
        ratio="16/9"
        skeleton
        sizes={TILE_SIZES}
        loading="lazy"
        className="rounded-control bg-ink-100"
        imgClassName="transition-transform duration-300 ease-out motion-safe:group-hover:scale-[1.03]"
      />
      <div className="flex flex-1 flex-col gap-2 px-0.5">
        <h3 className="line-clamp-2 min-h-14 text-base leading-7 font-medium text-ink-800 transition-colors group-hover:text-brand-700">
          {post.name}
        </h3>
        <PostDate post={post} className="mt-auto" />
      </div>
    </Link>
  )
}

/** Style 2, a grid: the cards in rows, two on phones from sm, three from md, four from xl. */
export function PostGrid({ posts }: { posts: PostCard[] }) {
  return (
    <ul className="grid gap-3 sm:grid-cols-2 sm:gap-4 md:grid-cols-3 xl:grid-cols-4">
      {posts.map((post) => (
        <li key={post.id} className="min-w-0">
          <PostTile post={post} />
        </li>
      ))}
    </ul>
  )
}

/** Style 3 shows the featured post and up to this many after it. */
export const FEATURED_LIST_MAX = 4

/** A row of the featured style's list and of the compact list: thumbnail, title, date. */
function PostRow({ post, size }: { post: PostCard; size: 'sm' | 'md' }) {
  return (
    <Link
      href={blogPostPath(post.slug)}
      prefetch={false}
      className="group flex items-center gap-3 rounded-control p-1.5 transition-colors hover:bg-ink-50"
    >
      <SmartImage
        src={post.image}
        alt=""
        ratio="1/1"
        sizes={size === 'md' ? '96px' : '80px'}
        loading="lazy"
        className={cn('shrink-0 rounded-control bg-ink-100', size === 'md' ? 'size-24' : 'size-20')}
      />
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="line-clamp-2 text-base leading-7 font-medium text-ink-800 transition-colors group-hover:text-brand-700">
          {post.name}
        </span>
        <PostDate post={post} />
      </span>
    </Link>
  )
}

/**
 * Style 3, featured: the first post large (its picture, title, excerpt and date) beside a list
 * of the next four (below it on phones). A carousel set to more posts shows these five; its
 * «مشاهدهٔ همه» leads to the rest.
 */
export function PostFeatured({ posts }: { posts: PostCard[] }) {
  const [first, ...others] = posts
  if (!first) return null
  const list = others.slice(0, FEATURED_LIST_MAX)
  const excerpt = first.description?.trim()
  return (
    <div
      className={cn(
        'grid gap-4 lg:gap-6',
        list.length > 0 && 'lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]',
      )}
    >
      <Link
        href={blogPostPath(first.slug)}
        prefetch={false}
        className="group flex flex-col gap-3 rounded-card bg-white p-3 shadow-card transition-shadow hover:shadow-raised md:p-4"
      >
        <SmartImage
          src={first.image}
          alt=""
          ratio="16/9"
          skeleton
          sizes="(min-width: 1024px) 60vw, calc(100vw - 2rem)"
          loading="lazy"
          className="rounded-control bg-ink-100"
          imgClassName="transition-transform duration-500 ease-out motion-safe:group-hover:scale-[1.02]"
        />
        <div className="flex flex-col gap-2 px-0.5">
          <h3 className="line-clamp-2 text-lg leading-8 font-bold text-ink-900 transition-colors group-hover:text-brand-700 md:text-xl md:leading-9">
            {first.name}
          </h3>
          {excerpt && (
            <p className="line-clamp-3 text-base leading-7 text-ink-600">{first.description}</p>
          )}
          <PostDate post={first} />
        </div>
      </Link>
      {list.length > 0 && (
        <ul className="flex flex-col divide-y divide-ink-100 rounded-card bg-white p-2 shadow-card md:p-3">
          {list.map((post) => (
            <li key={post.id} className="py-1.5 first:pt-0 last:pb-0">
              <PostRow post={post} size="md" />
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/** Style 4, a compact list: a row per post (thumbnail, title, date), one to three columns. */
export function PostCompactList({ posts }: { posts: PostCard[] }) {
  return (
    <ul className="grid gap-x-4 gap-y-2 rounded-card bg-white p-2 shadow-card md:grid-cols-2 md:p-3 xl:grid-cols-3">
      {posts.map((post) => (
        <li key={post.id} className="min-w-0">
          <PostRow post={post} size="sm" />
        </li>
      ))}
    </ul>
  )
}
