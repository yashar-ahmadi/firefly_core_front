import { toLatinDigits } from '@/lib/format/digits'

// The account lists' `page` URL parameter (the wishlist, my comments). Pure.

/** A page the API may have: 1 to 999,999 (no list here comes near). */
const PAGE = /^[1-9]\d{0,5}$/

/**
 * A page number from the URL: a whole number from 1 (Persian or Arabic digits too), else page 1.
 * The API answers 404 for 0, a negative or a non-numeric page (digest §0.2), so none is sent.
 */
export function parsePage(value: string | null): number {
  const digits = toLatinDigits(value ?? '').trim()
  return PAGE.test(digits) ? Number(digits) : 1
}

/** The URL's `page`, left out for page 1. */
export function pageEntry(page: number): [string, string][] {
  return page > 1 ? [['page', String(page)]] : []
}

/** `?a=b&c=d` from ordered entries, or '' for none. */
export function toSearch(entries: [string, string][]): string {
  return entries.length > 0 ? `?${new URLSearchParams(entries).toString()}` : ''
}
