import { CalendarDays } from 'lucide-react'
import Link from 'next/link'
import { Carousel } from '@/components/ui/carousel'
import { SmartImage } from '@/components/ui/smart-image'
import type { HomeSection, PostCard } from '@/lib/api/types/catalog'
import { formatJalaliDate } from '@/lib/format'
import { SectionShell } from './section-header'

const IMAGE_SIZES = '(min-width: 1024px) 320px, (min-width: 768px) 33vw, 60vw'

/**
 * A compact post card: picture, title and Jalali publish date; the whole card links to
 * `/blog/{slug}/`.
 */
function PostTile({ post }: { post: PostCard }) {
  const date = post.published_at ? formatJalaliDate(post.published_at) : ''
  return (
    <Link
      href={`/blog/${encodeURIComponent(post.slug)}/`}
      prefetch={false}
      className="group flex h-full flex-col gap-3 rounded-card bg-white p-2.5 shadow-card transition-shadow hover:shadow-raised sm:p-3"
    >
      <SmartImage
        src={post.image}
        alt=""
        ratio="16/9"
        skeleton
        sizes={IMAGE_SIZES}
        loading="lazy"
        className="rounded-control bg-ink-100"
        imgClassName="transition-transform duration-300 ease-out motion-safe:group-hover:scale-[1.03]"
      />
      <div className="flex flex-1 flex-col gap-2 px-0.5">
        <h3 className="line-clamp-2 min-h-14 text-base leading-7 font-medium text-ink-800 transition-colors group-hover:text-brand-700">
          {post.name}
        </h3>
        {date && (
          <p className="mt-auto flex items-center gap-1.5 text-sm text-ink-600">
            <CalendarDays aria-hidden className="size-4 shrink-0" />
            <time dateTime={post.published_at ?? undefined}>{date}</time>
          </p>
        )}
      </div>
    </Link>
  )
}

export interface PostCarouselSectionProps {
  section: Extract<HomeSection, { type: 'post_carousel' }>
  seeAllLabel: string
}

/** Blog posts (content.md §6.7). The section is absent while the blog is off. */
export function PostCarouselSection({ section, seeAllLabel }: PostCarouselSectionProps) {
  if (section.posts.length === 0) return null
  return (
    <SectionShell section={section} seeAllLabel={seeAllLabel} as="div">
      <Carousel
        ariaLabel={section.title.trim() || 'مطالب بلاگ'}
        slidesPerView={{ base: 1.5, md: 3, lg: 4 }}
        arrowGutters
      >
        {section.posts.map((post) => (
          <PostTile key={post.id} post={post} />
        ))}
      </Carousel>
    </SectionShell>
  )
}
