// @vitest-environment node
import { readFileSync } from 'node:fs'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { contextFiles, isIgnored, parseIgnore } from '../../../scripts/build-context.mjs'

// The production image builds from what `.dockerignore` lets through, and its `next build`
// type-checks the project next.config.ts names. CI run 88 (e93c381) was red because a file that
// check covered (vitest.setup.ts) imported one the image never gets (tests/). The build checks the
// app alone (tsconfig.build.json), the test-only root files stay out of the image, and
// `pnpm typecheck` type-checks that project on the context alone (scripts/check-build-context.mjs).

const ignored = (text: string, path: string) => isIgnored(parseIgnore(text), path)

describe('.dockerignore, as Docker reads it', () => {
  it('leaves out a folder and everything under it, from the context’s root only', () => {
    expect(ignored('tests', 'tests')).toBe(true)
    expect(ignored('tests', 'tests/unit/support/network-guard.ts')).toBe(true)
    expect(ignored('tests', 'src/tests/x.ts')).toBe(false)
    expect(ignored('/tests/', 'tests/e2e/a.spec.ts')).toBe(true)
  })

  it('never lets `*` or `?` cross a folder; `**` crosses any number', () => {
    expect(ignored('*.md', 'README.md')).toBe(true)
    expect(ignored('*.md', 'src/features/README.md')).toBe(false)
    expect(ignored('**/*.md', 'src/features/README.md')).toBe(true)
    expect(ignored('**/*.md', 'README.md')).toBe(true)
    expect(ignored('vitest.?etup.ts', 'vitest.setup.ts')).toBe(true)
    expect(ignored('src/*.ts', 'src/app/page.ts')).toBe(false)
    expect(ignored('[ab].ts', 'b.ts')).toBe(true)
    expect(ignored('[!ab].ts', 'b.ts')).toBe(false)
  })

  it('brings a path back with `!`; the last matching line decides; comments are skipped', () => {
    const text = '# secrets\n\n.env\n.env.*\n!.env.example\n'
    expect(ignored(text, '.env')).toBe(true)
    expect(ignored(text, '.env.local')).toBe(true)
    expect(ignored(text, '.env.example')).toBe(false)
    expect(ignored(`${text}.env.example\n`, '.env.example')).toBe(true)
    expect(ignored(text, '# secrets')).toBe(false)
  })
})

describe('the image’s build context', () => {
  const files = contextFiles('.')

  it('holds the app: its sources, config, lockfile and public files', () => {
    expect(files).toEqual(
      expect.arrayContaining([
        'src/proxy.ts',
        'src/app/layout.tsx',
        'next.config.ts',
        'tsconfig.json',
        'tsconfig.build.json',
        'package.json',
        'pnpm-lock.yaml',
        'postcss.config.mjs',
        'public/images/placeholder.svg',
        '.env.example',
      ]),
    )
  })

  it('leaves out the tests, the test runners’ config, docs, scripts and the repository', () => {
    const outside = files.filter((file) =>
      /^(?:tests|docs|scripts|deploy|node_modules|\.next|\.git|\.github|\.superpowers)\//.test(
        file,
      ),
    )
    expect(outside).toEqual([])
    for (const file of ['vitest.config.ts', 'vitest.setup.ts', 'playwright.config.ts', 'README.md'])
      expect(files, file).not.toContain(file)
  })
})

describe('what the production build type-checks', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('is tsconfig.build.json (next.config.ts `typescript.tsconfigPath`)', async () => {
    vi.stubEnv('FIREFLY_API_URL', 'https://api.shop.ir')
    vi.resetModules()
    const nextConfig = (await import('../../../next.config')).default
    expect(nextConfig.typescript?.tsconfigPath).toBe('tsconfig.build.json')
  })

  it('names the app alone: the sources, next.config.ts and the types Next generates', () => {
    const config = JSON.parse(readFileSync('tsconfig.build.json', 'utf8'))
    expect(config.extends).toBe('./tsconfig.json')
    for (const entry of config.include as string[])
      expect(entry, entry).toMatch(/^(?:src\/|\.next\/|next\.config\.ts$|next-env\.d\.ts$)/)
  })

  it('is type-checked on the context alone by `pnpm typecheck`', () => {
    const { scripts } = JSON.parse(readFileSync('package.json', 'utf8'))
    expect(scripts.typecheck).toBe('tsc --noEmit && node scripts/check-build-context.mjs')
  })
})
