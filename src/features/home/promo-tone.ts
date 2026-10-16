import { AA_TEXT, contrastRatio } from '@/lib/theme/color'

// Slides and banners show the operator's title and description over their image, in the
// operator's `text_color` (content.md §6.3). A scrim under the text keeps it readable on any
// image: over a pure white and a pure black image alike the text reaches WCAG AA. Pure.

/** A translucent colour laid over the image under the text. */
export interface Scrim {
  rgb: readonly [number, number, number]
  alpha: number
}

export type ScrimTone = 'dark' | 'light'

/** ink-900 at 72% for light text; white at 88% for dark text. */
export const SCRIM: Record<ScrimTone, Scrim> = {
  dark: { rgb: [15, 23, 42], alpha: 0.72 },
  light: { rgb: [255, 255, 255], alpha: 0.88 },
}

/** The CSS colour of a scrim. */
export function scrimColor({ rgb, alpha }: Scrim): string {
  return `rgb(${rgb.join(' ')} / ${alpha})`
}

const DEFAULT_TEXT = '#FFFFFF'
const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i
const IMAGE_EXTREMES = ['#FFFFFF', '#000000'] as const

function channels(hex: string): number[] {
  const digits = hex.slice(1)
  const full = digits.length === 3 ? [...digits].map((d) => d + d).join('') : digits
  return [0, 2, 4].map((at) => Number.parseInt(full.slice(at, at + 2), 16))
}

function toHex(values: number[]): string {
  return `#${values.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`.toUpperCase()
}

/** The opaque colour seen where `scrim` lies over an image pixel of colour `image`. */
export function scrimOver(scrim: Scrim, image: string): string {
  const under = channels(image)
  return toHex(scrim.rgb.map((c, i) => c * scrim.alpha + (under[i] ?? 0) * (1 - scrim.alpha)))
}

/** Whether `text` reaches AA on `tone` whatever the image behind it. */
function readsOn(text: string, tone: ScrimTone): boolean {
  const full = toHex(channels(text))
  return IMAGE_EXTREMES.every(
    (image) => contrastRatio(full, scrimOver(SCRIM[tone], image)) >= AA_TEXT,
  )
}

export interface PromoTone {
  scrim: ScrimTone
  /** The text colour: the operator's when it reads on a scrim, else white. */
  color: string
}

/**
 * The scrim and text colour for an item's `text_color`. "" (the store default) is white on the
 * dark scrim. An operator colour is kept on whichever scrim makes it readable; one that no scrim
 * makes readable (a mid orange, say), or that is not a `#RGB`/`#RRGGBB` colour, is replaced by
 * white on the dark scrim, as badges do.
 */
export function promoTone(textColor: string): PromoTone {
  const color = textColor.trim()
  if (HEX.test(color)) {
    if (readsOn(color, 'dark')) return { scrim: 'dark', color }
    if (readsOn(color, 'light')) return { scrim: 'light', color }
  }
  return { scrim: 'dark', color: DEFAULT_TEXT }
}
