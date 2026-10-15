'use client'

import { Switch as SwitchPrimitive } from 'radix-ui'
import { useId, type ComponentProps, type ReactNode } from 'react'
import { ChoiceLabel } from './choice-label'
import { cn } from './cn'

export interface SwitchProps extends ComponentProps<typeof SwitchPrimitive.Root> {
  label?: ReactNode
  description?: ReactNode
}

/**
 * An on/off switch (Radix). Off is an outlined track with a small grey thumb, on is a filled
 * brand track with a white thumb, so the state never relies on colour alone. With `label`,
 * the label sits at the start and the switch at the end of a 44px row.
 */
export function Switch({ label, description, className, id, ...props }: SwitchProps) {
  const autoId = useId()
  const switchId = id ?? autoId
  const descriptionId = description ? `${switchId}-description` : undefined

  const control = (
    <SwitchPrimitive.Root
      id={switchId}
      aria-describedby={descriptionId}
      className={cn(
        'peer relative inline-flex h-7 w-12 shrink-0 cursor-pointer items-center rounded-full border-2 border-ink-500 bg-ink-100',
        'transition-colors duration-200 disabled:cursor-not-allowed disabled:opacity-50',
        'after:absolute after:-inset-2 data-[state=checked]:border-brand data-[state=checked]:bg-brand',
        !label && className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        className={cn(
          'pointer-events-none ms-1 block size-4 rounded-full bg-ink-500 shadow-sm',
          'transition-[margin,width,height,background-color] duration-200 ease-out',
          'data-[state=checked]:ms-5 data-[state=checked]:size-5 data-[state=checked]:bg-white',
        )}
      />
    </SwitchPrimitive.Root>
  )

  if (!label) return control
  return (
    <div className={cn('flex min-h-11 items-center justify-between gap-4 py-2', className)}>
      <ChoiceLabel
        htmlFor={switchId}
        label={label}
        description={description}
        descriptionId={descriptionId}
      />
      {control}
    </div>
  )
}
