'use client'

import { X } from 'lucide-react'
import dynamic from 'next/dynamic'
import { useEffect, useState, useSyncExternalStore, type ReactNode } from 'react'
import type { ExternalToast } from 'sonner'
import { cn } from './cn'

export type NotifyOptions = ExternalToast

/** What `notify` asked for, in order. */
export type Notice =
  | { kind: 'success' | 'error' | 'info'; message: ReactNode; options?: NotifyOptions }
  | { kind: 'dismiss'; id?: string | number }

// Sonner's code (about 10 KB gzip) is not part of the page: the first toast mounts the toaster,
// which downloads it. Until a toaster connects, notices wait here in order.
let queue: Notice[] = []
let sink: ((notice: Notice) => void) | null = null
let requested = false
const listeners = new Set<() => void>()

function send(notice: Notice) {
  if (sink) return sink(notice)
  queue.push(notice)
  if (requested) return
  requested = true
  for (const listener of listeners) listener()
}

/** For the toaster that shows them: takes the queued notices, then each new one. */
export function connectToasts(next: (notice: Notice) => void): () => void {
  sink = next
  const queued = queue
  queue = []
  for (const notice of queued) next(notice)
  return () => {
    if (sink === next) sink = null
  }
}

/** Shows a toast. Messages are short Persian sentences; add detail with `description`. */
export const notify = {
  success: (message: ReactNode, options?: NotifyOptions) =>
    send({ kind: 'success', message, options }),
  error: (message: ReactNode, options?: NotifyOptions) => send({ kind: 'error', message, options }),
  info: (message: ReactNode, options?: NotifyOptions) => send({ kind: 'info', message, options }),
  /** Closes one toast (by the `id` option it was sent with), or all of them. */
  dismiss: (id?: string | number) => {
    if (sink) return sink({ kind: 'dismiss', id })
    // Nothing is on screen yet: drop the queued ones instead of loading the toaster for that.
    queue = queue.filter((n) => n.kind !== 'dismiss' && id !== undefined && n.options?.id !== id)
  },
}

interface Shown {
  key: number
  id?: string | number
  kind: 'success' | 'error' | 'info'
  message: ReactNode
  description?: ReactNode
}

/** How long the stand-in shows a message. */
const FALLBACK_MS = 6000

/**
 * Stands in for Sonner when its code could not be downloaded (a stale chunk after a deploy, a
 * dropped connection): each message in a plain box at the top, read out (errors as alerts),
 * with a close button, gone after six seconds.
 */
function FallbackToasts() {
  const [shown, setShown] = useState<Shown[]>([])
  useEffect(() => {
    let key = 0
    return connectToasts((notice) => {
      if (notice.kind === 'dismiss') {
        setShown((list) => (notice.id === undefined ? [] : list.filter((n) => n.id !== notice.id)))
        return
      }
      key += 1
      const { id, description } = notice.options ?? {}
      const item: Shown = {
        key,
        id,
        kind: notice.kind,
        message: notice.message,
        description: typeof description === 'function' ? description() : description,
      }
      setShown((list) => [...list.filter((n) => id === undefined || n.id !== id), item].slice(-3))
    })
  }, [])
  useEffect(() => {
    if (shown.length === 0) return
    const timer = window.setTimeout(() => setShown((list) => list.slice(1)), FALLBACK_MS)
    return () => window.clearTimeout(timer)
  }, [shown])

  return (
    <section
      aria-label="اعلان‌ها"
      className="pointer-events-none fixed inset-x-4 top-4 z-[100] flex flex-col items-center gap-2"
    >
      {shown.map((item) => (
        <div
          key={item.key}
          role={item.kind === 'error' ? 'alert' : 'status'}
          className={cn(
            'pointer-events-auto flex w-full max-w-md items-start gap-3 rounded-card border bg-white p-4 text-base shadow-raised',
            item.kind === 'error' ? 'border-danger text-danger' : 'border-ink-200 text-ink-900',
          )}
        >
          <div className="min-w-0 flex-1">
            <div className="font-semibold">{item.message}</div>
            {item.description && <div className="text-ink-700">{item.description}</div>}
          </div>
          <button
            type="button"
            aria-label="بستن اعلان"
            onClick={() => setShown((list) => list.filter((n) => n.key !== item.key))}
            className="-m-3 grid size-11 shrink-0 place-items-center rounded-control text-ink-600 hover:bg-ink-100"
          >
            <X aria-hidden className="size-4" />
          </button>
        </div>
      ))}
    </section>
  )
}

const ToasterView = dynamic(
  () => import('./toaster-view').then((module) => module.ToasterView).catch(() => FallbackToasts),
  { ssr: false },
)

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/**
 * Where toasts appear: mounted once by the root providers. Renders nothing until the first
 * `notify`, then Sonner (top centre, RTL, coloured by type, with a close button).
 */
export function Toaster() {
  const active = useSyncExternalStore(
    subscribe,
    () => requested,
    () => false,
  )
  return active ? <ToasterView /> : null
}
