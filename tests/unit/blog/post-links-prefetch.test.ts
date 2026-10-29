// @vitest-environment node
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'

// Ruling P5-R1, as a lint over the source: a post's page counts a view on every render (blog
// digest §1.5: `GET blog/post/<slug>/` increments `view_count`, with no dedupe), so no link to a
// post may be prefetched. Every `<Link>` whose `href` builds a post's URL (`blogPostPath(…)`,
// `subjectHref(…)`, a template `/blog/${…}/`, or a name bound to one) says `prefetch={false}`,
// every link item object holding one says `prefetch: false`, and nothing calls `router.prefetch`
// with one. Operator URLs (menus, banners) are checked at run time instead (MenuLink, StoreLink:
// `isBlogPostPath`). And the post's route
// keeps what makes a default prefetch harmless anyway: no loading boundary at or above it, and
// neither Cache Components nor partial prefetching (docs/ARCHITECTURE.md, «Blog post views»).

const ROOT = process.cwd()
const SRC = join(ROOT, 'src')

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return sourceFiles(path)
    return /\.tsx?$/.test(entry.name) ? [path] : []
  })
}

/**
 * Calls that can return a post's URL: `blogPostPath(slug)`, and `subjectHref(comment, …)` (my
 * comments' subjects: a product, a post or a page).
 */
const POST_HREF_BUILDERS = new Set(['blogPostPath', 'subjectHref'])

/**
 * Whether `node` builds a post's URL: a builder's call, a template `/blog/${…}`, or a name the
 * file binds to one (`const href = subjectHref(comment, blog)`: names in `bound`).
 */
function isPostHref(node: ts.Node | undefined, bound: ReadonlySet<string> = new Set()): boolean {
  if (node === undefined) return false
  if (ts.isParenthesizedExpression(node)) return isPostHref(node.expression, bound)
  if (ts.isConditionalExpression(node))
    return isPostHref(node.whenTrue, bound) || isPostHref(node.whenFalse, bound)
  if (ts.isIdentifier(node)) return bound.has(node.text)
  if (ts.isCallExpression(node)) {
    return ts.isIdentifier(node.expression) && POST_HREF_BUILDERS.has(node.expression.text)
  }
  return ts.isTemplateExpression(node) && node.head.text === '/blog/'
}

/** The names `source` binds to a post's URL (`const href = subjectHref(…)`). */
function postHrefNames(source: ts.SourceFile): Set<string> {
  const names = new Set<string>()
  const visit = (node: ts.Node) => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)) {
      if (isPostHref(node.initializer)) names.add(node.name.text)
    }
    ts.forEachChild(node, visit)
  }
  visit(source)
  return names
}

const isFalse = (node: ts.Node | undefined) => node?.kind === ts.SyntaxKind.FalseKeyword

function jsxAttribute(element: ts.JsxOpeningLikeElement, name: string) {
  return element.attributes.properties.find(
    (attribute): attribute is ts.JsxAttribute =>
      ts.isJsxAttribute(attribute) && attribute.name.getText() === name,
  )
}

function attributeValue(attribute: ts.JsxAttribute | undefined): ts.Node | undefined {
  const initializer = attribute?.initializer
  return initializer && ts.isJsxExpression(initializer) ? initializer.expression : initializer
}

function propertyValue(object: ts.ObjectLiteralExpression, name: string): ts.Node | undefined {
  const property = object.properties.find(
    (item): item is ts.PropertyAssignment =>
      ts.isPropertyAssignment(item) && item.name.getText() === name,
  )
  return property?.initializer
}

interface Finding {
  where: string
  ok: boolean
}

/** Every post link in `file`, and whether it is kept from prefetching. */
function postLinks(file: string): Finding[] {
  const text = readFileSync(file, 'utf8')
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  const findings: Finding[] = []
  const bound = postHrefNames(source)
  const isPostLink = (node: ts.Node | undefined) => isPostHref(node, bound)
  const where = (node: ts.Node) => {
    const { line } = source.getLineAndCharacterOfPosition(node.getStart())
    return `${relative(ROOT, file)}:${line + 1}`
  }
  const visit = (node: ts.Node) => {
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      if (
        node.tagName.getText() === 'Link' &&
        isPostLink(attributeValue(jsxAttribute(node, 'href')))
      ) {
        findings.push({
          where: where(node),
          ok: isFalse(attributeValue(jsxAttribute(node, 'prefetch'))),
        })
      }
    } else if (ts.isObjectLiteralExpression(node) && isPostLink(propertyValue(node, 'href'))) {
      findings.push({ where: where(node), ok: isFalse(propertyValue(node, 'prefetch')) })
    } else if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      node.expression.name.text === 'prefetch' &&
      node.arguments.some((argument) => isPostLink(argument))
    ) {
      findings.push({ where: where(node), ok: false })
    }
    ts.forEachChild(node, visit)
  }
  visit(source)
  return findings
}

const findings = sourceFiles(SRC).flatMap(postLinks)

describe('P5-R1: links to a post are never prefetched', () => {
  it('finds the post links it guards (cards, sidebar, search rows, the home’s post styles, my comments)', () => {
    const files = new Set(findings.map((finding) => finding.where.replace(/:\d+$/, '')))
    for (const file of [
      'src/features/blog/components/post-card.tsx',
      'src/features/blog/components/blog-sidebar.tsx',
      'src/features/search/results/search-results.tsx',
      // The home's post carousel in its four styles (tiles, the featured post, the list rows).
      'src/features/display/post-styles.tsx',
      // `<Link href={href}>` with `const href = subjectHref(comment, blog)`: a post's, at times.
      'src/features/account/comments/comment-row.tsx',
    ]) {
      expect(files, file).toContain(file)
    }
  })

  it('every one says prefetch={false} (or `prefetch: false` on a link item)', () => {
    expect(findings.filter((finding) => !finding.ok).map((finding) => finding.where)).toEqual([])
  })
})

describe('the post route keeps a default prefetch from rendering it', () => {
  it('has no loading boundary at or above /blog/[slug]', () => {
    const segments = [
      'src/app',
      'src/app/(shop)',
      'src/app/(shop)/blog',
      'src/app/(shop)/blog/[slug]',
    ]
    for (const segment of segments) {
      for (const name of ['loading.tsx', 'loading.ts', 'loading.jsx', 'loading.js']) {
        expect(existsSync(join(ROOT, segment, name)), `${segment}/${name}`).toBe(false)
      }
    }
  })

  it('turns on neither Cache Components nor partial prefetching', () => {
    const config = readFileSync(join(ROOT, 'next.config.ts'), 'utf8')
    for (const flag of ['cacheComponents', 'partialPrefetching', 'ppr', 'dynamicIO']) {
      expect(config, flag).not.toMatch(new RegExp(`\\b${flag}\\b`))
    }
  })
})
