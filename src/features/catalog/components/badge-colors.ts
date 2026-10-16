import type { Badge } from '@/lib/api/types/catalog'
import { AA_TEXT, contrastRatio, readableTextOn } from '@/lib/theme/color'

// The operator picks a badge's fill and text colours; the text must still meet WCAG AA.

/** ink-800: the pill's fill when the operator's colour cannot be read. */
const FALLBACK_BACKGROUND = '#1E293B'

/** `#RGB`, `#RGBA`, `#RRGGBB` or `#RRGGBBAA`. */
const HEX = /^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i

/**
 * The opaque `#RRGGBB` of a hex colour (shorthand expanded, alpha ignored), for the contrast
 * maths; null for anything that is not one.
 */
function opaqueHex(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const colour = value.trim()
  if (!HEX.test(colour)) return null
  const digits = colour.slice(1)
  const rgb =
    digits.length <= 4 ? [...digits.slice(0, 3)].map((d) => d + d).join('') : digits.slice(0, 6)
  return `#${rgb}`
}

export interface BadgeStyle {
  backgroundColor: string
  color: string
}

/**
 * Inline colours for a badge pill. The operator's fill is kept as given (alpha included); their
 * text colour is kept only when it reaches 4.5:1 on it, judged on the opaque colours. Otherwise,
 * or when the text colour is missing or unreadable, `readableTextOn` picks one. An unreadable
 * fill falls back to a neutral dark one.
 */
export function badgeColors(badge: {
  badge_color?: Badge['badge_color'] | null
  text_color?: Badge['text_color'] | null
}): BadgeStyle {
  const fill = opaqueHex(badge.badge_color)
  if (fill === null) {
    return { backgroundColor: FALLBACK_BACKGROUND, color: readableTextOn(FALLBACK_BACKGROUND) }
  }
  const background = (badge.badge_color as string).trim()
  const text = opaqueHex(badge.text_color)
  if (text !== null && contrastRatio(fill, text) >= AA_TEXT) {
    return { backgroundColor: background, color: (badge.text_color as string).trim() }
  }
  return { backgroundColor: background, color: readableTextOn(fill) }
}
