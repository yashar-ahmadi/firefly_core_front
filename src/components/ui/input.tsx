import type { ComponentProps, ReactNode } from 'react'
import { cn } from './cn'
import { controlFrameClasses, isInvalid } from './control-styles'

export interface InputProps extends ComponentProps<'input'> {
  /** Shown at the start (right in RTL), e.g. a search icon. */
  startAdornment?: ReactNode
  /** Shown at the end (left in RTL), e.g. a unit or a clear button. */
  endAdornment?: ReactNode
  /** Classes for the inner `<input>`; `className` styles the frame. */
  inputClassName?: string
}

/**
 * A 48px text input. Pass `dir="ltr"` for e-mail, phone and code fields: the whole field then
 * runs left-to-right, so a start adornment sits on the left next to the text. Field injects
 * id and aria props.
 */
export function Input({
  startAdornment,
  endAdornment,
  className,
  inputClassName,
  type = 'text',
  ref,
  ...props
}: InputProps) {
  const adornment = 'flex shrink-0 items-center text-ink-500 [&_svg]:size-5'
  return (
    <div
      dir={props.dir}
      className={cn(
        controlFrameClasses({
          invalid: isInvalid(props['aria-invalid']),
          disabled: props.disabled,
        }),
        'flex h-12 w-full items-center',
        className,
      )}
    >
      {startAdornment && <span className={cn(adornment, 'ps-3.5')}>{startAdornment}</span>}
      <input
        ref={ref}
        type={type}
        className={cn(
          'h-full w-full min-w-0 flex-1 rounded-[inherit] bg-transparent px-3.5 text-base outline-none',
          'placeholder:text-ink-500 disabled:cursor-not-allowed',
          startAdornment && 'ps-2.5',
          endAdornment && 'pe-2.5',
          inputClassName,
        )}
        {...props}
      />
      {endAdornment && <span className={cn(adornment, 'pe-3.5')}>{endAdornment}</span>}
    </div>
  )
}
