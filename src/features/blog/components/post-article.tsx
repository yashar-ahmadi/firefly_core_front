import { cn } from '@/components/ui/cn'
import { SmartImage } from '@/components/ui/smart-image'
import { tocEntries } from '@/features/blog/post-toc-entries'
import { RichContentBody } from '@/features/content/rich-content-body'
import type { PostDetail } from '@/lib/api/types/blog-post'
import { POST_TITLE_ID } from '@/lib/html/reserved-ids'
import { PostHeader } from './post-header'
import { PostToc } from './post-toc'

/** Under the sticky header, with a little air (the header's full height: a jump on load). */
const HEADING_SCROLL_MARGIN = '[&_:is(h2,h3,h4,h5,h6)]:scroll-mt-[calc(var(--header-full)+1rem)]'

export interface PostArticleProps {
  /** The article's id: the reading progress follows it. */
  id: string
  post: PostDetail
  /** The post's content, sanitised on the server with its heading ids kept (`postContentHtml`). */
  html: string | null
  categoryLinks: ReadonlyMap<number, string>
}

/**
 * A post (blog digest §1.5): its head (PostHeader), the banner only when the API has one (never
 * the square picture instead), then the content (RichContentBody: its shop links route in the
 * browser, short links load whole, `/media` on the API) beside its table of contents: above the
 * content on phones (folded), sticky beside it from lg. Without two headings to list, the
 * content takes the whole width.
 */
export function PostArticle({ id, post, html, categoryLinks }: PostArticleProps) {
  const hasToc = tocEntries(post.headings).length >= 2
  return (
    <article id={id} aria-labelledby={POST_TITLE_ID} className="mx-auto max-w-6xl">
      <PostHeader post={post} titleId={POST_TITLE_ID} categoryLinks={categoryLinks} />
      {post.banner && (
        <SmartImage
          src={post.banner}
          alt=""
          ratio="2/1"
          skeleton
          loading="eager"
          fetchPriority="high"
          sizes="(min-width: 1200px) 1152px, 100vw"
          className="mb-4 rounded-card bg-ink-100 md:mb-6"
        />
      )}
      <div
        className={cn(
          'grid gap-4 md:gap-6',
          hasToc && 'lg:grid-cols-[minmax(0,1fr)_17.5rem] lg:gap-8',
        )}
      >
        {hasToc && (
          <div className="lg:col-start-2 lg:row-start-1">
            <PostToc
              headings={post.headings}
              className="lg:sticky lg:top-[calc(var(--header-offset)+1rem)] lg:max-h-[calc(100dvh-var(--header-offset)-2rem)] lg:overflow-y-auto lg:transition-[top] lg:duration-200"
            />
          </div>
        )}
        <div className="min-w-0 rounded-card bg-white p-4 shadow-card md:p-8 lg:col-start-1 lg:row-start-1">
          {html ? (
            <RichContentBody
              html={html}
              className={cn('rich-content text-base leading-8', HEADING_SCROLL_MARGIN)}
            />
          ) : (
            post.description && (
              <p className="text-base leading-8 text-ink-800">{post.description}</p>
            )
          )}
        </div>
      </div>
    </article>
  )
}
