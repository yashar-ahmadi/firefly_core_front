// The production image's build context: the files `docker build .` sends, as `.dockerignore`
// decides, so a check can type-check exactly what the image's `next build` sees
// (scripts/check-build-context.mjs, run by `pnpm typecheck`).
//
// Docker's rules (moby/patternmatcher, the docs' «.dockerignore file»): a pattern is matched
// against the path from the context's root and against each of its parent folders (`tests`
// leaves out everything under `tests/`, `*.md` only the root's Markdown files); `*` and `?` never
// cross a `/`, `**` crosses any number of folders; a `!` pattern brings a path back; the last
// pattern that matches decides.

import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'

const escapeRegex = (text) => text.replace(/[.+^${}()|\\]/g, '\\$&')

/** One pattern as an anchored regular expression over a `/`-separated relative path. */
function patternRegex(pattern) {
  let source = ''
  for (let i = 0; i < pattern.length; i++) {
    const char = pattern[i]
    if (char === '*' && pattern[i + 1] === '*') {
      i++
      if (pattern[i + 1] === '/') {
        i++
        source += '(?:.*/)?'
      } else {
        source += '.*'
      }
    } else if (char === '*') {
      source += '[^/]*'
    } else if (char === '?') {
      source += '[^/]'
    } else if (char === '[') {
      const end = pattern.indexOf(']', i + 1)
      if (end === -1) {
        source += '\\['
      } else {
        source += pattern.slice(i, end + 1).replace(/^\[!/, '[^')
        i = end
      }
    } else {
      source += escapeRegex(char)
    }
  }
  return new RegExp(`^${source}$`)
}

/** `.dockerignore`'s text as rules, in order: `{ pattern, negate, regex }`. */
export function parseIgnore(text) {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== '' && !line.startsWith('#'))
    .map((line) => {
      const negate = line.startsWith('!')
      const pattern = path.posix
        .normalize(negate ? line.slice(1).trim() : line)
        .replace(/^\/+/, '')
        .replace(/\/+$/, '')
      return { pattern, negate, regex: patternRegex(pattern) }
    })
}

/** The path and each of its parent folders: `a`, `a/b`, `a/b/c.ts`. */
function selfAndParents(relPath) {
  const parts = relPath.split('/')
  return parts.map((_, index) => parts.slice(0, index + 1).join('/'))
}

/** Whether `.dockerignore`'s rules leave `relPath` (relative, `/`-separated) out of the context. */
export function isIgnored(rules, relPath) {
  const candidates = selfAndParents(relPath)
  let ignored = false
  for (const rule of rules) {
    if (candidates.some((candidate) => rule.regex.test(candidate))) ignored = !rule.negate
  }
  return ignored
}

/** Whether no `!` rule can bring back anything under the ignored folder `relDir`. */
function prunable(rules, relDir) {
  return rules.every(
    (rule) =>
      !rule.negate || !(rule.pattern.startsWith(`${relDir}/`) || rule.pattern.startsWith('**')),
  )
}

/** The files the build context holds under `root` (relative, `/`-separated, sorted). */
export function contextFiles(root) {
  const rules = parseIgnore(readFileSync(path.join(root, '.dockerignore'), 'utf8'))
  const files = []
  const walk = (relDir) => {
    for (const entry of readdirSync(path.join(root, relDir), { withFileTypes: true })) {
      const rel = relDir === '' ? entry.name : `${relDir}/${entry.name}`
      if (entry.isDirectory()) {
        if (!isIgnored(rules, rel) || !prunable(rules, rel)) walk(rel)
      } else if (!isIgnored(rules, rel)) {
        files.push(rel)
      }
    }
  }
  walk('')
  return files.sort()
}
