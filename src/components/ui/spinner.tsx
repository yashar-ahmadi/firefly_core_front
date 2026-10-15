import { LoaderCircle } from 'lucide-react'
import { cn } from './cn'

export type SpinnerSize = 'sm' | 'md' | 'lg'

const SIZES: Record<SpinnerSize, string> = {
  sm: 'size-4',
  md: 'size-5',
  lg: 'size-8',
}

export interface SpinnerProps {
  size?: SpinnerSize
  /** When given, the spinner is announced as a status with this text; otherwise it is decorative. */
  label?: string
  className?: string
}

/** A spinning loader in the current text colour. Reduced motion keeps it still. */
export function Spinner({ size = 'md', label, className }: SpinnerProps) {
  const icon = (
    <LoaderCircle
      aria-hidden
      className={cn('shrink-0 animate-spin', SIZES[size], !label && className)}
    />
  )
  if (!label) return icon
  return (
    <span role="status" className={cn('inline-flex items-center', className)}>
      {icon}
      <span className="sr-only">{label}</span>
    </span>
  )
}
