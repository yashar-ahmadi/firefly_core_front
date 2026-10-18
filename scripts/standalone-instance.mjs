// One production server's own copy of the build (scripts/start-standalone.mjs): the standalone
// server (`.next/standalone`) with `.next/static` and `public` copied beside it, as the Docker
// image holds them, in a folder of its port's alone, made complete BEFORE that server starts.
//
// Why a copy per server: Next's standalone server lists `.next/static` once, when it starts, and
// answers 404 for any chunk that was not there then. The e2e run starts two servers from the same
// build (playwright.config.ts: the main one and the push shop's), and a start used to rewrite the
// one shared `.next/standalone/.next/static`: a server listing it mid-copy 404'd chunks for good,
// and a server already running lost its files for the copy's length. A rebuild (`next build`
// empties `.next`) did the same to a server left running. The copies live outside `.next`, under
// `node_modules/.cache` (ignored by git, the linters and the test runner).

import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs'
import path from 'node:path'

/** The folder the server on `port` runs from. */
export function instanceDir(root, port) {
  return path.join(root, 'node_modules', '.cache', 'standalone-servers', String(port))
}

/**
 * A fresh copy of the build for the server on `port` (nothing of an earlier copy lingers);
 * returns its `server.js`, or null when there is no build (`next build` first).
 */
export function prepareInstance({ root, port }) {
  const build = path.join(root, '.next', 'standalone')
  if (!existsSync(path.join(build, 'server.js'))) return null
  const dir = instanceDir(root, port)
  rmSync(dir, { recursive: true, force: true })
  mkdirSync(path.dirname(dir), { recursive: true })
  // pnpm's links inside the build are relative: kept as they are, they point inside the copy.
  cpSync(build, dir, { recursive: true, verbatimSymlinks: true })
  for (const [from, to] of [
    [path.join(root, '.next', 'static'), path.join(dir, '.next', 'static')],
    [path.join(root, 'public'), path.join(dir, 'public')],
  ]) {
    rmSync(to, { recursive: true, force: true })
    if (existsSync(from)) cpSync(from, to, { recursive: true, verbatimSymlinks: true })
  }
  return path.join(dir, 'server.js')
}
