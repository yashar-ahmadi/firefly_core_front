import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// Ruling R9: a loading.tsx at the shop group's root wraps every shop page in a Suspense
// boundary, so the response starts streaming (status 200) before a page can call notFound() or
// throw: missing products would answer "200 + noindex" and errors "200". Keep real 404/500s:
// pages await their primary entity first and use in-page <Suspense> only below it.

// Vitest runs from the repository root.
const SHOP = join(process.cwd(), 'src/app/(shop)/')

describe('(shop) route boundaries', () => {
  it('has no loading.tsx at the group root, so notFound() and errors keep their status', () => {
    expect(existsSync(`${SHOP}layout.tsx`)).toBe(true)
    for (const name of ['loading.tsx', 'loading.ts', 'loading.jsx', 'loading.js']) {
      expect(existsSync(`${SHOP}${name}`), name).toBe(false)
    }
  })

  it('keeps the shop chrome around notFound() and errors in shop pages', () => {
    expect(existsSync(`${SHOP}not-found.tsx`)).toBe(true)
    expect(existsSync(`${SHOP}error.tsx`)).toBe(true)
  })
})
