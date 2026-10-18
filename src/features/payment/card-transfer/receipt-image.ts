import type { ImageProbe } from './validate-receipt'

// The chosen receipt picture, looked at in the browser before it is sent (validate-receipt.ts):
// its first bytes say whether it really is a JPEG, PNG or WEBP (a GIF renamed `.jpg` is given the
// type of its name by the browser), then the browser decodes it for its dimensions, from the
// same object URL the preview shows. An `<img>`, not `createImageBitmap`: its natural size comes
// from the header, without holding every pixel of a large photograph in memory.

export type ImageFormat = 'jpeg' | 'png' | 'webp'

const startsWith = (bytes: Uint8Array, prefix: number[], at = 0) =>
  prefix.every((byte, index) => bytes[at + index] === byte)

/** The format the file's first 12 bytes announce, or null for anything else. */
export function sniffFormat(bytes: Uint8Array): ImageFormat | null {
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return 'jpeg'
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'png'
  // «RIFF», four bytes of length, «WEBP».
  if (startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) && startsWith(bytes, [0x57, 0x45, 0x42, 0x50], 8))
    return 'webp'
  return null
}

/** A picture the browser takes longer than this to read is treated as unreadable. */
const DECODE_TIMEOUT_MS = 15_000

function naturalSize(url: string): Promise<ImageProbe> {
  return new Promise((resolve) => {
    const image = new Image()
    const done = (probe: ImageProbe) => {
      clearTimeout(timer)
      image.onload = image.onerror = null
      resolve(probe)
    }
    const timer = setTimeout(() => done({ ok: false, reason: 'decode' }), DECODE_TIMEOUT_MS)
    image.onload = () =>
      image.naturalWidth > 0 && image.naturalHeight > 0
        ? done({ ok: true, width: image.naturalWidth, height: image.naturalHeight })
        : done({ ok: false, reason: 'decode' })
    image.onerror = () => done({ ok: false, reason: 'decode' })
    image.src = url
  })
}

/** What `file` is (its bytes) and, a picture we take, its dimensions; never rejects. */
export async function probeImage(file: Blob, url: string): Promise<ImageProbe> {
  try {
    const head = new Uint8Array(await file.slice(0, 12).arrayBuffer())
    if (!sniffFormat(head)) return { ok: false, reason: 'format' }
  } catch {
    return { ok: false, reason: 'decode' }
  }
  return naturalSize(url)
}
