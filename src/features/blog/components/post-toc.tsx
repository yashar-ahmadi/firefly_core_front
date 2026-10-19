'use client'

import { ChevronDown, ListTree } from 'lucide-react'
import { useEffect, useId, useMemo, useState, type MouseEvent } from 'react'
import { jumpTo } from '@/components/layout/in-page-scroll'
import { cn } from '@/components/ui/cn'
import { usePrefersReducedMotion } from '@/components/ui/use-media-query'
import { tocEntries, tocHref } from '@/features/blog/post-toc-entries'
import type { ContentHeading } from '@/lib/api/types/blog-post'
import { toPersianDigits } from '@/lib/format/digits'
import { isModifiedClick } from '@/lib/navigation/modified-click'

const LABEL = 'فهرست مطالب'
/** A heading above this share of the viewport's height is one the visitor has reached. */
const READING_LINE = 0.3
/**
 * How far above the viewport the observer's band reaches: further than any post is long, so a
 * heading is inside the band exactly when it is above the reading line.
 */
const BAND_ABOVE_PX = 100_000

/**
 * The heading whose section is being read: the last one above the reading line (none above the
 * first). One IntersectionObserver for every heading, whose band is everything above the line
 * (`BAND_ABOVE_PX` up, to the line down): it calls back whenever a heading changes sides of the
 * line, in either direction, however the page moved. A band ending at the viewport's top would
 * miss a jump (End, Home, a scrollbar drag, an instant scroll) that takes a heading from below
 * the line to above the viewport at once: it would never be inside the band, and the mark would
 * stay on the old section. The answer is then read off the headings' boxes; no scroll listener.
 */
function useCurrentHeading(ids: readonly string[]): string | null {
  const [current, setCurrent] = useState<string | null>(null)
  const key = ids.join('\n')
  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return
    const headings = key
      .split('\n')
      .map((id) => document.getElementById(id))
      .filter((heading): heading is HTMLElement => heading !== null)
    const update = () => {
      const line = window.innerHeight * READING_LINE
      let reached: string | null = null
      for (const heading of headings) {
        if (heading.getBoundingClientRect().top > line) break
        reached = heading.id
      }
      setCurrent(reached)
    }
    const observer = new IntersectionObserver(update, {
      rootMargin: `${BAND_ABOVE_PX}px 0px -${(1 - READING_LINE) * 100}% 0px`,
    })
    for (const heading of headings) observer.observe(heading)
    return () => observer.disconnect()
  }, [key])
  return current
}

export interface PostTocProps {
  /** The post's `headings`: h2 and h3 become the rows (`tocEntries`). */
  headings: readonly ContentHeading[]
  className?: string
}

/**
 * «فهرست مطالب» (blog digest §1.5): a labelled nav of the post's h2 and h3, numbered as the API
 * numbers them, the h3 indented under theirs. A press finds the heading with getElementById (its
 * id may be Persian), scrolls it just under the sticky header (at once under reduced motion),
 * focuses it and puts its `#id` in the URL; without script the links still jump (the headings
 * have a scroll margin). The section being read is marked (`aria-current`). On phones it folds
 * behind a button (closed at first, above the content); from lg it is always open, and the page
 * makes it sticky beside the content. Nothing for fewer than two rows.
 */
export function PostToc({ headings, className }: PostTocProps) {
  const entries = useMemo(() => tocEntries(headings), [headings])
  const [open, setOpen] = useState(false)
  const listId = useId()
  const reducedMotion = usePrefersReducedMotion()
  const current = useCurrentHeading(entries.map((entry) => entry.id))
  if (entries.length < 2) return null

  const go = (event: MouseEvent<HTMLAnchorElement>, id: string) => {
    if (isModifiedClick(event)) return
    const heading = document.getElementById(id)
    if (!heading) return
    event.preventDefault()
    if (!heading.hasAttribute('tabindex')) heading.setAttribute('tabindex', '-1')
    jumpTo(heading, tocHref(id), { reducedMotion })
  }

  return (
    <nav aria-label={LABEL} className={cn('rounded-card bg-white shadow-card', className)}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen(!open)}
        className="flex min-h-13 w-full items-center gap-2 rounded-card px-4 text-start text-base font-bold text-ink-900 focus-visible:-outline-offset-2 lg:hidden"
      >
        <ListTree aria-hidden className="size-5 shrink-0 text-brand-700" />
        <span className="flex-1">{LABEL}</span>
        <ChevronDown
          aria-hidden
          className={cn(
            'size-5 shrink-0 text-ink-600 motion-safe:transition-transform',
            open && 'rotate-180',
          )}
        />
      </button>
      <p
        aria-hidden
        className="hidden items-center gap-2 px-4 pt-4 pb-1 text-base font-bold text-ink-900 lg:flex"
      >
        <ListTree className="size-5 shrink-0 text-brand-700" />
        {LABEL}
      </p>
      <ol
        id={listId}
        className={cn('flex flex-col px-2 pb-3 max-lg:pt-1', !open && 'max-lg:hidden')}
      >
        {entries.map((entry) => (
          <li key={entry.id}>
            <a
              href={tocHref(entry.id)}
              aria-current={current === entry.id ? 'true' : undefined}
              onClick={(event) => go(event, entry.id)}
              className={cn(
                'flex min-h-11 items-start gap-2 rounded-control px-2 py-2.5 text-base leading-6 text-ink-700',
                'transition-colors duration-150 hover:bg-ink-50 hover:text-ink-900',
                'aria-[current=true]:bg-brand-50 aria-[current=true]:font-medium aria-[current=true]:text-brand-800',
                entry.depth === 1 && 'ps-6',
              )}
            >
              <span className="shrink-0 text-ink-500 tabular-nums">
                {toPersianDigits(entry.number)}
              </span>
              <span dir="auto" className="min-w-0">
                {entry.text}
              </span>
            </a>
          </li>
        ))}
      </ol>
    </nav>
  )
}
