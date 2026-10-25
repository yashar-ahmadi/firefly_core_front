// @vitest-environment node
import { describe, expect, it } from 'vitest'

// The app icons' monogram is the server's alone (`/icons/<size>/`): its glyph table is about 37 KB
// of outlines. Each module imports `server-only`, so a Client Component that imports either one
// fails the build (and, outside a server bundle, the import itself, as here).

const CLIENT_IMPORT = /cannot be imported from a Client Component/

describe('the monogram is server-only', () => {
  it('the glyph table', async () => {
    await expect(import('@/features/pwa/monogram-glyphs')).rejects.toThrow(CLIENT_IMPORT)
  })

  it('the renderer', async () => {
    await expect(import('@/features/pwa/monogram')).rejects.toThrow(CLIENT_IMPORT)
  })
})
