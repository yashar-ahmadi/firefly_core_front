import { Carousel } from '@/components/ui/carousel'
import { displayStyle } from '@/features/display/display-style'
import { PostCompactList, PostFeatured, PostGrid, PostTile } from '@/features/display/post-styles'
import type { HomeSection } from '@/lib/api/types/catalog'
import { SectionShell } from './section-header'

export interface PostCarouselSectionProps {
  section: Extract<HomeSection, { type: 'post_carousel' }>
  seeAllLabel: string
}

/**
 * Blog posts (content.md §6.7) in the operator's style: 1. a carousel of cards; 2. a grid;
 * 3. the first post featured beside a list of the next four; 4. a compact list. The section is
 * absent while the blog is off.
 */
export function PostCarouselSection({ section, seeAllLabel }: PostCarouselSectionProps) {
  if (section.posts.length === 0) return null
  const style = displayStyle(section.style)
  if (style !== 'style_1') {
    const Body = { style_2: PostGrid, style_3: PostFeatured, style_4: PostCompactList }[style]
    return (
      <SectionShell section={section} seeAllLabel={seeAllLabel}>
        <Body posts={section.posts} />
      </SectionShell>
    )
  }
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
