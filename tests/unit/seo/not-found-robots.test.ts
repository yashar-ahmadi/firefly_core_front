import type { Metadata } from 'next'
import { readdirSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { notFoundMetadata } from '@/features/seo/not-found-metadata'

// One robots tag on a 404 (Plan 5 Task 8, carried from Task 7). Next writes
// `<meta name="robots" content="noindex">` on every 404 itself (app-render's NonIndex, and the
// server-inserted tag for a notFound() thrown while streaming), and that cannot be turned off. A
// layout's own robots (the checkout's and the sign-in pages' `noindex, follow`, the account's
// `noindex, nofollow`) was a second tag on their 404s: a bad pay link, a malformed thanks code,
// an order that is not the account's. So every 404 head says `robots: null`, which Next's
// metadata merge takes as "none" over the layouts' (metadata-resolution-primitives.js), leaving
// Next's noindex the only one.

vi.mock('server-only', () => ({}))
vi.mock('@/features/settings/api', () => ({
  getSiteSettings: async () => ({ name: 'فایرفلای', phone: '+982191000000' }),
  getTranslations: async () => ({}),
}))

type HeadModule = { generateMetadata: () => Promise<Metadata> | Metadata }

/** Every not-found file of the app, and the shop's catch-all (unknown URLs). */
const HEADS: Record<string, () => Promise<HeadModule>> = {
  'not-found.tsx': () => import('@/app/not-found'),
  '(shop)/not-found.tsx': () => import('@/app/(shop)/not-found'),
  '(shop)/[...missing]/page.tsx': () => import('@/app/(shop)/[...missing]/page'),
  '(shop)/account/orders/[code]/not-found.tsx': () =>
    import('@/app/(shop)/account/orders/[code]/not-found'),
  '(checkout)/order/pay/[token]/not-found.tsx': () =>
    import('@/app/(checkout)/order/pay/[token]/not-found'),
  '(checkout)/payment/card-transfer/[uuid]/not-found.tsx': () =>
    import('@/app/(checkout)/payment/card-transfer/[uuid]/not-found'),
}

function notFoundFiles(dir = 'src/app'): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return notFoundFiles(path)
    return entry.name === 'not-found.tsx' ? [relative('src/app', path)] : []
  })
}

describe('a 404’s head: Next’s noindex is its only robots tag', () => {
  it('notFoundMetadata drops the layouts’ robots (an own key set to null)', async () => {
    const meta = await notFoundMetadata()
    expect(Object.hasOwn(meta, 'robots')).toBe(true)
    expect(meta.robots).toBeNull()
    expect(meta.title).toEqual({ absolute: 'صفحه پیدا نشد | فایرفلای' })
  })

  it('covers every not-found file of the app', () => {
    const listed = Object.keys(HEADS).filter((key) => key.endsWith('not-found.tsx'))
    expect(notFoundFiles().sort()).toEqual(listed.sort())
  })

  it.each(Object.entries(HEADS))('%s says robots: null', async (_, load) => {
    const meta = await (await load()).generateMetadata()
    expect(Object.hasOwn(meta, 'robots')).toBe(true)
    expect(meta.robots).toBeNull()
  })
})
