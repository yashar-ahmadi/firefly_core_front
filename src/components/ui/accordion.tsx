'use client'

import { ChevronDown } from 'lucide-react'
import { Accordion as AccordionPrimitive } from 'radix-ui'
import type { ComponentProps } from 'react'
import { cn } from './cn'

/**
 * Collapsible sections (Radix) for FAQs, product details and filter groups. Each trigger is a
 * button inside an h3 with `aria-expanded`; each panel is a region named by its trigger.
 * `type="single" collapsible` opens one at a time, `type="multiple"` any number.
 */
export function Accordion({
  dir = 'rtl',
  ...props
}: ComponentProps<typeof AccordionPrimitive.Root>) {
  return <AccordionPrimitive.Root dir={dir} {...props} />
}

export function AccordionItem({
  className,
  ...props
}: ComponentProps<typeof AccordionPrimitive.Item>) {
  return (
    <AccordionPrimitive.Item
      className={cn('border-b border-ink-200 last:border-b-0', className)}
      {...props}
    />
  )
}

export function AccordionTrigger({
  className,
  children,
  ...props
}: ComponentProps<typeof AccordionPrimitive.Trigger>) {
  return (
    <AccordionPrimitive.Header className="flex">
      <AccordionPrimitive.Trigger
        className={cn(
          'group flex min-h-14 flex-1 cursor-pointer items-center justify-between gap-4 py-3 text-start text-base font-medium text-ink-900',
          'transition-colors duration-150 hover:text-brand-800 disabled:cursor-not-allowed disabled:opacity-50',
          className,
        )}
        {...props}
      >
        {children}
        <span
          aria-hidden
          className="grid size-8 shrink-0 place-items-center rounded-full bg-ink-100 text-ink-600 transition-colors group-hover:bg-brand-50 group-hover:text-brand-700"
        >
          <ChevronDown className="size-5 group-data-[state=open]:rotate-180 motion-safe:transition-transform motion-safe:duration-200" />
        </span>
      </AccordionPrimitive.Trigger>
    </AccordionPrimitive.Header>
  )
}

export function AccordionContent({
  className,
  children,
  ...props
}: ComponentProps<typeof AccordionPrimitive.Content>) {
  return (
    <AccordionPrimitive.Content
      className={cn(
        'overflow-hidden text-base text-ink-700',
        'motion-safe:data-[state=closed]:animate-accordion-up motion-safe:data-[state=open]:animate-accordion-down',
      )}
      {...props}
    >
      <div className={cn('pb-4', className)}>{children}</div>
    </AccordionPrimitive.Content>
  )
}
