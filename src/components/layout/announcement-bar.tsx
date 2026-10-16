'use client'

import { X } from 'lucide-react'
import { useSyncExternalStore } from 'react'
import { cn } from '@/components/ui/cn'
import { IconButton } from '@/components/ui/icon-button'
import { useHydrated } from '@/components/ui/use-media-query'
import { useT } from '@/lib/i18n/i18n-context'
import { CONTAINER } from './container'

// The operator's announcement above the header. Dismissing it hides it for the rest of the
// browser-tab session (sessionStorage); a different announcement shows again.

const STORAGE_KEY = 'ff_announcement_dismissed'
const ELEMENT_ID = 'ff-announcement'

/** A short, stable key for a text (djb2, base 36): what the dismissal remembers. */
export function announcementKey(text: string): string {
  let hash = 5381
  for (let i = 0; i < text.length; i++) hash = (hash * 33) ^ text.charCodeAt(i)
  return (hash >>> 0).toString(36)
}

// sessionStorage can throw (private mode, blocked storage); the page then remembers in memory.
let memoryKey: string | null = null
const listeners = new Set<() => void>()

function readDismissed(): string | null {
  try {
    return window.sessionStorage.getItem(STORAGE_KEY) ?? memoryKey
  } catch {
    return memoryKey
  }
}

function dismiss(key: string) {
  memoryKey = key
  try {
    window.sessionStorage.setItem(STORAGE_KEY, key)
  } catch {
    // Remembered in memory only.
  }
  listeners.forEach((listener) => listener())
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/**
 * Runs while the server HTML is parsed, before the first paint: a bar dismissed earlier in this
 * session is hidden at once instead of after hydration, so the page does not jump. The key is
 * base-36 digits only, so it is safe inside the script.
 */
function preHideScript(key: string): string {
  const rule = `#${ELEMENT_ID}[data-key="${key}"]{display:none}`
  return `try{if(sessionStorage.getItem(${JSON.stringify(STORAGE_KEY)})===${JSON.stringify(key)}){var s=document.createElement("style");s.textContent=${JSON.stringify(rule)};document.head.appendChild(s)}}catch(e){}`
}

export function AnnouncementBar({ text, className }: { text: string; className?: string }) {
  const t = useT()
  const key = announcementKey(text)
  const dismissed = useSyncExternalStore(
    subscribe,
    () => readDismissed() === key,
    () => false,
  )
  // The script exists only in the server HTML: React never creates (or warns about) it later.
  const hydrated = useHydrated()
  if (dismissed) return null
  return (
    <div
      id={ELEMENT_ID}
      data-key={key}
      role="region"
      aria-label={t('announcement')}
      className={cn('border-b border-brand-100 bg-brand-50 text-brand-900', className)}
    >
      <div className={cn(CONTAINER, 'relative flex min-h-10 items-center justify-center px-12')}>
        <p className="py-2 text-center text-sm leading-6 font-medium">{text}</p>
        <IconButton
          label={t('announcement_dismiss')}
          icon={<X />}
          size="sm"
          onClick={() => dismiss(key)}
          className="absolute end-1 top-1/2 -translate-y-1/2 text-brand-800 hover:bg-brand-100 lg:end-3"
        />
      </div>
      {!hydrated && <script dangerouslySetInnerHTML={{ __html: preHideScript(key) }} />}
    </div>
  )
}
