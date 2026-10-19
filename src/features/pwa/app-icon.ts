import 'server-only'
import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import type SharpModule from 'sharp'
import { apiFileUrl, readApiImage } from '@/features/settings/api-image'

// The installed app's icons (`/icons/<size>/`, src/app/icons/[size]/route.ts; the manifest names
// them): square PNGs made with sharp from the settings' favicon when it is large enough, else the
// logo, each read from the API host alone (api-image.ts: /media/ or /static/, no redirect, 3 s,
// 2 MB, a raster image), contained in the central 56 % on white, which a maskable icon's safe
// circle (80 %) holds whole. Without either, a monogram: the shop's first letter, white on the
// brand colour, drawn with the bundled Vazirmatn (no system font is needed: the Docker image has
// none), or a shopping bag when the font cannot draw it. Each result is kept in memory a day per
// source (five minutes when a source configured could not be read).

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
  /** Made from the favicon or the logo (false: the monogram). */
  fromSource: boolean
}

const LIMITS = { maxBytes: 2 * 1024 * 1024, timeoutMs: 3_000 }
/** A favicon smaller than this would be a blur at 512 px: the logo is used instead. */
const MIN_FAVICON_PX = 128
/** The art's box, a share of the icon's side. */
const ART = 0.56
/** No decoding of a picture larger than this (a decompression bomb). */
const MAX_PIXELS = 25_000_000
/** Traced into the standalone output for this route (next.config.ts). */
const FONT_FILE = path.join(process.cwd(), 'src/assets/fonts/vazirmatn/Vazirmatn-wght.woff2')
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

const escapeMarkup = (text: string) =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/** The shop's first letter, white, about half the icon's side; null when it cannot be drawn. */
async function letter(name: string, size: IconSize): Promise<Buffer | null> {
  const sharp = await loadSharp()
  const first = Array.from(name.trim())[0]
  if (!first || !existsSync(FONT_FILE)) return null
  try {
    const glyph = await sharp({
      text: {
        text: `<span foreground="#ffffff">${escapeMarkup(first.toLocaleUpperCase('en'))}</span>`,
        font: 'Vazirmatn',
        fontfile: FONT_FILE,
        width: Math.round(size * 0.5),
        height: Math.round(size * 0.5),
        rgba: true,
      },
    })
      .png()
      .toBuffer()
    // A font that drew nothing (no glyph for it): no letter.
    const { channels } = await sharp(glyph).stats()
    if ((channels[3]?.max ?? 0) === 0) return null
    // To the glyph's own ink, so the centring is the letter's, not its line box's.
    return await sharp(glyph).trim().png().toBuffer()
  } catch {
    return null
  }
}

/** Lucide's shopping bag (ISC), white on the brand colour: needs no font. */
function bag(color: string, size: IconSize): Buffer {
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24">` +
      `<rect width="24" height="24" fill="${color}"/>` +
      '<g transform="translate(6.6 6.6) scale(0.45)" fill="none" stroke="#ffffff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
      '<path d="M16 10a4 4 0 0 1-8 0"/><path d="M3.103 6.034h17.794"/>' +
      '<path d="M3.4 5.467a2 2 0 0 0-.4 1.2V20a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6.667a2 2 0 0 0-.4-1.2l-2-2.667A2 2 0 0 0 17 2H7a2 2 0 0 0-1.6.8z"/>' +
      '</g></svg>',
  )
}

async function monogram(input: AppIconInput): Promise<Buffer> {
  const sharp = await loadSharp()
  const color = HEX.test(input.primary) ? input.primary : FALLBACK_COLOR
  const glyph = await letter(input.name, input.size)
  if (!glyph) return sharp(bag(color, input.size)).png().toBuffer()
  return sharp({
    create: { width: input.size, height: input.size, channels: 4, background: color },
  })
    .composite([{ input: glyph, gravity: 'center' }])
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

/** The icon of `input.size`; never throws for a source that cannot be read. */
export async function appIcon(input: AppIconInput): Promise<AppIcon> {
  const key = JSON.stringify([input.size, input.favicon, input.logo, input.name, input.primary])
  const copy = kept.get(key)
  if (copy && copy.until > Date.now()) return copy.icon
  const icon = await makeIcon(input)
  const unread = !icon.fromSource && Boolean(input.favicon || input.logo)
  kept.delete(key)
  kept.set(key, { icon, until: Date.now() + (unread ? RETRY_MS : DAY_MS) })
  while (kept.size > MAX_ENTRIES) kept.delete(kept.keys().next().value!)
  return icon
}
