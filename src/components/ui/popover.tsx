'use client'

import { Popover as PopoverPrimitive } from 'radix-ui'
import type { ComponentProps } from 'react'
import { cn } from './cn'
import { FLOATING_PANEL } from './overlay-panel'

/** A non-modal floating panel anchored to its trigger (Radix). Escape or a click outside closes it. */
export const Popover = PopoverPrimitive.Root
export const PopoverTrigger = PopoverPrimitive.Trigger
export const PopoverAnchor = PopoverPrimitive.Anchor
export const PopoverClose = PopoverPrimitive.Close

export function PopoverContent({
  className,
  align = 'center',
  sideOffset = 8,
  collisionPadding = 16,
  ...props
}: ComponentProps<typeof PopoverPrimitive.Content>) {
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Content
        align={align}
        sideOffset={sideOffset}
        collisionPadding={collisionPadding}
        className={cn(
          FLOATING_PANEL,
          'w-72 max-w-[calc(100vw-2rem)] origin-(--radix-popover-content-transform-origin) p-4 text-base',
          className,
        )}
        {...props}
      />
    </PopoverPrimitive.Portal>
  )
}
