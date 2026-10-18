// @vitest-environment node
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readlinkSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { instanceDir, prepareInstance } from '../../../scripts/standalone-instance.mjs'

// The production servers the e2e run starts (scripts/start-standalone.mjs): each one runs from
// its own copy of the build (the standalone server with `.next/static` and `public` beside it),
// made complete before that server starts, so starting, restarting or rebuilding one never
// touches the files another is serving (the `budget-push` server once 404'd chunks because the
// main server's start rewrote the one shared `.next/standalone/.next/static` under it).

let root: string

function write(file: string, text: string) {
  mkdirSync(path.dirname(path.join(root, file)), { recursive: true })
  writeFileSync(path.join(root, file), text)
}

/** A build as `next build` leaves it: the standalone server without static or public. */
function build(id: string) {
  rmSync(path.join(root, '.next'), { recursive: true, force: true })
  write('.next/standalone/server.js', `// server ${id}`)
  write('.next/standalone/.next/BUILD_ID', id)
  write('.next/standalone/node_modules/.pnpm/react@19/node_modules/react/index.js', 'react')
  symlinkSync(
    '.pnpm/react@19/node_modules/react',
    path.join(root, '.next/standalone/node_modules/react'),
  )
  write(`.next/static/${id}/_buildManifest.js`, `manifest ${id}`)
  write(`.next/static/chunks/${id}.js`, `chunk ${id}`)
}

beforeEach(() => {
  root = mkdtempSync(path.join(tmpdir(), 'standalone-instance-'))
  write('public/icon.txt', 'icon')
  build('build-a')
})

afterEach(() => rmSync(root, { recursive: true, force: true }))

const read = (dir: string, file: string) => readFileSync(path.join(dir, file), 'utf8')

describe('prepareInstance', () => {
  it('copies the build, its static files and public into the port’s own folder', () => {
    const server = prepareInstance({ root, port: '3000' })
    const dir = instanceDir(root, '3000')
    expect(server).toBe(path.join(dir, 'server.js'))
    expect(read(dir, 'server.js')).toBe('// server build-a')
    expect(read(dir, '.next/static/chunks/build-a.js')).toBe('chunk build-a')
    expect(read(dir, '.next/static/build-a/_buildManifest.js')).toBe('manifest build-a')
    expect(read(dir, 'public/icon.txt')).toBe('icon')
    // pnpm's relative links stay relative, inside the copy.
    expect(readlinkSync(path.join(dir, 'node_modules/react'))).toBe(
      '.pnpm/react@19/node_modules/react',
    )
    expect(read(dir, 'node_modules/react/index.js')).toBe('react')
  })

  it('never serves from the build folder itself, nor from another port’s', () => {
    prepareInstance({ root, port: '3000' })
    prepareInstance({ root, port: '3001' })
    expect(instanceDir(root, '3000')).not.toBe(instanceDir(root, '3001'))
    expect(instanceDir(root, '3000').startsWith(path.join(root, '.next'))).toBe(false)
    expect(existsSync(path.join(root, '.next/standalone/.next/static'))).toBe(false)
  })

  it('starting another server, or rebuilding, leaves a running server’s files alone', () => {
    prepareInstance({ root, port: '3001' })
    build('build-b')
    prepareInstance({ root, port: '3000' })
    const running = instanceDir(root, '3001')
    expect(read(running, '.next/static/chunks/build-a.js')).toBe('chunk build-a')
    expect(read(running, 'server.js')).toBe('// server build-a')
    expect(read(instanceDir(root, '3000'), '.next/static/chunks/build-b.js')).toBe('chunk build-b')
  })

  it('a restart starts from a fresh copy: nothing of the build before lingers', () => {
    prepareInstance({ root, port: '3000' })
    build('build-b')
    prepareInstance({ root, port: '3000' })
    const dir = instanceDir(root, '3000')
    expect(existsSync(path.join(dir, '.next/static/chunks/build-a.js'))).toBe(false)
    expect(read(dir, '.next/static/chunks/build-b.js')).toBe('chunk build-b')
  })

  it('without a build, says so (null)', () => {
    rmSync(path.join(root, '.next'), { recursive: true, force: true })
    expect(prepareInstance({ root, port: '3000' })).toBeNull()
  })
})
