import type { Metadata } from 'next'
import { pageMetadata } from '@/features/seo/page-metadata'
import type { FaqSection } from './faq-sections'

// The help centre's <head> and structured data (blog-faq digest §2.2, seo digest §7.2). Pure.

export const FAQ_PATH = '/faq/'
export const FAQ_TITLE = 'پرسش\u{200C}های متداول'
/** A description search engines show in full (about 160 characters). */
const DESCRIPTION_LENGTH = 160

export interface FaqPageJsonLd {
  '@context': 'https://schema.org'
  '@type': 'FAQPage'
  mainEntity: Array<{
    '@type': 'Question'
    name: string
    acceptedAnswer: { '@type': 'Answer'; text: string }
  }>
}

/**
 * FAQPage (the API's own is not exposed, so it is built here): every question shown, in order,
 * each answer as the plain text of its sanitised HTML (never the operator's raw markup). null
 * with no question to list. Written escaped by `JsonLd`.
 */
export function faqPageJsonLd(sections: readonly FaqSection[]): FaqPageJsonLd | null {
  const entries = sections.flatMap((section) => section.entries).filter((entry) => entry.text)
  if (entries.length === 0) return null
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: entries.map((entry) => ({
      '@type': 'Question',
      name: entry.question,
      acceptedAnswer: { '@type': 'Answer', text: entry.text },
    })),
  }
}

/** The description: the frequent questions about <categories> in <shop>, as many as fit. */
function description(sections: readonly FaqSection[], shop: string): string {
  const names: string[] = []
  for (const { name } of sections) {
    const next = [...names, name.trim()].join('، ')
    if (names.length > 0 && next.length > DESCRIPTION_LENGTH - 40) break
    names.push(name.trim())
  }
  return names.length > 0
    ? `پاسخ پرسش\u{200C}های پرتکرار دربارهٔ ${names.join('، ')} در ${shop}.`
    : `پاسخ پرسش\u{200C}های پرتکرار مشتریان ${shop}.`
}

/** An absolute title, the categories as the description, the self canonical; indexable. */
export function faqMetadata(sections: readonly FaqSection[], shop: string): Metadata {
  return pageMetadata({
    title: `${FAQ_TITLE} | ${shop}`,
    description: description(sections, shop),
    canonical: FAQ_PATH,
    siteName: shop,
    card: 'summary',
  })
}
