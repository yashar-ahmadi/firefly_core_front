import 'server-only'
import { apiFileUrl, readApiImage, type ApiImage } from './api-image'

// The shop's favicon for `/favicon.ico` (src/app/favicon.ico/route.ts): browsers ask for it on
// their own when a page's icon fails to load, and a 404 there is noise in every console.
//
// Read from the API host by `readApiImage` (api-image.ts: its /media/ or /static/ path only, no
// redirect, 3 s, 100 KB, a raster image). What was read is kept here, in memory, a day per URL, a
// few URLs at most (the cap × `MAX_ENTRIES` bounds it); a failure for five minutes. A new favicon
// is a new file, so a new URL: read at once.

export type Icon = ApiImage

/** A favicon changes rarely (a new one comes with a new URL): kept, and cached by browsers, a day. */
export const FAVICON_REVALIDATE_SECONDS = 86_400
/** How long a favicon that could not be read waits before it is asked for again. */
const FAILURE_SECONDS = 300
const LIMITS = { maxBytes: 100 * 1024, timeoutMs: 3_000 }
/** The favicons kept at once (the settings name one; old ones linger until pushed out). */
const MAX_ENTRIES = 4

/**
 * 32×32 PNG: a slate rounded square with a white shopping bag, no brand colour (any shop). Served
 * when the configured favicon is missing or cannot be read.
 */
const DEFAULT_PNG =
  'iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAbklEQVR42u3Xyw3AIAwD0GzXCToE+w9Ab70AkepAPqot5cTB74hFlFx36ztOvmRXKYQ5Xa4ivMqnCO/yAfFvQFT5iygJWMUFMCu0IMRabkVAAPQdBqAhgAACCCCgBoB/whSA8GGSYpqlGKcR8/wByjLtWTUAWOwAAAAASUVORK5CYII='

export function defaultFavicon(): Icon {
  return { bytes: new Uint8Array(Buffer.from(DEFAULT_PNG, 'base64')), type: 'image/png' }
}

/** What was read per URL, until when (epoch ms). Oldest first (a Map keeps insertion order). */
const kept = new Map<string, { icon: Icon | null; until: number }>()

/**
 * The configured favicon (`settings.favicon`), or null when there is none, or it does not answer
 * 2xx within 3 s, is not a raster image, or is over 100 KB. Never throws.
 */
export async function loadFavicon(
  favicon: string | null | undefined,
  apiUrl: string,
): Promise<Icon | null> {
  const url = favicon ? apiFileUrl(favicon, apiUrl) : null
  if (url === null) return null
  const copy = kept.get(url)
  if (copy && copy.until > Date.now()) return copy.icon
  const icon = await readApiImage(url, LIMITS)
  const seconds = icon ? FAVICON_REVALIDATE_SECONDS : FAILURE_SECONDS
  kept.delete(url)
  kept.set(url, { icon, until: Date.now() + seconds * 1000 })
  while (kept.size > MAX_ENTRIES) kept.delete(kept.keys().next().value!)
  return icon
}
