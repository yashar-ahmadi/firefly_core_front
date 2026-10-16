'use client'

import dynamic from 'next/dynamic'
import { useEffect, useId, useState } from 'react'
import { Button } from '@/components/ui/button'
import { PanelPending } from '@/components/ui/panel-pending'
import { trackPresses } from '@/components/ui/press-tracking'
import { RichContentBody } from '@/features/content/rich-content-body'
import type { ReadingDialogProps } from './reading-dialog'

type LazyProps = ReadingDialogProps & { onUnavailable: () => void }

/** Stands in for the dialog when its code could not be downloaded. */
function DialogUnavailable({ onUnavailable }: LazyProps) {
  useEffect(() => onUnavailable(), [onUnavailable])
  return null
}

// The dialog (Radix Dialog with its focus trap) loads on the first opening, or earlier when the
// button is hovered, focused or pressed.
const ReadingDialog = dynamic<LazyProps>(
  () =>
    import('./reading-dialog')
      .then((module) => module.ReadingDialog)
      .catch(() => DialogUnavailable),
  { ssr: false, loading: () => <PanelPending label="در حال بارگذاری متن" /> },
)
/** A failed preload is dropped: the first opening imports the code itself. */
const preload = () => {
  import('./reading-dialog').catch(() => {})
}

/**
 * The button that opens operator text (`html`) in a dialog titled `title`. If the dialog's code
 * cannot be downloaded, the text shows in place under the button instead.
 */
export function ReadingButton({
  label,
  title,
  html,
}: {
  label: string
  title: string
  html: string
}) {
  const [open, setOpen] = useState(false)
  const [requested, setRequested] = useState(false)
  const [inline, setInline] = useState(false)
  const inlineId = useId()
  // The dialog returns the focus to its opener: record presses before its code is loaded.
  useEffect(trackPresses, [])

  return (
    <>
      <Button
        variant="outline"
        className="max-sm:w-full"
        aria-haspopup={inline ? undefined : 'dialog'}
        aria-expanded={inline || open}
        aria-controls={inline ? inlineId : undefined}
        onPointerEnter={preload}
        onFocus={preload}
        onClick={() => {
          if (inline) return
          setRequested(true)
          setOpen(true)
        }}
      >
        {label}
      </Button>
      {requested && !inline && (
        <ReadingDialog
          open={open}
          onOpenChange={setOpen}
          title={title}
          html={html}
          onUnavailable={() => setInline(true)}
        />
      )}
      {/* No landmark of its own: the card around it is already the section named `title`. */}
      {inline && (
        <div id={inlineId} className="w-full">
          <RichContentBody html={html} className="rich-content" />
        </div>
      )}
    </>
  )
}
