'use client'

import { ScrollArea as ScrollAreaPrimitive } from 'radix-ui'
import type { ComponentProps } from 'react'
import { cn } from './cn'

export interface ScrollAreaProps extends ComponentProps<typeof ScrollAreaPrimitive.Root> {
  /** Which scrollbars to draw. */
  orientation?: 'vertical' | 'horizontal' | 'both'
  viewportClassName?: string
  /**
   * Names the scrolling region and makes it a tab stop, so keyboard users can scroll it.
   * Give one when the content has nothing focusable of its own.
   */
  label?: string
}

/**
 * A scroll container with slim, themed scrollbars (Radix) that keeps native scrolling, touch
 * and wheel. RTL by default, so the vertical bar sits on the left. Give it a height.
 */
export function ScrollArea({
  orientation = 'vertical',
  dir = 'rtl',
  type = 'hover',
  className,
  viewportClassName,
  label,
  children,
  ...props
}: ScrollAreaProps) {
  return (
    <ScrollAreaPrimitive.Root
      dir={dir}
      type={type}
      className={cn('relative overflow-hidden', className)}
      {...props}
    >
      <ScrollAreaPrimitive.Viewport
        {...(label ? { role: 'region', 'aria-label': label, tabIndex: 0 } : {})}
        className={cn(
          'size-full overscroll-contain rounded-[inherit] focus-visible:-outline-offset-2',
          viewportClassName,
        )}
      >
        {children}
      </ScrollAreaPrimitive.Viewport>
      {orientation !== 'horizontal' && <ScrollBar orientation="vertical" />}
      {orientation !== 'vertical' && <ScrollBar orientation="horizontal" />}
      <ScrollAreaPrimitive.Corner />
    </ScrollAreaPrimitive.Root>
  )
}

function ScrollBar({ orientation }: { orientation: 'vertical' | 'horizontal' }) {
  return (
    <ScrollAreaPrimitive.Scrollbar
      orientation={orientation}
      className={cn(
        'flex touch-none p-0.5 transition-colors duration-150 select-none',
        orientation === 'vertical' ? 'h-full w-2.5' : 'h-2.5 flex-col',
      )}
    >
      <ScrollAreaPrimitive.Thumb className="relative flex-1 rounded-full bg-ink-300 hover:bg-ink-400" />
    </ScrollAreaPrimitive.Scrollbar>
  )
}
