'use client'

import { CircleAlert, CircleCheck, Info } from 'lucide-react'
import { useEffect, type CSSProperties } from 'react'
import { Toaster as Sonner, toast } from 'sonner'
import { connectToasts } from './toaster'

// Sonner, loaded with the first toast of the page (see `Toaster` in toaster.tsx). Sonner injects
// its own (unlayered) CSS, which beats Tailwind's layered utilities, so the theme is applied
// through Sonner's CSS variables and inline styles instead of classes.

const tint = (color: string, percent: number) =>
  `color-mix(in oklab, var(${color}) ${percent}%, var(--color-white, white))`

const THEME = {
  // Sonner sets its own font stack; inherit Vazirmatn from the page.
  fontFamily: 'inherit',
  '--border-radius': 'var(--radius-card)',
  '--normal-bg': 'var(--color-white, white)',
  '--normal-border': 'var(--color-ink-200)',
  '--normal-text': 'var(--color-ink-900)',
  '--success-bg': tint('--color-success', 8),
  '--success-border': tint('--color-success', 30),
  '--success-text': 'var(--color-success)',
  '--error-bg': tint('--color-danger', 7),
  '--error-border': tint('--color-danger', 30),
  '--error-text': 'var(--color-danger)',
  '--info-bg': tint('--color-info', 7),
  '--info-border': tint('--color-info', 30),
  '--info-text': 'var(--color-info)',
  '--warning-bg': tint('--color-warning', 7),
  '--warning-border': tint('--color-warning', 30),
  '--warning-text': 'var(--color-warning)',
} as CSSProperties

// Sonner's default is 13px; reading text stays at 16px.
const TOAST_STYLE: CSSProperties = {
  fontSize: '1rem',
  lineHeight: 1.6,
  gap: '0.75rem',
  padding: '0.875rem 1rem',
  boxShadow: 'var(--shadow-raised)',
}

const ICONS = {
  success: <CircleCheck className="size-5" aria-hidden />,
  error: <CircleAlert className="size-5" aria-hidden />,
  info: <Info className="size-5" aria-hidden />,
}

/**
 * Toast notifications: top centre, RTL, coloured by type, with a close button (its tap area
 * is 44px) and swipe to dismiss. Shows what `notify` sent, those queued before it loaded first.
 */
export function ToasterView() {
  useEffect(
    () =>
      connectToasts((notice) => {
        if (notice.kind === 'dismiss') toast.dismiss(notice.id)
        else toast[notice.kind](notice.message, notice.options)
      }),
    [],
  )
  return (
    <Sonner
      dir="rtl"
      position="top-center"
      richColors
      closeButton
      containerAriaLabel="اعلان‌ها"
      icons={ICONS}
      style={THEME}
      mobileOffset={16}
      toastOptions={{
        closeButtonAriaLabel: 'بستن اعلان',
        style: TOAST_STYLE,
        // `!` is needed where Sonner's own rule sets the same property.
        classNames: {
          title: 'font-semibold!',
          closeButton: 'after:absolute after:-inset-3',
          icon: 'size-5! m-0!',
        },
      }}
    />
  )
}
