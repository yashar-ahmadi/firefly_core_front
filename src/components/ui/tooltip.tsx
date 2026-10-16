'use client'

import { Tooltip as TooltipPrimitive } from 'radix-ui'
import {
  createContext,
  useContext,
  type ComponentProps,
  type ReactElement,
  type ReactNode,
} from 'react'
import { cn } from './cn'

/** Hover time before a tooltip opens, unless a `Tooltip` sets its own. */
const DELAY = 300

/** Inside a `TooltipProvider`: its tooltips share one timing. */
const GroupContext = createContext(false)

export interface TooltipProps extends Omit<
  ComponentProps<typeof TooltipPrimitive.Content>,
  'content' | 'children'
> {
  /** The hint. Keep it short; it supplements a visible label or an `aria-label`. */
  content: ReactNode
  /** One focusable element (an IconButton, a link). Disabled buttons never show a tooltip. */
  children: ReactElement
  /** Milliseconds of hover before it opens (default 300). */
  delayDuration?: number
}

/**
 * A shared timing for a group of tooltips (a toolbar): once one is open, moving to the next
 * shows it at once. Optional: a `Tooltip` outside one brings its own. Not mounted by the root
 * providers, so pages without tooltips do not load their code.
 */
export function TooltipProvider({ children }: { children: ReactNode }) {
  return (
    <GroupContext.Provider value>
      <TooltipPrimitive.Provider delayDuration={DELAY}>{children}</TooltipPrimitive.Provider>
    </GroupContext.Provider>
  )
}

/**
 * A short hint on hover and keyboard focus (Radix). Touch screens never show tooltips, so
 * never put information only here. Works on its own or inside a `TooltipProvider`.
 */
export function Tooltip({
  content,
  children,
  delayDuration,
  side = 'top',
  sideOffset = 6,
  collisionPadding = 8,
  className,
  ...props
}: TooltipProps) {
  const grouped = useContext(GroupContext)
  const tooltip = (
    <TooltipPrimitive.Root delayDuration={delayDuration}>
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
  )
  if (grouped) return tooltip
  return <TooltipPrimitive.Provider delayDuration={DELAY}>{tooltip}</TooltipPrimitive.Provider>
}
