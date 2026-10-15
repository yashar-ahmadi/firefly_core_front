import { ChevronDown } from 'lucide-react'
import type { ComponentProps } from 'react'
import { cn } from './cn'
import { controlClasses, isInvalid } from './control-styles'

export interface SelectProps extends ComponentProps<'select'> {
  /** Classes for the wrapper; `className` styles the `<select>` itself. */
  wrapperClassName?: string
}

/** A native `<select>` (best on phones and with assistive tech), styled like the inputs. */
export function Select({ className, wrapperClassName, children, ...props }: SelectProps) {
  return (
    <div className={cn('relative w-full', wrapperClassName)}>
      <select
        className={cn(
          controlClasses({ invalid: isInvalid(props['aria-invalid']), disabled: props.disabled }),
          'h-12 w-full cursor-pointer appearance-none ps-3.5 pe-11',
          className,
        )}
        {...props}
      >
        {children}
      </select>
      <ChevronDown
        aria-hidden
        className="pointer-events-none absolute end-3.5 top-1/2 size-5 -translate-y-1/2 text-ink-500"
      />
    </div>
  )
}
