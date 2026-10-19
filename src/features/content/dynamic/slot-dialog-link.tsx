'use client'

import dynamic from 'next/dynamic'
import { useState, type ReactNode } from 'react'
import type { SlotDialogProps } from './slot-dialog'

// The dialog-link variant's one client island: a button, and the dialog's code fetched on the
// first press (or as the pointer or focus reaches the button). The content itself came rendered
// from the server as `children`: no request, no parsing and no sanitiser in the browser.

const loadDialog = () => import('./slot-dialog')

/** The dialog's code could not load: the content in place under the button, named as it. */
function InPlace({ open, title, children }: SlotDialogProps) {
  return open ? (
    <div role="region" aria-label={title} className="mt-2 w-full">
      {children}
    </div>
  ) : null
}

/** The first press while the dialog's code is on its way (a slow connection): said at once. */
function Opening() {
  return (
    <span role="status" className="text-sm leading-6 text-ink-600">
      {'در حال باز شدن\u{2026}'}
    </span>
  )
}

const SlotDialog = dynamic(
  () =>
    loadDialog()
      .then((module) => module.SlotDialog)
      .catch(() => InPlace),
  { ssr: false, loading: Opening },
)

const preload = () => void loadDialog().catch(() => undefined)

export function SlotDialogLink({
  label,
  title,
  children,
}: {
  label: string
  title: string
  children: ReactNode
}) {
  const [open, setOpen] = useState(false)
  // Mounted from the first press on: closing keeps it, so a second press opens it at once.
  const [requested, setRequested] = useState(false)
  return (
    <>
      <button
        type="button"
        aria-haspopup="dialog"
        onPointerEnter={preload}
        onFocus={preload}
        onClick={() => {
          setRequested(true)
          setOpen(true)
        }}
        className="inline-flex min-h-11 items-center rounded-control text-base font-medium text-brand-700 underline decoration-brand-300 underline-offset-4 hover:text-brand-800 hover:decoration-current"
      >
        {label}
      </button>
      {requested && (
        <SlotDialog open={open} onOpenChange={setOpen} title={title}>
          {children}
        </SlotDialog>
      )}
    </>
  )
}
