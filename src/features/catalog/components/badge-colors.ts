import type { Badge } from '@/lib/api/types/catalog'
import { AA_TEXT, contrastRatio, readableTextOn } from '@/lib/theme/color'

// The operator picks a badge's fill and text colours; the text must still meet WCAG AA.

/** ink-800: the pill's fill when the operator's colour cannot be read. */
const FALLBACK_BACKGROUND = '#1E293B'

const HEX6 = /^#[0-9a-f]{6}$/i
const HEX3 = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i

/** `#RRGGBB` (a `#RGB` shorthand is expanded), or null for anything else. */
function toHex6(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const colour = value.trim()
  if (HEX6.test(colour)) return colour
  const short = HEX3.exec(colour)
  return short ? `#${short[1]}${short[1]}${short[2]}${short[2]}${short[3]}${short[3]}` : null
}

export interface BadgeStyle {
  backgroundColor: string
  color: string
}

/**
 * Inline colours for a badge pill. The operator's fill is kept; their text colour is used only
 * when it reaches 4.5:1 on it, otherwise (or when missing or unreadable) `readableTextOn` picks
 * one. An unreadable fill falls back to a neutral dark one.
 */
export function badgeColors(badge: {
  badge_color?: Badge['badge_color'] | null
  text_color?: Badge['text_color'] | null
}): BadgeStyle {
  const background = toHex6(badge.badge_color) ?? FALLBACK_BACKGROUND
  const text = toHex6(badge.text_color)
  const readable = text !== null && contrastRatio(background, text) >= AA_TEXT
  return { backgroundColor: background, color: readable ? text : readableTextOn(background) }
}
