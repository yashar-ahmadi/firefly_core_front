import type { ProductSpecification } from '@/lib/api/types/catalog'

export interface SpecRow {
  id: number
  name: string
  text: string
}

/**
 * A spec row's text (product digest §5.7): the values joined with «، », else the free text;
 * '' when it has neither. Blank values are left out.
 */
export function specText(row: Pick<ProductSpecification, 'values' | 'custom_attribute_value'>) {
  const values = row.values.map((value) => value.trim()).filter(Boolean)
  return values.length > 0 ? values.join('، ') : (row.custom_attribute_value ?? '').trim()
}

/** The rows worth showing, in the payload's order (already by display priority). */
export function specRows(specifications: readonly ProductSpecification[]): SpecRow[] {
  return specifications
    .map((row) => ({ id: row.id, name: row.attribute_name.trim(), text: specText(row) }))
    .filter((row) => row.text !== '')
}

/**
 * The full specification table as a description list: the name, then the value, one row each.
 * The payload has no groups, so there are no group headings. Nothing when every row is empty.
 */
export function SpecificationsTable({
  specifications,
}: {
  specifications: readonly ProductSpecification[]
}) {
  const rows = specRows(specifications)
  if (rows.length === 0) return null
  return (
    <dl className="divide-y divide-ink-100">
      {rows.map((row) => (
        <div
          key={row.id}
          className="grid grid-cols-[minmax(6rem,38%)_minmax(0,1fr)] gap-x-4 py-3 first:pt-0 last:pb-0 md:grid-cols-[14rem_minmax(0,1fr)]"
        >
          <dt className="text-base text-ink-600">{row.name}</dt>
          <dd className="text-base font-medium break-words text-ink-900">{row.text}</dd>
        </div>
      ))}
    </dl>
  )
}
