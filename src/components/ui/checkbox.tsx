'use client'

import { Check, Minus } from 'lucide-react'
import { Checkbox as CheckboxPrimitive } from 'radix-ui'
import { useId, type ComponentProps, type ReactNode } from 'react'
import { ChoiceLabel } from './choice-label'
import { cn } from './cn'

export interface CheckboxProps extends ComponentProps<typeof CheckboxPrimitive.Root> {
  label?: ReactNode
  description?: ReactNode
}

/**
 * A 24px checkbox (Radix). With `label`, the whole row is at least 44px high and the label is
 * clickable. Supports `checked="indeterminate"`.
 */
export function Checkbox({ label, description, className, id, ...props }: CheckboxProps) {
  const autoId = useId()
  const boxId = id ?? autoId
  const descriptionId = description ? `${boxId}-description` : undefined

  const box = (
    <CheckboxPrimitive.Root
      id={boxId}
      aria-describedby={descriptionId}
      className={cn(
        'group relative grid size-6 shrink-0 cursor-pointer place-items-center rounded-check border-2 border-ink-500 bg-white text-brand-fg',
        'transition-colors duration-150 hover:border-brand-600 disabled:cursor-not-allowed disabled:opacity-50',
        'data-[state=checked]:border-brand data-[state=checked]:bg-brand',
        'data-[state=indeterminate]:border-brand data-[state=indeterminate]:bg-brand',
        'after:absolute after:-inset-2.5',
        !label && className,
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator className="grid place-items-center motion-safe:animate-pop">
        <Check strokeWidth={3} className="size-4 group-data-[state=indeterminate]:hidden" />
        <Minus strokeWidth={3} className="hidden size-4 group-data-[state=indeterminate]:block" />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  )

  if (!label) return box
  return (
    <div className={cn('flex min-h-11 items-start gap-3 py-2', className)}>
      <span className="flex h-7 items-center">{box}</span>
      <ChoiceLabel
        htmlFor={boxId}
        label={label}
        description={description}
        descriptionId={descriptionId}
      />
    </div>
  )
}
