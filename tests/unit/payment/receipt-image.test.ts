import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { probeImage, sniffFormat } from '@/features/payment/card-transfer/receipt-image'

// The receipt picture looked at before it is sent: its bytes (a GIF renamed .jpg is not taken),
// then its decoded size; a picture the browser cannot read is said as such.

const PNG = new Uint8Array(readFileSync(join(process.cwd(), 'tests/fixtures/receipt.png')))
const GIF = new TextEncoder().encode('GIF89a\u{0001}\u{0000}\u{0001}\u{0000}')
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46, 0, 1])
const WEBP = new TextEncoder().encode('RIFF\u{0000}\u{0000}\u{0000}\u{0000}WEBPVP8 ')

describe('sniffFormat', () => {
  it('knows a JPEG, a PNG and a WEBP by their first bytes, and nothing else', () => {
    expect(sniffFormat(JPEG)).toBe('jpeg')
    expect(sniffFormat(PNG.slice(0, 12))).toBe('png')
    expect(sniffFormat(WEBP)).toBe('webp')
    expect(sniffFormat(GIF)).toBeNull()
    expect(sniffFormat(new TextEncoder().encode('not an image'))).toBeNull()
    expect(sniffFormat(new Uint8Array())).toBeNull()
  })
})

describe('probeImage', () => {
  const realImage = globalThis.Image
  afterEach(() => {
    globalThis.Image = realImage
  })

  /** An `<img>` that loads with the given size, or fails. */
  function fakeImage(size: { width: number; height: number } | 'error') {
    globalThis.Image = class {
      naturalWidth = 0
      naturalHeight = 0
      onload: (() => void) | null = null
      onerror: (() => void) | null = null
      set src(_: string) {
        queueMicrotask(() => {
          if (size === 'error') return this.onerror?.()
          this.naturalWidth = size.width
          this.naturalHeight = size.height
          this.onload?.()
        })
      }
    } as unknown as typeof Image
  }

  it('a PNG: its decoded size', async () => {
    fakeImage({ width: 480, height: 640 })
    await expect(probeImage(new Blob([PNG]), 'blob:x')).resolves.toEqual({
      ok: true,
      width: 480,
      height: 640,
    })
  })

  it('a GIF calling itself a JPEG: not a format we take, never decoded', async () => {
    const decode = vi.fn()
    const spy = vi.spyOn(globalThis, 'Image').mockImplementation(decode)
    await expect(probeImage(new Blob([GIF], { type: 'image/jpeg' }), 'blob:x')).resolves.toEqual({
      ok: false,
      reason: 'format',
    })
    expect(decode).not.toHaveBeenCalled()
    spy.mockRestore()
  })

  it('a PNG the browser cannot decode: unreadable', async () => {
    fakeImage('error')
    await expect(probeImage(new Blob([PNG.slice(0, 40)]), 'blob:x')).resolves.toEqual({
      ok: false,
      reason: 'decode',
    })
  })
})
