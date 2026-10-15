import { CircleAlert } from 'lucide-react'
import { Children, cloneElement, useId, type ReactElement, type ReactNode } from 'react'
import { cn } from './cn'
import { VisuallyHidden } from './visually-hidden'

/** The props Field reads from and injects into its control. */
interface ControlProps {
  id?: string
  'aria-describedby'?: string
  'aria-invalid'?: boolean | 'true' | 'false' | 'grammar' | 'spelling'
  'aria-required'?: boolean | 'true' | 'false'
}

export interface FieldProps {
  label: ReactNode
  hint?: ReactNode
  /** When set, the control is marked invalid and described by this message. */
  error?: ReactNode
  required?: boolean
  /** A single control, such as Input, Textarea or Select. */
  children: ReactElement<ControlProps>
  className?: string
}

/**
 * Label above the control, then hint and error. Injects `id`, `aria-invalid`,
 * `aria-required` and `aria-describedby` into its single child, keeping the child's own id
 * and description.
 */
export function Field({ label, hint, error, required = false, children, className }: FieldProps) {
  const baseId = useId()
  const child = Children.only(children)
  const controlId = child.props.id ?? `${baseId}control`
  const hintId = hint ? `${baseId}hint` : undefined
  const errorId = error ? `${baseId}error` : undefined
  const describedBy =
    [child.props['aria-describedby'], hintId, errorId].filter(Boolean).join(' ') || undefined

  const control = cloneElement(child, {
    id: controlId,
    'aria-describedby': describedBy,
    'aria-invalid': error ? true : child.props['aria-invalid'],
    'aria-required': required || child.props['aria-required'] || undefined,
  })

  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <label htmlFor={controlId} className="text-base font-medium text-ink-800">
        {label}
        {required && (
          <>
            {' '}
            <span aria-hidden className="text-danger">
              *
            </span>
            <VisuallyHidden>(الزامی)</VisuallyHidden>
          </>
        )}
      </label>
      {control}
      {hint && (
        <p id={hintId} className="text-sm leading-6 text-ink-500">
          {hint}
        </p>
      )}
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
