'use client'

import { useState, type ReactNode } from 'react'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'
import { Switch } from '@/components/ui/switch'
import { FLAG_FILTERS, FLAG_LABELS, type FacetGroups } from '@/features/catalog/listing-filters'
import type { ListingApiQuery } from '@/features/catalog/listing-params'
import { FacetList } from './facet-list'
import { PriceRange } from './price-range'
import { useListingUrl } from './use-listing-url'

function Group({ value, title, children }: { value: string; title: string; children: ReactNode }) {
  return (
    <AccordionItem value={value}>
      <AccordionTrigger>{title}</AccordionTrigger>
      <AccordionContent>{children}</AccordionContent>
    </AccordionItem>
  )
}

/** Sorted, so the same choice always gives the same URL (and the same cache entry). */
const byCodePoint = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0)

/**
 * Every filter of a listing, reading and writing the URL: the three switches, then collapsible
 * groups for category, brand, price and each attribute. Every group is open unless the visitor
 * closed it, so a group that a navigation adds (a category's attributes) shows open too. Each group is
 * labelled for assistive tech (a fieldset legend or a named radio group). Used in the desktop
 * sidebar and in the phone's filter sheet.
 */
export function FilterPanel({ groups }: { groups: FacetGroups }) {
  const { query, set } = useListingUrl()
  const chosenIds = query.attribute_values ?? []
  // The groups the visitor closed; any other group is open, including one added later.
  const [closed, setClosed] = useState<ReadonlySet<string>>(() => new Set())

  const sections: { value: string; title: string; body: ReactNode }[] = []
  if (groups.categories.length > 0) {
    sections.push({
      value: 'category',
      title: 'دسته‌بندی',
      body: (
        <FacetList
          facet={{ kind: 'category', options: groups.categories }}
          legend="دسته‌بندی"
          selected={query.category ? [query.category] : []}
          onChange={([category]) =>
            // Attribute values and price bounds belong to the category they were chosen in; the
            // new one's bounds are unknown until its filters load, so both start over.
            set({
              category,
              attribute_values: undefined,
              min_price: undefined,
              max_price: undefined,
            })
          }
        />
      ),
    })
  }
  if (groups.brands.length > 0) {
    sections.push({
      value: 'brand',
      title: 'برند',
      body: (
        <FacetList
          facet={{ kind: 'brand', options: groups.brands }}
          legend="برند"
          selected={query.brand ?? []}
          onChange={(brand) => set({ brand: [...brand].sort(byCodePoint) })}
        />
      ),
    })
  }
  if (groups.price) {
    sections.push({
      value: 'price',
      title: 'محدوده قیمت',
      body: (
        <fieldset>
          <legend className="sr-only">محدوده قیمت</legend>
          <PriceRange
            bounds={groups.price}
            value={{ min: query.min_price, max: query.max_price }}
            onCommit={({ min, max }) => set({ min_price: min, max_price: max })}
          />
        </fieldset>
      ),
    })
  }
  for (const attribute of groups.attributes) {
    const own = new Set(attribute.values.map((value) => value.id))
    sections.push({
      value: `attribute-${attribute.id}`,
      title: attribute.name,
      body: (
        <FacetList
          facet={{ kind: 'attribute', attribute }}
          legend={attribute.name}
          selected={chosenIds.filter((id) => own.has(id)).map(String)}
          onChange={(next) =>
            set({
              attribute_values: [
                ...chosenIds.filter((id) => !own.has(id)),
                ...next.map(Number),
              ].sort((a, b) => a - b),
            })
          }
        />
      ),
    })
  }

  return (
    <div>
      <fieldset className="border-b border-ink-200 pb-2">
        <legend className="sr-only">وضعیت کالا</legend>
        {FLAG_FILTERS.map((flag) => (
          <Switch
            key={flag}
            label={FLAG_LABELS[flag].true}
            checked={query[flag] === true}
            onCheckedChange={(on) => {
              const patch: Partial<ListingApiQuery> = {}
              patch[flag] = on ? true : undefined
              set(patch)
            }}
          />
        ))}
      </fieldset>
      {sections.length > 0 && (
        <Accordion
          type="multiple"
          value={sections.map((section) => section.value).filter((value) => !closed.has(value))}
          onValueChange={(open) => {
            const shown = new Set(open)
            setClosed((current) => {
              const next = new Set(current)
              for (const section of sections) {
                if (shown.has(section.value)) next.delete(section.value)
                else next.add(section.value)
              }
              return next
            })
          }}
        >
          {sections.map((section) => (
            <Group key={section.value} value={section.value} title={section.title}>
              {section.body}
            </Group>
          ))}
        </Accordion>
      )}
    </div>
  )
}
