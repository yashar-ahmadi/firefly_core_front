'use client'

import { Search } from 'lucide-react'
import { useState } from 'react'
import { Checkbox } from '@/components/ui/checkbox'
import { cn } from '@/components/ui/cn'
import { Input } from '@/components/ui/input'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { VisuallyHidden } from '@/components/ui/visually-hidden'
import type {
  FilterAttribute,
  FilterBrandOption,
  FilterCategoryOption,
} from '@/lib/api/types/catalog'
import { formatNumber } from '@/lib/format'
import { foldForSearch } from '@/lib/text/fold'
import { Swatch } from './swatch'

export type Facet =
  | { kind: 'category'; options: FilterCategoryOption[] }
  | { kind: 'brand'; options: FilterBrandOption[] }
  | { kind: 'attribute'; attribute: FilterAttribute }

export interface FacetListProps {
  facet: Facet
  /** Names the group for assistive tech (the panel shows it as the group's heading). */
  legend: string
  /** Chosen keys: category or brand slugs, attribute value ids as strings. */
  selected: readonly string[]
  /** The whole new selection. A category is a single choice: `[slug]`, or `[]` for all. */
  onChange: (next: string[]) => void
}

/** More brands than this get a search box. */
const SEARCHABLE_OVER = 8
/** The value of «all categories»; a slug is never empty. */
const ALL = ''

function toggle(selected: readonly string[], key: string): string[] {
  return selected.includes(key) ? selected.filter((other) => other !== key) : [...selected, key]
}

/**
 * The options of one facet group. Categories are radios (the API takes one) without the
 * empty ones; brands and plain attribute values are checkboxes, brands with a Persian-aware
 * search over eight; colour and pattern values are swatches named by the value.
 */
export function FacetList(props: FacetListProps) {
  const { facet } = props
  if (facet.kind === 'category') return <CategoryOptions {...props} options={facet.options} />
  if (facet.kind === 'brand') return <BrandOptions {...props} options={facet.options} />
  return <AttributeOptions {...props} attribute={facet.attribute} />
}

function CategoryOptions({
  options,
  legend,
  selected,
  onChange,
}: FacetListProps & { options: FilterCategoryOption[] }) {
  return (
    <RadioGroup
      aria-label={legend}
      value={selected[0] ?? ALL}
      onValueChange={(value) => onChange(value === ALL ? [] : [value])}
      className="gap-0"
    >
      <RadioGroupItem value={ALL} label="همهٔ دسته‌ها" />
      {options
        .filter((option) => option.product_count > 0)
        .map((option) => {
          const count = formatNumber(option.product_count)
          return (
            <RadioGroupItem
              key={option.slug}
              value={option.slug}
              label={
                <>
                  <span dir="auto">{option.name}</span>
                  <VisuallyHidden>{`، ${count} کالا`}</VisuallyHidden>
                </>
              }
              aside={
                <span aria-hidden className="text-sm text-ink-600">
                  {count}
                </span>
              }
            />
          )
        })}
    </RadioGroup>
  )
}

function BrandOptions({
  options,
  legend,
  selected,
  onChange,
}: FacetListProps & { options: FilterBrandOption[] }) {
  const [term, setTerm] = useState('')
  const searchable = options.length > SEARCHABLE_OVER
  const needle = foldForSearch(term)
  const matches = (option: FilterBrandOption) =>
    foldForSearch(option.name).includes(needle) || foldForSearch(option.slug).includes(needle)
  // Chosen brands stay in view while searching, so they can be unticked.
  const shown = options.filter((option) => selected.includes(option.slug) || matches(option))
  const noMatch = needle !== '' && !options.some(matches)

  return (
    <fieldset>
      <legend className="sr-only">{legend}</legend>
      {searchable && (
        <Input
          type="search"
          aria-label="جستجوی برند"
          placeholder="جستجوی برند"
          value={term}
          onChange={(event) => setTerm(event.target.value)}
          startAdornment={<Search aria-hidden />}
          className="mb-1"
        />
      )}
      <div
        className={cn(
          searchable &&
            '-mx-1 max-h-72 [scrollbar-width:thin] overflow-y-auto overscroll-contain px-1',
        )}
      >
        {shown.map((option) => (
          <Checkbox
            key={option.slug}
            label={<span dir="auto">{option.name}</span>}
            checked={selected.includes(option.slug)}
            onCheckedChange={() => onChange(toggle(selected, option.slug))}
          />
        ))}
        {noMatch && <p className="py-2 text-base text-ink-600">برندی با این نام پیدا نشد</p>}
      </div>
    </fieldset>
  )
}

function AttributeOptions({
  attribute,
  legend,
  selected,
  onChange,
}: FacetListProps & { attribute: FilterAttribute }) {
  const swatches = attribute.input_type === 'color' || attribute.input_type === 'pattern'
  return (
    <fieldset>
      <legend className="sr-only">{legend}</legend>
      {swatches ? (
        <div className="flex flex-wrap gap-2 py-1">
          {attribute.values.map((value) => (
            <Swatch
              key={value.id}
              value={value}
              selected={selected.includes(String(value.id))}
              onToggle={() => onChange(toggle(selected, String(value.id)))}
            />
          ))}
        </div>
      ) : (
        attribute.values.map((value) => (
          <Checkbox
            key={value.id}
            label={<span dir="auto">{value.name}</span>}
            checked={selected.includes(String(value.id))}
            onCheckedChange={() => onChange(toggle(selected, String(value.id)))}
          />
        ))
      )}
    </fieldset>
  )
}
