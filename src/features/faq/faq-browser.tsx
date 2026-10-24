'use client'

import { Search } from 'lucide-react'
import Link from 'next/link'
import { useCallback, useId, useMemo, useState } from 'react'
import { cn } from '@/components/ui/cn'
import { Input } from '@/components/ui/input'
import { useHydrated } from '@/components/ui/use-media-query'
import { toPersianDigits } from '@/lib/format/digits'
import { FaqChips } from './faq-chips'
import { categoryAnchor, FaqQuestion, UNDER_STICKY } from './faq-question'
import { faqHaystack, matchesSearch, searchTokens } from './faq-search'
import type { FaqSection } from './faq-sections'
import { useFaqDeepLink } from './use-faq-deep-link'

/** What the polite region says: the matches' count, or that there are none; nothing unsearched. */
function countMessage(searching: boolean, count: number): string {
  if (!searching) return ''
  return count > 0 ? `${toPersianDigits(String(count))} پرسش پیدا شد.` : 'پرسشی پیدا نشد.'
}

/**
 * The help centre's questions (blog-faq digest §2.2), server-rendered whole (crawlable, and
 * usable without JavaScript: the chips are in-page links, each question a native disclosure),
 * with a search over every question and answer in the browser (the API has none): Persian-aware
 * (`faq-search.ts`), every word in any order. While a search runs, the questions and categories
 * without a match are hidden, the chips with them, and a polite region says the count; nothing
 * found offers the way to ask the shop. A `#faq-<id>` link opens its question
 * (`useFaqDeepLink`). The search box is disabled until hydrated (typing before then would do
 * nothing).
 */
export function FaqBrowser({ sections }: { sections: readonly FaqSection[] }) {
  const [query, setQuery] = useState('')
  const hydrated = useHydrated()
  const searchId = useId()
  const clearSearch = useCallback(() => setQuery(''), [])
  useFaqDeepLink(clearSearch)

  const haystacks = useMemo(
    () =>
      new Map(
        sections.flatMap((section) =>
          section.entries.map((entry) => [entry.id, faqHaystack(entry.question, entry.text)]),
        ),
      ),
    [sections],
  )
  const tokens = searchTokens(query)
  const searching = tokens.length > 0
  const shown = (id: number) => !searching || matchesSearch(haystacks.get(id)!, tokens)
  const count = searching ? [...haystacks.keys()].filter(shown).length : 0

  return (
    <div className="flex flex-col gap-4">
      <div role="search" aria-label={'جستجو در پرسش\u{200C}ها'} className="flex flex-col gap-1.5">
        <label htmlFor={searchId} className="sr-only">
          {'جستجو در پرسش\u{200C}ها'}
        </label>
        <Input
          id={searchId}
          type="search"
          value={query}
          disabled={!hydrated}
          placeholder={'جستجو در پرسش\u{200C}ها، مثلاً «هزینهٔ ارسال»'}
          startAdornment={<Search aria-hidden />}
          autoComplete="off"
          enterKeyHint="search"
          onChange={(event) => setQuery(event.target.value)}
          className="bg-white"
        />
        <p role="status" aria-live="polite" className="min-h-6 text-sm leading-6 text-ink-600">
          {countMessage(searching, count)}
        </p>
      </div>

      {!searching && <FaqChips sections={sections} />}

      {sections.map((section) => {
        const hidden = !section.entries.some((entry) => shown(entry.id))
        const titleId = `${categoryAnchor(section.id)}-title`
        return (
          <section
            key={section.id}
            id={categoryAnchor(section.id)}
            aria-labelledby={titleId}
            hidden={hidden}
            className={cn('rounded-card bg-white px-4 shadow-card md:px-6', UNDER_STICKY)}
          >
            <h2 id={titleId} className="pt-5 pb-1 text-lg leading-8 font-bold text-ink-900">
              {section.name}
            </h2>
            <div>
              {section.entries.map((entry) => (
                <FaqQuestion key={entry.id} entry={entry} hidden={!shown(entry.id)} />
              ))}
            </div>
          </section>
        )
      })}

      {searching && count === 0 && (
        <div className="rounded-card border border-dashed border-ink-300 bg-white p-6 text-center">
          <p className="text-base leading-8 text-ink-800">{`برای «${query.trim()}» پرسشی پیدا نشد.`}</p>
          <Link
            href="/contact-us/"
            className="mt-2 inline-flex min-h-11 items-center rounded-control font-medium text-brand-700 underline decoration-1 underline-offset-4 hover:decoration-2"
          >
            پرسش خود را برای ما بفرستید
          </Link>
        </div>
      )}
    </div>
  )
}
