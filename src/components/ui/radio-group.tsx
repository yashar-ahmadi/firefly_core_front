'use client'

import { RadioGroup as RadioPrimitive } from 'radix-ui'
import { useId, type ComponentProps, type ReactNode } from 'react'
import { ChoiceLabel } from './choice-label'
import { cn } from './cn'

export type RadioGroupProps = ComponentProps<typeof RadioPrimitive.Root>

/** A radio group (Radix). Arrow keys follow the RTL reading direction by default. */
export function RadioGroup({ className, dir = 'rtl', ...props }: RadioGroupProps) {
  return <RadioPrimitive.Root dir={dir} className={cn('grid gap-2', className)} {...props} />
}

export interface RadioGroupItemProps extends ComponentProps<typeof RadioPrimitive.Item> {
  label: ReactNode
  description?: ReactNode
  /** `card` draws a bordered (ink-500, 3:1), tappable option that highlights when chosen. */
  variant?: 'plain' | 'card'
  /** Extra content at the end of the row, e.g. a price. */
  aside?: ReactNode
}

export function RadioGroupItem({
  label,
  description,
  variant = 'plain',
  aside,
  className,
  id,
  ...props
}: RadioGroupItemProps) {
  const autoId = useId()
  const itemId = id ?? autoId
  const descriptionId = description ? `${itemId}-description` : undefined

  return (
    <div
      className={cn(
        'flex min-h-11 items-start gap-3',
        variant === 'card'
          ? 'rounded-card border border-ink-500 bg-white p-4 transition-colors hover:border-ink-600 has-data-[state=checked]:border-brand has-data-[state=checked]:bg-brand-50 has-data-[state=checked]:ring-1 has-data-[state=checked]:ring-brand'
          : 'py-2',
        className,
      )}
    >
      <span className="flex h-7 items-center">
        <RadioPrimitive.Item
          id={itemId}
          aria-describedby={descriptionId}
          className={cn(
            'relative grid size-6 shrink-0 cursor-pointer place-items-center rounded-full border-2 border-ink-500 bg-white',
            'transition-colors duration-150 hover:border-brand-600 disabled:cursor-not-allowed disabled:opacity-50',
            'after:absolute after:-inset-2.5 data-[state=checked]:border-brand',
          )}
          {...props}
        >
          <RadioPrimitive.Indicator className="size-3 rounded-full bg-brand motion-safe:animate-pop" />
        </RadioPrimitive.Item>
      </span>
      <ChoiceLabel
        htmlFor={itemId}
        label={label}
        description={description}
        descriptionId={descriptionId}
        className="flex-1"
      />
      {aside && <span className="shrink-0 self-center">{aside}</span>}
    </div>
  )
}
