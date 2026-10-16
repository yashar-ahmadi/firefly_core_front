import type { SearchSuggestion, SearchSuggestions } from '@/lib/api/types/search'
import { isSearchable, normalizeQuery } from './query'

// What the search box offers, as one ordered list: the arrow keys walk it from top to bottom.
// Pure.

export type SuggestGroupKey = 'products' | 'product_categories' | 'brands'

export type SuggestOption =
  /** «جستجوی «…» در همهٔ محصولات»: the results page for the term. */
  | { kind: 'search'; key: string; term: string }
  | { kind: 'suggestion'; key: string; group: SuggestGroupKey; item: SearchSuggestion }
  /** A recent search, offered while the field is empty. */
  | { kind: 'recent'; key: string; term: string }

export const SUGGEST_GROUPS: readonly { key: SuggestGroupKey; label: string }[] = [
  { key: 'products', label: 'محصولات' },
  { key: 'product_categories', label: 'دسته\u{200C}بندی\u{200C}ها' },
  { key: 'brands', label: 'برندها' },
]

/** The typed value as shown and searched: spaces collapsed and trimmed. */
export function typedTerm(value: string): string {
  return value.replace(/\s+/gu, ' ').trim()
}

/**
 * - An empty field: the recent searches.
 * - Under two characters (once normalised): nothing.
 * - Otherwise «search everywhere» first, then the products, categories and brands suggested.
 */
export function suggestOptions(
  value: string,
  data: SearchSuggestions | null,
  recent: readonly string[],
): SuggestOption[] {
  const term = typedTerm(value)
  const normalized = normalizeQuery(term)
  if (normalized === '') {
    return recent.map((item) => ({ kind: 'recent', key: `recent:${item}`, term: item }))
  }
  if (!isSearchable(normalized)) return []
  const options: SuggestOption[] = [{ kind: 'search', key: 'search', term }]
  for (const group of SUGGEST_GROUPS) {
    for (const item of data?.[group.key] ?? []) {
      options.push({ kind: 'suggestion', key: `${group.key}:${item.id}`, group: group.key, item })
    }
  }
  return options
}
