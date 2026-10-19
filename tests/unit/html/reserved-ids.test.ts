// @vitest-environment node
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  COMMENTS_HEADING_ID,
  COMMENTS_ID,
  MAIN_ID,
  POST_ARTICLE_ID,
  POST_PRODUCTS_ID,
  POST_TITLE_ID,
  RELATED_POSTS_ID,
  RESERVED_IDS,
} from '@/lib/html/reserved-ids'

// The ids the storefront's own markup uses on a page that shows operator content with heading ids
// (a post): a content heading never takes one (the sanitiser drops it), so `#comments`, the skip
// link and every `aria-labelledby` keep finding ours. One list, and nothing of ours outside it.

const ROOT = process.cwd()

function files(dir: string): string[] {
  return readdirSync(join(ROOT, dir), { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return files(path)
    return /\.tsx?$/.test(entry.name) ? [path] : []
  })
}

/** Literal ids in a file: `id="x"`, `headingId={'x'}`, and `const SOMETHING_ID = 'x'`. */
function literalIds(file: string): string[] {
  const text = readFileSync(join(ROOT, file), 'utf8')
  const found = [
    ...text.matchAll(/\b(?:id|[a-z]+Id)=(?:"([^"]+)"|\{'([^']+)'\})/g),
    ...text.matchAll(/\b[A-Z_]*ID = '([^']+)'/g),
  ]
  return found.map((match) => match[1] ?? match[2]!)
}

describe('RESERVED_IDS', () => {
  it('holds the post page’s own ids: its article and title, the comments and their heading, its sections', () => {
    for (const id of [
      MAIN_ID,
      COMMENTS_ID,
      COMMENTS_HEADING_ID,
      POST_ARTICLE_ID,
      POST_TITLE_ID,
      RELATED_POSTS_ID,
      POST_PRODUCTS_ID,
    ]) {
      expect(RESERVED_IDS, id).toContain(id)
    }
  })

  it('holds every id the shell writes (src/components/layout, the theme’s head)', () => {
    const shell = [...files('src/components/layout'), 'src/app/_shell/theme-head.tsx']
    const missing = shell.flatMap((file) =>
      literalIds(file)
        .filter((id) => !RESERVED_IDS.has(id))
        .map((id) => `${relative(ROOT, join(ROOT, file))}: ${id}`),
    )
    expect(missing).toEqual([])
  })

  it('the post page’s parts take their ids from it: none written there literally', () => {
    const post = [
      ...files('src/features/blog/components'),
      ...files('src/features/comments'),
      'src/app/(shop)/blog/[slug]/page.tsx',
    ]
    // `blog-…` ids belong to the blog's home and archive (its sidebar, its featured and products
    // sections), never rendered on a post's page.
    const literal = post.flatMap((file) =>
      literalIds(file)
        .filter((id) => !id.startsWith('blog-'))
        .map((id) => `${file}: ${id}`),
    )
    expect(literal).toEqual([])
  })
})
