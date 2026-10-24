import type { ReactNode } from 'react'
import {
  FLAG_FILTERS,
  FLAG_LABELS,
  SEARCHABLE_OVER,
  type FacetGroups,
} from '@/features/catalog/listing-filters'

// The desktop sidebar's outline of the filter panel (FilterPanel), shown until the viewport is
// known (the server, hydration) and below lg, where the aside is hidden anyway. Static HTML from
// a Server Component, so the listing ships no code for it and a phone hydrates a few plain rows,
// not the panel's few hundred controls. Every block has the real control's height (a 44 px
// option row, the 56 px group title, the brand search, the price block, the swatch pills by
// name), so the panel that replaces it on a desktop moves nothing below the aside. Change a
// control's height and this outline with it: `tests/e2e/catalog/sidebar-stability.spec.ts`
// compares the two in a browser.

/** Rows enough to fill the brand list's scroll box (max-h-72: 288 px, 44 px a row). */
const BRAND_BOX_ROWS = 7

function Rows({ count }: { count: number }) {
  return Array.from({ length: count }, (_, index) => (
    <div key={index} data-row="" className="flex h-11 items-center gap-3">
      <span className="size-6 shrink-0 rounded-check border-2 border-ink-200" />
      <span className="h-3 w-24 rounded-full bg-ink-100" />
    </div>
  ))
}

function BrandBody({ count }: { count: number }) {
  if (count <= SEARCHABLE_OVER) return <Rows count={count} />
  return (
    <>
      <div data-search="" className="mb-1 h-12 rounded-control border border-ink-200" />
      <div data-scroll="" className="-mx-1 max-h-72 overflow-hidden px-1">
        <Rows count={BRAND_BOX_ROWS} />
      </div>
    </>
  )
}

/** PriceRange in the sidebar: the slider, the two fields one per row, the unit line. */
function PriceBody() {
  return (
    <div data-price="">
      <div className="mx-3 flex h-11 items-center">
        <span className="h-1.5 grow rounded-full bg-ink-200" />
      </div>
      <div className="mt-2 grid gap-3">
        {['حداقل قیمت', 'حداکثر قیمت'].map((label) => (
          <div key={label} className="flex flex-col gap-1">
            <span className="text-sm text-ink-700">{label}</span>
            <span className="h-12 rounded-control border border-ink-200" />
          </div>
        ))}
      </div>
      <p className="mt-1.5 text-sm text-ink-600">قیمت‌ها به تومان</p>
    </div>
  )
}

function Pills({ names }: { names: string[] }) {
  return (
    <div className="flex flex-wrap gap-2 py-1">
      {names.map((name, index) => (
        <span
          key={index}
          data-pill=""
          className="inline-flex h-10 max-w-full items-center gap-2 rounded-pill border border-ink-200 ps-1 pe-3.5 text-sm font-medium text-ink-700"
        >
          <span className="size-8 shrink-0 rounded-full bg-ink-100" />
          <span dir="auto" className="truncate">
            {name}
          </span>
        </span>
      ))}
    </div>
  )
}

function sections(groups: FacetGroups) {
  const list: { value: string; title: string; body: ReactNode }[] = []
  if (groups.categories.length > 0) {
    // «همهٔ دسته‌ها» and every category with products (FacetList hides the empty ones).
    const shown = groups.categories.filter((option) => option.product_count > 0).length
    list.push({ value: 'category', title: 'دسته‌بندی', body: <Rows count={1 + shown} /> })
  }
  if (groups.brands.length > 0) {
    list.push({ value: 'brand', title: 'برند', body: <BrandBody count={groups.brands.length} /> })
  }
  if (groups.price) list.push({ value: 'price', title: 'محدوده قیمت', body: <PriceBody /> })
  for (const attribute of groups.attributes) {
    const swatches = attribute.input_type === 'color' || attribute.input_type === 'pattern'
    list.push({
      value: `attribute-${attribute.id}`,
      title: attribute.name,
      body: swatches ? (
        <Pills names={attribute.values.map((value) => value.name)} />
      ) : (
        <Rows count={attribute.values.length} />
      ),
    })
  }
  return list
}

/** FilterPanel's outline: its switches, then each open group's title and rows. */
export function FilterPanelSkeleton({ groups }: { groups: FacetGroups }) {
  return (
    <div data-filter-skeleton="" aria-hidden="true">
      <div className="border-b border-ink-200 pb-2">
        {FLAG_FILTERS.map((flag) => (
          <div
            key={flag}
            data-switch=""
            className="flex min-h-11 items-center justify-between gap-4 py-2"
          >
            <span className="text-base text-ink-800">{FLAG_LABELS[flag].true}</span>
            <span className="h-7 w-12 shrink-0 rounded-full border-2 border-ink-200" />
          </div>
        ))}
      </div>
      {sections(groups).map((section) => (
        <div key={section.value} className="border-b border-ink-200 last:border-b-0">
          <p
            data-skeleton-group=""
            className="flex min-h-14 items-center py-3 text-base font-medium text-ink-900"
          >
            {section.title}
          </p>
          <div data-skeleton-body={section.value} className="pb-4">
            {section.body}
          </div>
        </div>
      ))}
    </div>
  )
}
