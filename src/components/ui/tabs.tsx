'use client'

import { Tabs as TabsPrimitive } from 'radix-ui'
import { createContext, useContext, type ComponentProps } from 'react'
import { cn } from './cn'

/**
 * Tabs (Radix). RTL by default, so ArrowLeft moves to the next tab (it sits to the left);
 * Home and End jump to the first and last. Focusing a tab shows its panel.
 */
export function Tabs({ dir = 'rtl', ...props }: ComponentProps<typeof TabsPrimitive.Root>) {
  return <TabsPrimitive.Root dir={dir} {...props} />
}

export type TabsVariant = 'line' | 'pill'

const VariantContext = createContext<TabsVariant>('line')

export interface TabsListProps extends ComponentProps<typeof TabsPrimitive.List> {
  /** `line`: underlined tabs for page sections. `pill`: a segmented control for quick filters. */
  variant?: TabsVariant
}

const LIST: Record<TabsVariant, string> = {
  line: 'gap-1 shadow-[inset_0_-1px_0] shadow-ink-200',
  pill: 'w-fit max-w-full gap-1 rounded-pill bg-ink-100 p-1',
}

/** Scrolls sideways when the tabs do not fit (phones). */
export function TabsList({ variant = 'line', className, ...props }: TabsListProps) {
  return (
    <VariantContext value={variant}>
      <TabsPrimitive.List
        className={cn('flex [scrollbar-width:none] overflow-x-auto', LIST[variant], className)}
        {...props}
      />
    </VariantContext>
  )
}

const TRIGGER: Record<TabsVariant, string> = {
  // A 3px brand bar under the active tab that grows in from the centre.
  line: cn(
    'h-12 data-[state=active]:text-brand-800',
    'after:absolute after:inset-x-2 after:bottom-0 after:h-[3px] after:scale-x-0 after:rounded-full after:bg-brand',
    'motion-safe:after:transition-transform motion-safe:after:duration-200 data-[state=active]:after:scale-x-100',
  ),
  // The active tab is a raised white segment.
  pill: 'h-11 rounded-pill data-[state=active]:bg-white data-[state=active]:text-ink-900 data-[state=active]:shadow-sm',
}

export function TabsTrigger({ className, ...props }: ComponentProps<typeof TabsPrimitive.Trigger>) {
  const variant = useContext(VariantContext)
  return (
    <TabsPrimitive.Trigger
      className={cn(
        'relative inline-flex shrink-0 cursor-pointer items-center justify-center gap-2 px-4 text-base font-medium whitespace-nowrap text-ink-600',
        'transition-[color,background-color,box-shadow] duration-150 hover:text-ink-900 focus-visible:-outline-offset-2',
        'disabled:cursor-not-allowed disabled:opacity-50 [&_svg]:size-5 [&_svg]:shrink-0',
        TRIGGER[variant],
        className,
      )}
      {...props}
    />
  )
}

export function TabsContent({ className, ...props }: ComponentProps<typeof TabsPrimitive.Content>) {
  return (
    <TabsPrimitive.Content
      className={cn(
        'mt-4 text-base text-ink-800 focus-visible:outline-offset-4',
        'motion-safe:data-[state=active]:animate-fade-in',
        className,
      )}
      {...props}
    />
  )
}
