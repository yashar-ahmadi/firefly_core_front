'use client'

import { useEffect, type CSSProperties } from 'react'
import type { ErrorBoundaryProps } from '@/components/layout/error-view'
import { fa } from '@/lib/i18n/fa'

// The last resort, when the root layout itself fails: a complete document that needs nothing
// else (no stylesheet, font, theme or provider), with the same message as error.tsx.

const FONT = "Vazirmatn, Tahoma, 'Segoe UI', system-ui, -apple-system, Arial, sans-serif"

const styles = {
  body: {
    margin: 0,
    minHeight: '100dvh',
    display: 'grid',
    placeItems: 'center',
    padding: '24px 16px',
    boxSizing: 'border-box',
    background: '#f8fafc',
    color: '#0f172a',
    fontFamily: FONT,
    fontSize: 16,
    lineHeight: 1.8,
  },
  main: { maxWidth: 440, textAlign: 'center' },
  title: { margin: '0 0 12px', fontSize: 24, lineHeight: 1.6, fontWeight: 700 },
  text: { margin: '0 0 28px', color: '#475569' },
  actions: { display: 'flex', flexWrap: 'wrap', gap: 12, justifyContent: 'center' },
  button: {
    minHeight: 44,
    padding: '0 20px',
    border: 0,
    borderRadius: 10,
    background: '#0f172a',
    color: '#ffffff',
    font: 'inherit',
    fontWeight: 600,
    cursor: 'pointer',
  },
  link: {
    display: 'inline-flex',
    alignItems: 'center',
    minHeight: 44,
    padding: '0 20px',
    border: '1px solid #cbd5e1',
    borderRadius: 10,
    background: '#ffffff',
    color: '#1e293b',
    fontWeight: 600,
    textDecoration: 'none',
  },
  reference: { margin: '28px 0 0', fontSize: 14, color: '#64748b' },
} satisfies Record<string, CSSProperties>

export default function GlobalError({ error, retry }: ErrorBoundaryProps) {
  useEffect(() => {
    console.error('[global-error]', error.digest ?? '', error)
  }, [error])

  return (
    <html lang="fa" dir="rtl">
      <body style={styles.body}>
        <title>{fa.error_title}</title>
        <main style={styles.main}>
          <h1 style={styles.title}>{fa.error_title}</h1>
          <p style={styles.text}>{fa.error_text}</p>
          <div style={styles.actions}>
            <button type="button" style={styles.button} onClick={() => retry()}>
              {fa.retry}
            </button>
            {/* A full page load: the client router may be what failed. */}
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
            <a href="/" style={styles.link}>
              {fa.home_page}
            </a>
          </div>
          {error.digest && (
            <p style={styles.reference}>
              {fa.error_reference}: <span dir="ltr">{error.digest}</span>
            </p>
          )}
        </main>
      </body>
    </html>
  )
}
