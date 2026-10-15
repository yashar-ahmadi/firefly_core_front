import { Slot } from 'radix-ui'
import type { ComponentProps } from 'react'
import { cn } from './cn'

export type CardVariant = 'elevated' | 'flat' | 'outline'

const VARIANTS: Record<CardVariant, string> = {
  elevated: 'shadow-card',
  flat: '',
  outline: 'border border-ink-200',
}

export interface CardProps extends ComponentProps<'div'> {
  variant?: CardVariant
  /** Lifts on hover, for cards that are links. */
  interactive?: boolean
  /** Render the single child (e.g. `<article>` or a link) with the card styles. */
  asChild?: boolean
}

/** A white rounded surface. Compose with CardHeader, CardTitle, CardContent and CardFooter. */
export function Card({
  variant = 'elevated',
  interactive,
  asChild,
  className,
  ...props
}: CardProps) {
  const Comp = asChild ? Slot.Root : 'div'
  return (
    <Comp
      className={cn(
        'block overflow-hidden rounded-card bg-white text-ink-900',
        VARIANTS[variant],
        interactive &&
          'transition-[box-shadow,transform] duration-200 ease-out hover:shadow-raised motion-safe:hover:-translate-y-0.5',
        className,
      )}
      {...props}
    />
  )
}

export function CardHeader({ className, ...props }: ComponentProps<'div'>) {
  return <div className={cn('flex flex-col gap-1 p-4 pb-0 sm:p-5 sm:pb-0', className)} {...props} />
}

export function CardTitle({ className, ...props }: ComponentProps<'h3'>) {
  return <h3 className={cn('text-lg leading-8 font-bold text-ink-900', className)} {...props} />
}

export function CardDescription({ className, ...props }: ComponentProps<'p'>) {
  return <p className={cn('text-base text-ink-600', className)} {...props} />
}

export function CardContent({ className, ...props }: ComponentProps<'div'>) {
  return <div className={cn('p-4 sm:p-5', className)} {...props} />
}

export function CardFooter({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div className={cn('flex items-center gap-3 p-4 pt-0 sm:p-5 sm:pt-0', className)} {...props} />
  )
}
