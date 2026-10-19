// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
import { readBuildVersion } from '@/features/pwa/build-version'

vi.mock('server-only', () => ({}))

// The service worker's version (its caches' names) is the running build's id: `.next/BUILD_ID`,
// beside the server in the standalone output as in `next start`. Without one (development, a
// test), or with anything unexpected in it, a fixed name.

describe('readBuildVersion', () => {
  it('the build id, trimmed', () => {
    expect(readBuildVersion(() => 'cTSqDBAWStz-fLiD_aQT5\n')).toBe('cTSqDBAWStz-fLiD_aQT5')
  })

  it.each([
    [
      'no file',
      () => {
        throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' })
      },
    ],
    ['an empty file', () => ''],
    ['something that is no id', () => '../../etc"; alert(1)'],
    ['an id too long', () => 'x'.repeat(65)],
  ])('%s: "development"', (_, read) => {
    expect(readBuildVersion(read)).toBe('development')
  })
})
