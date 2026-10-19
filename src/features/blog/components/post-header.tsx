import { CalendarDays, Clock3, Eye } from 'lucide-react'
import Link from 'next/link'
import { Avatar } from '@/components/ui/avatar'
import { ShareButton } from '@/features/product/components/share-button'
import { readingMinutes } from '@/features/blog/reading-time'
import type { PostDetail } from '@/lib/api/types/blog-post'
import { formatJalaliDate, formatNumber, toPersianDigits } from '@/lib/format'
import { blogPostPath } from '@/lib/links/post-link'
import { ReadingListButton } from './reading-list-button'

const META = 'flex items-center gap-1.5 [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-ink-500'

/** The author's initial for the avatar without a picture («کاربر» gives «ک»). */
const initialOf = (name: string) => Array.from(name.trim())[0] ?? null

export interface PostHeaderProps {
  post: PostDetail
  titleId: string
  /** Each published category's page by id: a draft one is named, unlinked. */
  categoryLinks: ReadonlyMap<number, string>
}

/**
 * A post's head: its categories, the title (the page's one h1, `dir="auto"`), then the author,
 * the Jalali publish date (and the update's when it is another day), the reading time (words ÷
 * 200, Persian digits) and the views, with the bookmark (its state as the API read it for this
 * visitor) and the share button (not in a staff preview).
 */
export function PostHeader({ post, titleId, categoryLinks }: PostHeaderProps) {
  const published = post.published_at ? formatJalaliDate(post.published_at) : null
  const updated = formatJalaliDate(post.updated)
  return (
    <header className="mb-4 flex flex-col gap-3 md:mb-6">
      {post.categories.length > 0 && (
        <ul aria-label={'دسته\u{200C}بندی\u{200C}ها'} className="flex flex-wrap gap-x-3 gap-y-1">
          {post.categories.map((category) => {
            const href = categoryLinks.get(category.id)
            return (
              <li key={category.id} className="text-sm font-medium">
                {href ? (
                  <Link
                    href={href}
                    className="inline-flex min-h-11 items-center text-brand-700 hover:text-brand-800 hover:underline"
                  >
                    {category.name}
                  </Link>
                ) : (
                  <span className="inline-flex min-h-11 items-center text-ink-600">
                    {category.name}
                  </span>
                )}
              </li>
            )
          })}
        </ul>
      )}
      <h1
        id={titleId}
        dir="auto"
        className="text-2xl leading-10 font-bold text-ink-900 md:text-3xl md:leading-[3rem]"
      >
        {post.name}
      </h1>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-ink-600">
        {post.author && (
          <span className="flex items-center gap-2 font-medium text-ink-800">
            <Avatar src={post.author.avatar} initial={initialOf(post.author.full_name)} />
            {post.author.full_name}
          </span>
        )}
        {published && post.published_at && (
          <span className={META}>
            <CalendarDays aria-hidden />
            <time dateTime={post.published_at}>{published}</time>
          </span>
        )}
        {updated !== published && (
          <span className={META}>
            {'به\u{200C}روزرسانی'} <time dateTime={post.updated}>{updated}</time>
          </span>
        )}
        <span className={META}>
          <Clock3 aria-hidden />
          {`${toPersianDigits(readingMinutes(post.content))} دقیقه مطالعه`}
        </span>
        <span className={META}>
          <Eye aria-hidden />
          {`${formatNumber(post.view_count)} بازدید`}
        </span>
        <div className="ms-auto flex items-center gap-1">
          <ReadingListButton
            post={{ id: post.id, slug: post.slug }}
            describedBy={titleId}
            initialSaved={post.is_in_reading_list}
          />
          {!post.is_unpublished && (
            <ShareButton
              title={post.name}
              path={blogPostPath(post.slug)}
              copiedMessage="پیوند مطلب کپی شد."
            />
          )}
        </div>
      </div>
    </header>
  )
}
