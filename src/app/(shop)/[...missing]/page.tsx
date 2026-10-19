import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { notFoundMetadata } from '@/features/seo/not-found-metadata'

/**
 * The 404's title. A page that throws `notFound()` keeps its own `generateMetadata` here, not the
 * not-found file's: without this an unknown URL would be titled like the home page. It reads
 * what the root layout has read already (the settings, the translations: `cache()`).
 */
export function generateMetadata(): Promise<Metadata> {
  return notFoundMetadata()
}

/**
 * Every URL no other route takes (Next ranks a catch-all below every static and dynamic route):
 * the shop's 404 (`(shop)/not-found.tsx`: search and the main categories) inside the shop
 * layout, with a real 404 status (no loading boundary above it, R9; Next adds noindex). It reads
 * nothing and renders nothing itself. The proxy has already run for the URL by then (operator
 * redirects, legacy page extensions: src/proxy.ts). The root not-found.tsx stays light: why, in
 * its own comment.
 */
export default function MissingPage(): never {
  notFound()
}
