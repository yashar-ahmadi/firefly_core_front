import type { PageCard, PageDetail } from '@/lib/api/types/page'
import type { SubjectComment } from '@/lib/api/types/subject-comment'

// Content pages as the dev backend answers them (content digest §3: `about-us`, `contact-us`,
// `terms` on 2026-10-19), and crafted variants.

export function pageFixture(overrides: Partial<PageDetail> = {}): PageDetail {
  return {
    id: 1,
    title: 'درباره ما',
    slug: 'about-us',
    url: '/page/about-us/',
    layout: 'default',
    description: null,
    content:
      '<h2>ما که هستیم؟</h2>\nفایرفلای از سال ۱۳۹۸ کار خود را با هدف عرضه کالای اصل آغاز کرد.',
    enable_comments: true,
    comment_count: 1,
    question_count: 0,
    page_title: 'درباره ما',
    page_description: '',
    page_keywords: '',
    canonical_link: null,
    meta_tags: [],
    is_unpublished: false,
    created: '2026-09-20T15:00:00+03:30',
    updated: '2026-09-20T15:00:00+03:30',
    ...overrides,
  }
}

/** `pages/list/?limit=100` as the dev backend orders it (by title). */
export const PAGE_CARDS: PageCard[] = [
  { id: 2, title: 'تماس با ما', slug: 'contact-us', url: '/page/contact-us/', description: null },
  { id: 4, title: 'حریم خصوصی', slug: 'privacy', url: '/page/privacy/', description: null },
  { id: 1, title: 'درباره ما', slug: 'about-us', url: '/page/about-us/', description: null },
  {
    id: 3,
    title: 'قوانین و مقررات',
    slug: 'terms',
    url: '/page/terms/',
    description: null,
  },
]

export function pageComment(overrides: Partial<SubjectComment> = {}): SubjectComment {
  return {
    id: 501,
    name: 'مریم',
    review: 'صفحهٔ خوبی است.',
    comment_type: 'comment',
    is_user_admin: false,
    is_current_user: false,
    parent_id: null,
    replies: [],
    created: '2026-09-25T10:00:00+03:30',
    ...overrides,
  }
}
