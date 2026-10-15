// Colour maths for runtime theming: OKLCH shade scales and WCAG contrast.
// Pure functions only, so they run on the server (theme CSS) and in unit tests alike.

export type Shade = 50 | 100 | 200 | 300 | 400 | 500 | 600 | 700 | 800 | 900 | 950

export const SHADES: readonly Shade[] = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950]

/** Reference lightness curve (OKLab L) of a brand scale. */
const LIGHTNESS: Record<Shade, number> = {
  50: 0.975,
  100: 0.945,
  200: 0.89,
  300: 0.82,
  400: 0.73,
  500: 0.64,
  600: 0.56,
  700: 0.49,
  800: 0.41,
  900: 0.34,
  950: 0.26,
}

/** How much of the input chroma each shade keeps. */
const CHROMA: Record<Shade, number> = {
  50: 0.12,
  100: 0.25,
  200: 0.45,
  300: 0.7,
  400: 0.9,
  500: 1,
  600: 1,
  700: 0.92,
  800: 0.8,
  900: 0.66,
  950: 0.5,
}

/**
 * Shade 600 takes the input's own lightness, clamped to this range so that a very light or
 * very dark input still leaves room for ten strictly ordered neighbours.
 */
const MIN_ANCHOR_L = 0.3
const MAX_ANCHOR_L = 0.9
/** Smallest lightness drop between the anchor and shade 950. */
const MIN_DARK_SPAN = 0.08

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/

type Triple = readonly [number, number, number]

// ---------------------------------------------------------------------------------------------
// sRGB <-> linear <-> OKLab <-> OKLCH (Björn Ottosson's reference matrices)
// ---------------------------------------------------------------------------------------------

function parseHex(hex: string): Triple {
  if (!HEX_COLOR.test(hex)) throw new Error(`Expected a #RRGGBB colour, got "${hex}"`)
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255) as unknown as Triple
}

function toLinear(c: number): number {
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
}

function fromLinear(c: number): number {
  return c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055
}

function linearToOklab([r, g, b]: Triple): Triple {
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ]
}

function oklabToLinear([L, a, b]: Triple): Triple {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ]
}

function hexToOklch(hex: string): Triple {
  const [L, a, b] = linearToOklab(parseHex(hex).map(toLinear) as unknown as Triple)
  return [L, Math.hypot(a, b), Math.atan2(b, a)]
}

function linearInGamut(rgb: Triple): boolean {
  const eps = 1e-4
  return rgb.every((c) => c >= -eps && c <= 1 + eps)
}

function oklchToLinear(L: number, C: number, h: number): Triple {
  return oklabToLinear([L, C * Math.cos(h), C * Math.sin(h)])
}

/** Converts OKLCH to hex. Out-of-gamut colours lose chroma (never hue) until they fit sRGB. */
function oklchToHex(L: number, C: number, h: number): string {
  let rgb = oklchToLinear(L, C, h)
  if (!linearInGamut(rgb)) {
    let low = 0
    let high = C
    for (let i = 0; i < 24; i++) {
      const mid = (low + high) / 2
      if (linearInGamut(oklchToLinear(L, mid, h))) low = mid
      else high = mid
    }
    rgb = oklchToLinear(L, low, h)
  }
  const bytes = rgb.map((c) => {
    const encoded = fromLinear(Math.min(1, Math.max(0, c)))
    return Math.round(encoded * 255)
  })
  return `#${bytes.map((v) => v.toString(16).padStart(2, '0')).join('')}`
}

// ---------------------------------------------------------------------------------------------
// Scale generation
// ---------------------------------------------------------------------------------------------

/**
 * Builds the 50-950 scale of a brand colour in OKLCH.
 *
 * Shade 600 keeps the input's lightness; the reference lightness curve is shifted so that 600
 * lands on it. The light end stays anchored at 0.975 and the dark end is pulled down so shades
 * stay strictly ordered whatever the input. Hue is constant, chroma follows the table, and
 * anything outside sRGB is mapped back in by lowering chroma.
 */
export function generateScale(hex: string): Record<Shade, string> {
  const [inputL, inputC, hue] = hexToOklch(hex)
  const anchor = Math.min(MAX_ANCHOR_L, Math.max(MIN_ANCHOR_L, inputL))
  const darkEnd = Math.min(LIGHTNESS[950], anchor - MIN_DARK_SPAN)
  const lightEnd = LIGHTNESS[50]

  const lightnessOf = (shade: Shade): number => {
    const target = LIGHTNESS[shade]
    if (target >= LIGHTNESS[600]) {
      const t = (target - LIGHTNESS[600]) / (lightEnd - LIGHTNESS[600])
      return anchor + t * (lightEnd - anchor)
    }
    const t = (LIGHTNESS[600] - target) / (LIGHTNESS[600] - LIGHTNESS[950])
    return anchor - t * (anchor - darkEnd)
  }

  const scale = {} as Record<Shade, string>
  for (const shade of SHADES) {
    scale[shade] = oklchToHex(lightnessOf(shade), inputC * CHROMA[shade], hue)
  }
  return scale
}

// ---------------------------------------------------------------------------------------------
// WCAG 2.x contrast
// ---------------------------------------------------------------------------------------------

function relativeLuminance(hex: string): number {
  const [r, g, b] = parseHex(hex).map(toLinear) as unknown as Triple
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/** WCAG 2.x contrast ratio between two #RRGGBB colours, from 1 to 21. */
export function contrastRatio(a: string, b: string): number {
  const [light, dark] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x)
  return (light! + 0.05) / (dark! + 0.05)
}

const LIGHT_TEXT = '#FFFFFF'
const DARK_TEXT = '#111827'
const BLACK_TEXT = '#000000'
const AA_TEXT = 4.5

/**
 * A text colour that reads on the given background: white or near-black (whichever has the
 * higher contrast) when that reaches WCAG AA (4.5:1). Fills with relative luminance of about
 * 0.183 to 0.219 get neither, so those fall back to pure black (at least 4.66:1 there).
 */
export function readableTextOn(
  hex: string,
): typeof LIGHT_TEXT | typeof DARK_TEXT | typeof BLACK_TEXT {
  const onLight = contrastRatio(hex, LIGHT_TEXT)
  const onDark = contrastRatio(hex, DARK_TEXT)
  if (Math.max(onLight, onDark) < AA_TEXT) return BLACK_TEXT
  return onLight >= onDark ? LIGHT_TEXT : DARK_TEXT
}
