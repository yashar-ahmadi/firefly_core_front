import Link from 'next/link'
import { useId } from 'react'
import { Avatar } from '@/components/ui/avatar'
import { cn } from '@/components/ui/cn'
import { SmartImage } from '@/components/ui/smart-image'
import { postCategory } from '@/features/blog/blog-categories'
import { blogPostPath } from '@/features/blog/blog-routes'
import type { PostCard as PostCardData } from '@/lib/api/types/blog'
import { formatJalaliDate } from '@/lib/format'
import { ABOVE_LINK, CARD_LAYOUTS, STRETCHED_LINK, type PostCardVariant } from './post-card-styles'
import { ReadingListButton } from './reading-list-button'

export interface PostCardProps {
  post: PostCardData
  /** Each published category's page by id (`categoryLinks`): a draft one is named, unlinked. */
  categoryLinks: ReadonlyMap<number, string>
  variant?: PostCardVariant
  /** The picture is above the fold (the first cards): loaded eagerly, first. */
  priority?: boolean
  /**
   * The card's `is_in_reading_list` is the viewer's own (a post's related posts, read per
   * request as the visitor): the bookmark starts from it (`initialSaved`). Cached cards' flag is
   * always false: leave it unset.
   */
  ownFlag?: boolean
}

/** The author's initial for the avatar without a picture («کاربر» gives «ک»). */
function initialOf(name: string): string | null {
  return Array.from(name.trim())[0] ?? null
}

/**
 * A blog post card (Plan 2's card pattern): an `<article>` whose title link stretches over the
 * whole card (`::after`), so the card is one tab stop and one click target; the category link
 * and the reading-list bookmark sit above it as siblings, never inside it. It shows the square
 * picture (500×500 from the API), the first category, the title (`dir="auto"`: Latin names), the
 * excerpt, the author's avatar and name and the Jalali publish date. Server-rendered: the picture,
 * the avatar and the bookmark are client leaves. The title link is never prefetched (a post's
 * page counts a view per render: blog digest §1.5).
 */
export function PostCard({
  post,
  categoryLinks,
  variant = 'list',
  priority = false,
  ownFlag = false,
}: PostCardProps) {
  const layout = CARD_LAYOUTS[variant]
  const titleId = useId()
  const category = postCategory(post.categories, categoryLinks)
  const date = post.published_at ? formatJalaliDate(post.published_at) : ''

  return (
    <article className={layout.article}>
      <div className={layout.media}>
        <SmartImage
          src={post.image}
          alt=""
          ratio="1/1"
          skeleton
          sizes={layout.sizes}
          loading={priority ? 'eager' : 'lazy'}
          fetchPriority={priority ? 'high' : undefined}
          className={cn('bg-ink-50', layout.image)}
          imgClassName="transition-transform duration-300 ease-out motion-safe:group-hover/card:scale-[1.03]"
        />
      </div>

      <div className={layout.text}>
        <div className={layout.body}>
          {category &&
            (category.href ? (
              <Link
                href={category.href}
                className={cn(
                  ABOVE_LINK,
                  'inline-flex min-h-7 items-center self-start text-sm font-medium text-brand-700 hover:text-brand-800 hover:underline',
                  // 44px of height to press, the text staying small.
                  'after:absolute after:inset-x-0 after:-inset-y-2',
                )}
              >
                {category.name}
              </Link>
            ) : (
              <span className="inline-flex min-h-7 items-center text-sm font-medium text-ink-600">
                {category.name}
              </span>
            ))}

          <h3 id={titleId} dir="auto" className={layout.title}>
            <Link href={blogPostPath(post.slug)} prefetch={false} className={STRETCHED_LINK}>
              {post.name}
            </Link>
          </h3>

          {post.description && <p className={layout.excerpt}>{post.description}</p>}
        </div>

        <div className={cn('flex min-w-0 items-center gap-2 text-sm text-ink-600', layout.meta)}>
          {post.author && (
            <span className="flex min-w-0 items-center gap-2">
              <Avatar
                src={post.author.avatar}
                initial={initialOf(post.author.full_name)}
                size="sm"
              />
              <span className="truncate">{post.author.full_name}</span>
            </span>
          )}
          {post.author && date && (
            <span aria-hidden className="text-ink-300">
              ·
            </span>
          )}
          {date && (
            <time dateTime={post.published_at ?? undefined} className="shrink-0">
              {date}
            </time>
          )}
          <div className={cn(ABOVE_LINK, '-my-2 ms-auto -me-2 shrink-0')}>
            <ReadingListButton
              post={{ id: post.id, slug: post.slug }}
              describedBy={titleId}
              initialSaved={ownFlag ? post.is_in_reading_list : undefined}
            />
          </div>
        </div>
      </div>
    </article>
  )
}
