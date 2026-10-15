import type { ReactNode } from 'react'
import { cn } from './cn'

// The label + description column shared by Checkbox, RadioGroupItem and Switch.

export interface ChoiceLabelProps {
  htmlFor: string
  label: ReactNode
  description?: ReactNode
  descriptionId?: string
  className?: string
}

export function ChoiceLabel({
  htmlFor,
  label,
  description,
  descriptionId,
  className,
}: ChoiceLabelProps) {
  return (
    <span className={cn('flex min-w-0 flex-col', className)}>
      <label htmlFor={htmlFor} className="cursor-pointer text-base leading-7 text-ink-800">
        {label}
      </label>
      {description && (
        <span id={descriptionId} className="text-sm leading-6 text-ink-500">
          {description}
        </span>
      )}
    </span>
  )
}
