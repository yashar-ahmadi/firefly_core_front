// The post card's layouts (post-card.tsx). Mobile first. A card has its picture, its text (the
// category, title and excerpt) and its meta line (author, date, bookmark). A row card puts the
// square thumbnail beside the text and the meta line across the card under both, so the
// author's name has room; its text wrapper is `contents` then, the three laid out by the card.

export type PostCardVariant = 'list' | 'feature' | 'wide'

interface CardLayout {
  article: string
  media: string
  /** The picture's own corners (a tile's picture is clipped by the card's). */
  image: string
  /** Around the text and the meta line. */
  text: string
  body: string
  title: string
  excerpt: string
  meta: string
  /** next/image `sizes` for the square picture. */
  sizes: string
}

const SURFACE =
  'group/card relative rounded-card bg-white shadow-card transition-[box-shadow,transform] duration-200 ease-out hover:shadow-raised motion-safe:hover:-translate-y-0.5'
const ROW = 'flex flex-wrap items-start gap-x-3 gap-y-2 p-3'
const ROW_BODY = 'flex min-w-0 flex-1 flex-col gap-1'

export const CARD_LAYOUTS: Record<PostCardVariant, CardLayout> = {
  // The archive's grid: a row on phones (no excerpt: a page of posts stays short), a tile with
  // the picture on top from sm, as tall as the row it sits in.
  list: {
    article: `${SURFACE} ${ROW} h-full sm:flex-col sm:flex-nowrap sm:items-stretch sm:gap-0 sm:overflow-hidden sm:p-0`,
    media: 'w-24 shrink-0 sm:w-full',
    image: 'rounded-control sm:rounded-none',
    text: 'contents sm:flex sm:flex-1 sm:flex-col sm:gap-3 sm:p-4',
    body: ROW_BODY,
    title: 'line-clamp-2 text-base leading-7 font-bold text-ink-900',
    excerpt: 'line-clamp-2 text-sm leading-6 text-ink-600 max-sm:hidden',
    meta: 'basis-full sm:mt-auto',
    sizes: '(min-width: 1280px) 330px, (min-width: 1024px) 30vw, (min-width: 640px) 45vw, 96px',
  },
  // The featured posts beside the first: compact rows at every width.
  feature: {
    article: `${SURFACE} ${ROW} h-full`,
    media: 'w-24 shrink-0 sm:w-28',
    image: 'rounded-control',
    text: 'contents',
    body: ROW_BODY,
    title: 'line-clamp-2 text-base leading-7 font-bold text-ink-900 md:text-lg md:leading-8',
    excerpt: 'hidden',
    meta: 'basis-full',
    sizes: '112px',
  },
  // The first featured post: a tile on phones, the picture beside the text from md (at most
  // 28rem square, so the hero stays shorter than the screen).
  wide: {
    article: `${SURFACE} flex h-full flex-col overflow-hidden md:flex-row`,
    media: 'w-full md:w-1/2 md:shrink-0 lg:max-w-[28rem]',
    image: 'rounded-none',
    text: 'flex min-w-0 flex-1 flex-col justify-center gap-4 p-4 md:p-6 lg:p-8',
    body: 'flex min-w-0 flex-col gap-2',
    title: 'line-clamp-3 text-xl leading-9 font-bold text-ink-900 md:text-2xl md:leading-10',
    excerpt: 'line-clamp-3 text-base leading-7 text-ink-600 md:text-lg md:leading-8',
    meta: '',
    sizes: '(min-width: 1024px) 448px, (min-width: 768px) 50vw, 100vw',
  },
}

/** The title link: its `::after` covers the card (one tab stop, one click target). */
export const STRETCHED_LINK =
  "after:absolute after:inset-0 after:rounded-card after:content-[''] focus-visible:outline-none focus-visible:after:outline-2 focus-visible:after:outline-offset-2 focus-visible:after:outline-(--focus) focus-visible:after:outline-solid"

/** Above the stretched link: the category link and the bookmark stay their own targets. */
export const ABOVE_LINK = 'relative z-[1]'
