import { Suspense } from 'react'
import { Breadcrumbs } from '@/components/layout/breadcrumbs'
import { CONTAINER } from '@/components/layout/container'
import { PreviewBar } from '@/components/layout/preview-bar'
import { cn } from '@/components/ui/cn'
import { SeededComments } from '@/features/comments/seeded-comments'
import { CommentPlaceholders } from '@/features/comments/subject-comment-list'
import { richContentHtml } from '@/features/content/rich-content'
import { getPageCards } from '@/features/content/pages/api'
import { RichContentBody } from '@/features/content/rich-content-body'
import { JsonLd } from '@/features/seo/json-ld'
import { propertyMetaTags } from '@/features/seo/page-metadata'
import type { PageDetail, PageLayout } from '@/lib/api/types/page'
import { PAGE_TITLE_ID } from '@/lib/html/reserved-ids'
import { ContactFormSlot } from './contact-slot'
import { PageComments } from './page-comments'
import { CONTACT_US_SLUG, commentsShown, pageLayout } from './page-routes'
import { otherPages, PagesAside } from './pages-aside'

/** Each layout's frame (content digest §3.2). */
const FRAMES: Record<PageLayout, string> = {
  // One column of a readable width (about 70 characters of 16px Persian text).
  default: 'mx-auto max-w-3xl',
  // The container's whole width, for wide pictures and tables, which keep their width and scroll
  // sideways in their own focusable box on phones (`.rich-content-wide`, rich-content.css).
  full_width: 'w-full',
  // The text, and the aside beside it from lg (below it on phones: it follows in the document).
  with_sidebar: 'grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_18rem] lg:gap-8',
}

export interface ContentPageProps {
  page: PageDetail
  /** The page's JSON-LD (`contentPageJsonLd`). */
  jsonLd: object
}

/**
 * A content page (content digest §3.2): the operator's `property=` meta rows (Open Graph needs
 * `property`, which Next's metadata cannot write: React hoists these into <head>), its JSON-LD,
 * the staff preview's bar, the trail, then the layout's frame (`data-layout`): the article (its
 * title, the page's one h1; the content, sanitised: `/media` on the API, shop links routed in the
 * browser, a post's never prefetched; under `contact-us`, the contact form's slot), the comments
 * block when it shows (`commentsShown`), and the `with_sidebar` aside (the other pages: the list
 * is read for that layout only, cached like the pages). Server-rendered; the comments' first
 * page streams in its own `<Suspense>`.
 */
export async function ContentPage({ page, jsonLd }: ContentPageProps) {
  const layout = pageLayout(page.layout)
  const others = layout === 'with_sidebar' ? otherPages(await getPageCards(), page.slug) : []
  // `full_width`: each picture outside a link is a focusable scroll region, as tables are.
  const html = page.content
    ? richContentHtml(page.content, { wideImages: layout === 'full_width' })
    : null
  const comments = commentsShown(page)
  const head = layout === 'default' ? FRAMES.default : undefined

  return (
    <div className={cn(CONTAINER, 'pt-2 pb-10 md:pt-4 md:pb-14')}>
      {propertyMetaTags(page.meta_tags).map((tag, index) => (
        <meta key={`${tag.field}-${index}`} property={tag.field.trim()} content={tag.value} />
      ))}
      <JsonLd data={jsonLd} />
      {page.is_unpublished && (
        <PreviewBar className={head}>{'پیش\u{200C}نویس — منتشر نشده'}</PreviewBar>
      )}
      <Breadcrumbs items={[{ name: page.title }]} className={cn('mb-2', head)} />
      <div data-layout={layout} className={FRAMES[layout]}>
        <div className="flex min-w-0 flex-col gap-8 md:gap-10">
          <article
            aria-labelledby={PAGE_TITLE_ID}
            className="min-w-0 rounded-card bg-white p-4 shadow-card md:p-8"
          >
            <h1
              id={PAGE_TITLE_ID}
              dir="auto"
              className="mb-4 text-2xl leading-10 font-bold text-ink-900 md:mb-6 md:text-3xl md:leading-[3rem]"
            >
              {page.title}
            </h1>
            {html ? (
              <RichContentBody
                html={html}
                className={cn(
                  'rich-content text-base leading-8',
                  layout === 'full_width' && 'rich-content-wide',
                )}
              />
            ) : (
              page.description && (
                <p className="text-base leading-8 text-ink-800">{page.description}</p>
              )
            )}
            {page.slug === CONTACT_US_SLUG && <ContactFormSlot />}
          </article>
          {comments && (
            <PageComments
              slug={page.slug}
              enableComments={page.enable_comments}
              commentCount={page.comment_count}
              questionCount={page.question_count}
            >
              <Suspense
                fallback={<CommentPlaceholders type="comment" count={page.comment_count} />}
              >
                <SeededComments
                  subject={{ kind: 'page', slug: page.slug }}
                  count={page.comment_count}
                />
              </Suspense>
            </PageComments>
          )}
          {page.is_unpublished && (page.enable_comments || page.comment_count > 0) && (
            <p className="rounded-card bg-white p-4 text-base text-ink-600 shadow-card">
              {'دیدگاه\u{200C}ها و پرسش\u{200C}ها پس از انتشار صفحه نمایش داده می\u{200C}شوند.'}
            </p>
          )}
        </div>
        {layout === 'with_sidebar' && <PagesAside pages={others} />}
      </div>
    </div>
  )
}
