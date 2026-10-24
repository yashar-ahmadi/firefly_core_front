import 'server-only'
import { createRequire } from 'node:module'
import type SharpModule from 'sharp'
import { fallbackIcon } from '@/features/pwa/fallback-icons'
import { monogramSvg } from '@/features/pwa/monogram'
import { apiFileUrl, readApiImage } from '@/features/settings/api-image'

// The installed app's icons (`/icons/<size>/`, src/app/icons/[size]/route.ts; the manifest names
// them): square PNGs made with sharp from the settings' favicon when it is large enough, else the
// logo, each read from the API host alone (api-image.ts: /media/ or /static/, no redirect, 3 s,
// 2 MB, a raster image), contained in the central 56 % on white, which a maskable icon's safe
// circle (80 %) holds whole. Without either, a monogram: the shop's first letter, white on the
// brand colour, an outline of the bundled Vazirmatn drawn as a path (monogram.ts: no font is
// needed, and the Docker image has none), or a shopping bag for a letter it lacks. When sharp
// cannot load or fails, the bundled brand-neutral PNGs (fallback-icons.ts): the icons never fail.
// Each result is kept in memory a day per source (five minutes when a source configured could not
// be read, or for the bundled icon).

export type IconSize = 192 | 512

export function parseIconSize(value: string): IconSize | null {
  return value === '192' ? 192 : value === '512' ? 512 : null
}

export interface AppIconInput {
  size: IconSize
  name: string
  favicon: string | null | undefined
  logo: string | null | undefined
  /** The brand colour (`#rrggbb`). */
  primary: string
  apiUrl: string
}

export interface AppIcon {
  bytes: Buffer
  /** Made from the favicon or the logo (false: the monogram, or the bundled icon). */
  fromSource: boolean
  /** The bundled brand-neutral icon: sharp could not load or failed (fallback-icons.ts). */
  fallback?: boolean
}

const LIMITS = { maxBytes: 2 * 1024 * 1024, timeoutMs: 3_000 }
/** A favicon smaller than this would be a blur at 512 px: the logo is used instead. */
const MIN_FAVICON_PX = 128
/** The art's box, a share of the icon's side. */
const ART = 0.56
/** No decoding of a picture larger than this (a decompression bomb). */
const MAX_PIXELS = 25_000_000
const HEX = /^#[0-9a-f]{6}$/i
const FALLBACK_COLOR = '#4F46E5'

interface Source {
  bytes: Uint8Array
  width: number
  height: number
}

type Sharp = typeof SharpModule

/**
 * sharp through CommonJS, on purpose: imported as ESM (`import`, static or `import()`) it is an
 * ESM server external, which Turbopack loads as an async module, and an async module anywhere
 * in the app puts Turbopack's async-module runtime into the browser runtime every page loads
 * (+0.45 KB gzip on every route, measured on the build). Required, it is a plain CJS external.
 */
const requireModule = createRequire(import.meta.url)
let loaded: Sharp | null = null
const loadSharp = async (): Promise<Sharp> => (loaded ??= requireModule('sharp') as Sharp)

async function readSource(url: string | null | undefined, apiUrl: string): Promise<Source | null> {
  const sharp = await loadSharp()
  const at = url ? apiFileUrl(url, apiUrl) : null
  const file = at ? await readApiImage(at, LIMITS) : null
  if (!file) return null
  try {
    const { width, height } = await sharp(file.bytes, { limitInputPixels: MAX_PIXELS }).metadata()
    return width && height ? { bytes: file.bytes, width, height } : null
  } catch {
    return null
  }
}

async function onWhite(source: Source, size: IconSize): Promise<Buffer> {
  const sharp = await loadSharp()
  const box = Math.round(size * ART)
  const art = await sharp(source.bytes, { limitInputPixels: MAX_PIXELS })
    .resize(box, box, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 0 } })
    .png()
    .toBuffer()
  return sharp({ create: { width: size, height: size, channels: 4, background: '#ffffff' } })
    .composite([{ input: art, gravity: 'center' }])
    .png()
    .toBuffer()
}

async function monogram(input: AppIconInput): Promise<Buffer> {
  const sharp = await loadSharp()
  const color = HEX.test(input.primary) ? input.primary : FALLBACK_COLOR
  return sharp(Buffer.from(monogramSvg(input.name, color, input.size)))
    .png()
    .toBuffer()
}

async function makeIcon(input: AppIconInput): Promise<AppIcon> {
  const favicon = await readSource(input.favicon, input.apiUrl)
  if (favicon && Math.min(favicon.width, favicon.height) >= MIN_FAVICON_PX) {
    return { bytes: await onWhite(favicon, input.size), fromSource: true }
  }
  const logo = input.logo ? await readSource(input.logo, input.apiUrl) : null
  if (logo) return { bytes: await onWhite(logo, input.size), fromSource: true }
  return { bytes: await monogram(input), fromSource: false }
}

const DAY_MS = 86_400_000
const RETRY_MS = 300_000
const MAX_ENTRIES = 8
/** Each icon made, by what it is made from, until when (epoch ms); oldest first. */
const kept = new Map<string, { icon: AppIcon; until: number }>()

/** The bundled icon, said once per try in a fixed sentence (sharp's message may name paths). */
function bundled(size: IconSize, error: unknown): AppIcon {
  const name = error instanceof Error && /^[A-Za-z]{1,40}$/.test(error.name) ? error.name : 'Error'
  console.error('[icons] sharp could not make the icon; serving the bundled one:', name)
  return { bytes: fallbackIcon(size), fromSource: false, fallback: true }
}

/** The icon of `input.size`; never throws (a source that cannot be read, sharp missing or broken). */
export async function appIcon(input: AppIconInput): Promise<AppIcon> {
  const key = JSON.stringify([input.size, input.favicon, input.logo, input.name, input.primary])
  const copy = kept.get(key)
  if (copy && copy.until > Date.now()) return copy.icon
  const icon = await makeIcon(input).catch((error: unknown) => bundled(input.size, error))
  const unread =
    icon.fallback === true || (!icon.fromSource && Boolean(input.favicon || input.logo))
  kept.delete(key)
  kept.set(key, { icon, until: Date.now() + (unread ? RETRY_MS : DAY_MS) })
  while (kept.size > MAX_ENTRIES) kept.delete(kept.keys().next().value!)
  return icon
}
