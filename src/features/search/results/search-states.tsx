import { Lightbulb, RotateCw, Search, SearchX, Timer } from 'lucide-react'
import Link from 'next/link'
import { HeaderSearchForm } from '@/components/layout/header-search-form'
import { buttonClasses } from '@/components/ui/button-styles'
import { EmptyState } from '@/components/ui/empty-state'
import { categoryPath } from '@/features/catalog/listing-routes'
import type { CategoryNode } from '@/lib/api/types/settings'
import { searchHref } from '../query'

// The results page when it has no results to list: no term yet, nothing found, a term the API
// refused, or too many searches. Server Components.

const TIPS = [
  'املای واژه\u{200C}ها را بررسی کنید.',
  'واژه\u{200C}های کمتر یا کلی\u{200C}تری بنویسید؛ مثلاً «گوشی» به جای «گوشی سامسونگ مشکی».',
  'نام برند یا مدل را هم به فارسی و هم به انگلیسی امتحان کنید.',
  'عبارت جستجو باید دست\u{200C}کم دو حرف باشد.',
]
const CATEGORY_LIMIT = 8
const PANEL = 'rounded-card bg-white px-4 py-6 shadow-card md:px-8'

/** The search field under a message, as wide as a field reads well. */
function SearchAgain() {
  return (
    <div className="mx-auto w-full max-w-lg">
      <HeaderSearchForm />
    </div>
  )
}

/** A few hints for a better search. */
export function SearchTips() {
  return (
    <section aria-labelledby="search-tips" className="mx-auto mt-8 w-full max-w-2xl">
      <h2 id="search-tips" className="flex items-center gap-2 text-base font-bold text-ink-800">
        <Lightbulb aria-hidden className="size-5 text-brand-600" />
        راهنمای جستجو
      </h2>
      <ul
        aria-labelledby="search-tips"
        className="mt-3 list-disc space-y-1.5 ps-6 text-base leading-7 text-ink-700 marker:text-brand-500"
      >
        {TIPS.map((tip) => (
          <li key={tip}>{tip}</li>
        ))}
      </ul>
    </section>
  )
}

/** `/search/` without a term (the API is never called): the field, then the tips. */
export function SearchStart() {
  return (
    <div className={PANEL}>
      <EmptyState
        icon={<Search />}
        title={'چه چیزی را جستجو می\u{200C}کنید؟'}
        description={'نام کالا، برند یا دسته\u{200C}بندی را بنویسید.'}
        className="py-4"
      />
      <SearchAgain />
      <SearchTips />
    </div>
  )
}

/** Nothing found: the tips and the main categories as a way on. */
export function NoResults({ query, categories }: { query: string; categories: CategoryNode[] }) {
  const main = categories.slice(0, CATEGORY_LIMIT)
  return (
    <div className={PANEL}>
      <EmptyState
        icon={<SearchX />}
        title={
          <>
            {'نتیجه\u{200C}ای برای «'}
            <bdi>{query}</bdi>
            {'» پیدا نشد'}
          </>
        }
        description={'عبارت دیگری را امتحان کنید یا از دسته\u{200C}بندی\u{200C}ها شروع کنید.'}
        className="py-4"
      />
      <SearchTips />
      {main.length > 0 && (
        <section aria-labelledby="search-categories" className="mx-auto mt-8 w-full max-w-2xl">
          <h2 id="search-categories" className="text-base font-bold text-ink-800">
            {'دسته\u{200C}بندی\u{200C}های اصلی'}
          </h2>
          <ul aria-labelledby="search-categories" className="mt-3 flex flex-wrap gap-2">
            {main.map((category) => (
              <li key={category.id}>
                <Link
                  href={categoryPath(category.path)}
                  prefetch={false}
                  className="inline-flex min-h-11 items-center rounded-pill border border-ink-300 bg-white px-4 text-sm font-medium text-ink-800 transition-colors hover:border-brand-300 hover:text-brand-800"
                >
                  {category.name}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}

/** A term the API refused (400): its own reason, and the field to try another. */
export function SearchRefused({ detail }: { detail: string }) {
  return (
    <div className={PANEL}>
      <EmptyState
        icon={<SearchX />}
        title={'این عبارت را نمی\u{200C}توان جستجو کرد'}
        description={detail}
        className="py-4"
      />
      <SearchAgain />
    </div>
  )
}

/** Too many searches (429): try again shortly. */
export function SearchThrottled({ q }: { q: string }) {
  return (
    <div className={PANEL}>
      <EmptyState
        icon={<Timer />}
        title="لطفاً کمی بعد دوباره تلاش کنید"
        description={'در چند لحظه\u{0654} گذشته جستجوهای زیادی انجام شده است.'}
        action={
          // A full load: trying again is the shopper's own choice, never a prefetch.
          <a href={searchHref(q)} className={buttonClasses({ variant: 'outline' })}>
            <RotateCw aria-hidden />
            تلاش دوباره
          </a>
        }
        className="py-4"
      />
    </div>
  )
}
