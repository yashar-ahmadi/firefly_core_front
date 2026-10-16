'use client'

import { Check } from 'lucide-react'
import { DropdownMenu as MenuPrimitive } from 'radix-ui'
import type { ComponentProps } from 'react'
import { cn } from './cn'
import { FLOATING_PANEL } from './overlay-panel'

/** A menu of actions or links (Radix): arrow keys move, Enter picks, Escape closes. RTL by default. */
export function DropdownMenu({ dir = 'rtl', ...props }: ComponentProps<typeof MenuPrimitive.Root>) {
  return <MenuPrimitive.Root dir={dir} {...props} />
}

export const DropdownMenuTrigger = MenuPrimitive.Trigger
export const DropdownMenuGroup = MenuPrimitive.Group
export const DropdownMenuRadioGroup = MenuPrimitive.RadioGroup

export function DropdownMenuContent({
  className,
  align = 'start',
  sideOffset = 6,
  collisionPadding = 16,
  ...props
}: ComponentProps<typeof MenuPrimitive.Content>) {
  return (
    <MenuPrimitive.Portal>
      <MenuPrimitive.Content
        align={align}
        sideOffset={sideOffset}
        collisionPadding={collisionPadding}
        className={cn(
          FLOATING_PANEL,
          'max-h-(--radix-dropdown-menu-content-available-height) min-w-52 overflow-y-auto p-1.5',
          'origin-(--radix-dropdown-menu-content-transform-origin)',
          className,
        )}
        {...props}
      />
    </MenuPrimitive.Portal>
  )
}

// 44px rows; the highlighted row (pointer or keyboard) gets a tint, not only a colour change.
// Icons placed directly in an item are muted; the check indicator keeps the brand colour.
const ITEM = cn(
  'relative flex min-h-11 cursor-pointer items-center gap-3 rounded-control px-3 text-base text-ink-800 outline-none select-none',
  'transition-colors duration-150 data-highlighted:bg-ink-100 data-highlighted:text-ink-900',
  'data-disabled:cursor-not-allowed data-disabled:opacity-50',
  '[&>svg]:size-5 [&>svg]:shrink-0 [&>svg]:text-ink-500',
)

export interface DropdownMenuItemProps extends ComponentProps<typeof MenuPrimitive.Item> {
  /** `danger` for destructive actions such as «خروج» or «حذف». */
  variant?: 'default' | 'danger'
}

export function DropdownMenuItem({
  className,
  variant = 'default',
  ...props
}: DropdownMenuItemProps) {
  return (
    <MenuPrimitive.Item
      className={cn(
        ITEM,
        variant === 'danger' &&
          'text-danger data-highlighted:bg-danger/10 data-highlighted:text-danger [&>svg]:text-danger',
        className,
      )}
      {...props}
    />
  )
}

/** The check sits in a fixed slot at the start, so labels line up with and without it. */
function Indicator() {
  return (
    <span className="grid size-5 shrink-0 place-items-center">
      <MenuPrimitive.ItemIndicator>
        <Check className="size-4 text-brand-700" strokeWidth={2.5} />
      </MenuPrimitive.ItemIndicator>
    </span>
  )
}

export function DropdownMenuCheckboxItem({
  className,
  children,
  ...props
}: ComponentProps<typeof MenuPrimitive.CheckboxItem>) {
  return (
    <MenuPrimitive.CheckboxItem className={cn(ITEM, className)} {...props}>
      <Indicator />
      {children}
    </MenuPrimitive.CheckboxItem>
  )
}

export function DropdownMenuRadioItem({
  className,
  children,
  ...props
}: ComponentProps<typeof MenuPrimitive.RadioItem>) {
  return (
    <MenuPrimitive.RadioItem className={cn(ITEM, className)} {...props}>
      <Indicator />
      {children}
    </MenuPrimitive.RadioItem>
  )
}

export function DropdownMenuLabel({
  className,
  ...props
}: ComponentProps<typeof MenuPrimitive.Label>) {
  return (
    <MenuPrimitive.Label
      className={cn('px-3 pt-2 pb-1 text-sm font-medium text-ink-500', className)}
      {...props}
    />
  )
}

export function DropdownMenuSeparator({
  className,
  ...props
}: ComponentProps<typeof MenuPrimitive.Separator>) {
  return (
    <MenuPrimitive.Separator
      className={cn('-mx-1.5 my-1.5 h-px bg-ink-100', className)}
      {...props}
    />
  )
}
