import type { DisplayStyle } from '@/lib/api/types/display'

// The panel's «سبک نمایش» as the storefront reads it (content digest §6.1). Pure.

export type { DisplayStyle }

export const DISPLAY_STYLES: readonly DisplayStyle[] = ['style_1', 'style_2', 'style_3', 'style_4']

/** The style to draw: the operator's when the storefront knows it, else `style_1`. */
export function displayStyle(value: unknown): DisplayStyle {
  return (DISPLAY_STYLES as readonly unknown[]).includes(value)
    ? (value as DisplayStyle)
    : 'style_1'
}
