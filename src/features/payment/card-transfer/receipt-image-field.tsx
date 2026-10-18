'use client'

import { CircleAlert, ImageUp } from 'lucide-react'
import { useId } from 'react'
import { buttonClasses } from '@/components/ui/button-styles'
import { cn } from '@/components/ui/cn'
import { VisuallyHidden } from '@/components/ui/visually-hidden'
import { toPersianDigits } from '@/lib/format/digits'
import { RECEIPT_TYPES } from './validate-receipt'

// The receipt's picture: a real file input (labelled, in the tab order, opened with the keyboard
// too), drawn as a button because the browser's own one speaks the browser's language, with a
// preview of the chosen picture (an object URL of the shopper's own file). The chosen file is kept
// by the form, never by the input, so nothing is lost when an upload has to be pressed again.

const HINT = 'JPEG، PNG یا WEBP؛ حداکثر ۵ مگابایت، دست\u{200C}کم ۳۰۰ در ۳۰۰ پیکسل.'

export interface PickedFile {
  file: File
  /** An object URL of it, for the preview. */
  url: string
}

export interface ReceiptImageFieldProps {
  /** The file input's id (the form focuses it when it is the first field in error). */
  id: string
  picked: PickedFile | null
  error?: string
  disabled?: boolean
  onPick: (file: File) => void
}

/** «۲ کیلوبایت», «۴٫۸ مگابایت». */
function fileSize(bytes: number): string {
  if (bytes < 1024 * 1024)
    return `${toPersianDigits(Math.max(1, Math.round(bytes / 1024)))} کیلوبایت`
  const megabytes = (bytes / (1024 * 1024)).toFixed(1).replace('.', '\u{066B}')
  return `${toPersianDigits(megabytes)} مگابایت`
}

export function ReceiptImageField({ id, picked, error, disabled, onPick }: ReceiptImageFieldProps) {
  const baseId = useId()
  const titleId = `${baseId}title`
  const buttonId = `${baseId}button`
  const hintId = `${baseId}hint`
  const errorId = error ? `${baseId}error` : undefined
  return (
    <div className="flex flex-col gap-2">
      <span id={titleId} className="text-base font-medium text-ink-800">
        تصویر رسید{' '}
        <span aria-hidden className="text-danger">
          *
        </span>
        <VisuallyHidden>(الزامی)</VisuallyHidden>
      </span>
      <div className="flex flex-col items-start gap-4 sm:flex-row">
        {picked && (
          // The shopper's own file: next/image has nothing to optimise here.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={picked.url}
            alt="پیش‌نمایش تصویر رسید انتخاب‌شده"
            className="h-44 w-auto max-w-full rounded-control border border-ink-200 bg-ink-50 object-contain"
          />
        )}
        <div className="flex min-w-0 flex-col items-start gap-2">
          <input
            id={id}
            type="file"
            accept={RECEIPT_TYPES.join(',')}
            className="peer sr-only"
            disabled={disabled}
            aria-labelledby={`${titleId} ${buttonId}`}
            aria-describedby={[hintId, errorId].filter(Boolean).join(' ')}
            aria-invalid={error ? true : undefined}
            aria-required
            onChange={(event) => {
              const file = event.currentTarget.files?.[0]
              // The form keeps the file: the same one can be chosen again after a refusal.
              event.currentTarget.value = ''
              if (file) onPick(file)
            }}
          />
          <label
            id={buttonId}
            htmlFor={id}
            className={cn(
              buttonClasses({ variant: 'outline' }),
              'cursor-pointer peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-(--focus) peer-focus-visible:outline-solid',
              error && 'border-danger',
              disabled && 'pointer-events-none opacity-50',
            )}
          >
            <ImageUp aria-hidden />
            {picked ? 'انتخاب تصویر دیگر' : 'انتخاب تصویر رسید'}
          </label>
          {picked && (
            <p className="text-sm leading-6 break-all text-ink-700">
              <bdi>{picked.file.name}</bdi>
              {` (${fileSize(picked.file.size)})`}
            </p>
          )}
        </div>
      </div>
      <p id={hintId} className="text-sm leading-6 text-ink-500">
        {HINT}
      </p>
      {error && (
        <p
          id={errorId}
          className="flex items-start gap-1.5 text-sm leading-6 font-medium text-danger"
        >
          <CircleAlert aria-hidden className="mt-1 size-4 shrink-0" />
          <span>{error}</span>
        </p>
      )}
    </div>
  )
}
