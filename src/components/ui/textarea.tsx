import type { ComponentProps } from 'react'
import { cn } from './cn'
import { controlClasses, isInvalid } from './control-styles'

export type TextareaProps = ComponentProps<'textarea'>

/** A multi-line text field that grows with its content where the browser supports it. */
export function Textarea({ className, rows = 4, ...props }: TextareaProps) {
  return (
    <textarea
      rows={rows}
      className={cn(
        controlClasses({ invalid: isInvalid(props['aria-invalid']), disabled: props.disabled }),
        'block field-sizing-content min-h-28 w-full resize-y px-3.5 py-3 leading-7',
        className,
      )}
      {...props}
    />
  )
}
