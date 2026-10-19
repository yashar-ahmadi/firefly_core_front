import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'

// A module's static import graph inside the repository, read from the source (no bundler): every
// project file reachable from `entry` through `import … from` / `export … from` / `import()`
// (`import type` and `export type` are skipped: they leave nothing in the bundle). `@/` is
// `src/`. Packages are listed by name and not followed. Used to prove a module stays clear of
// others (the light root 404 never reaches the shop shell), as the bundle would see it.

const ROOT = process.cwd()
const SRC = join(ROOT, 'src')
const EXTENSIONS = ['.ts', '.tsx', '/index.ts', '/index.tsx']
/** Each value import or re-export, and each dynamic import, with its specifier. */
const SPECIFIER =
  /(?:^|[\s;])(?:import|export)\s+(?!type\s)(?:[^'";]*?\sfrom\s+)?['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)/g

function resolveFile(specifier: string, from: string): string | null {
  const base = specifier.startsWith('@/')
    ? join(SRC, specifier.slice(2))
    : specifier.startsWith('.')
      ? resolve(dirname(from), specifier)
      : null
  if (base === null) return null
  for (const extension of EXTENSIONS) if (existsSync(base + extension)) return base + extension
  // A stylesheet, an SVG or a JSON file: part of the graph, with no imports of its own.
  if (existsSync(base)) return base
  throw new Error(`cannot resolve ${specifier} from ${relative(ROOT, from)}`)
}

export interface ImportGraph {
  /** Project files reachable from the entry, repository-relative (the entry included). */
  files: string[]
  /** The packages imported anywhere in the graph. */
  packages: string[]
  /** The project files that start with a 'use client' directive. */
  clientFiles: string[]
}

export function importGraph(entry: string): ImportGraph {
  const seen = new Set<string>()
  const packages = new Set<string>()
  const clientFiles: string[] = []
  const queue = [join(ROOT, entry)]
  while (queue.length > 0) {
    const file = queue.pop()!
    if (seen.has(file)) continue
    seen.add(file)
    if (!/\.(?:tsx?|mjs|js)$/.test(file)) continue
    const source = readFileSync(file, 'utf8')
    if (/^\s*(?:\/\/[^\n]*\n\s*|\/\*[\s\S]*?\*\/\s*)*['"]use client['"]/.test(source)) {
      clientFiles.push(relative(ROOT, file))
    }
    for (const match of source.matchAll(SPECIFIER)) {
      const specifier = match[1] ?? match[2]!
      const target = resolveFile(specifier, file)
      if (target === null) packages.add(specifier)
      else queue.push(target)
    }
  }
  return {
    files: [...seen].map((file) => relative(ROOT, file)).sort(),
    packages: [...packages].sort(),
    clientFiles: clientFiles.sort(),
  }
}
