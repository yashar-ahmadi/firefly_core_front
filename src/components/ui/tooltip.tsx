'use client'

import { Tooltip as TooltipPrimitive } from 'radix-ui'
import type { ComponentProps, ReactElement, ReactNode } from 'react'
import { cn } from './cn'

export interface TooltipProps extends Omit<
  ComponentProps<typeof TooltipPrimitive.Content>,
  'content' | 'children'
> {
  /** The hint. Keep it short; it supplements a visible label or an `aria-label`. */
  content: ReactNode
  /** One focusable element (an IconButton, a link). Disabled buttons never show a tooltip. */
  children: ReactElement
  /** Milliseconds of hover before it opens. */
  delayDuration?: number
}

/**
 * A short hint on hover and keyboard focus (Radix). Touch screens never show tooltips, so
 * never put information only here. Each tooltip carries its own provider.
 */
export function Tooltip({
  content,
  children,
  delayDuration = 300,
  side = 'top',
  sideOffset = 6,
  collisionPadding = 8,
  className,
  ...props
}: TooltipProps) {
  return (
    <TooltipPrimitive.Provider delayDuration={delayDuration}>
      <TooltipPrimitive.Root>
        <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
        <TooltipPrimitive.Portal>
          <TooltipPrimitive.Content
            side={side}
            sideOffset={sideOffset}
            collisionPadding={collisionPadding}
            className={cn(
              'z-50 max-w-xs rounded-control bg-ink-900 px-3 py-1.5 text-sm leading-6 text-white shadow-raised',
              'origin-(--radix-tooltip-content-transform-origin) motion-safe:animate-menu-in motion-safe:data-[state=closed]:animate-menu-out',
              className,
            )}
            {...props}
          >
            {content}
            <TooltipPrimitive.Arrow className="fill-ink-900" width={12} height={6} />
          </TooltipPrimitive.Content>
        </TooltipPrimitive.Portal>
      </TooltipPrimitive.Root>
    </TooltipPrimitive.Provider>
  )
}
