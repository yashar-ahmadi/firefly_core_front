import { EyeOff } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '@/components/ui/cn'

/**
 * Above a staff preview of something unpublished (a draft post or page, read with a staff
 * token): says so, as a status. The page around it is noindex and never cached.
 */
export function PreviewBar({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <p
      role="status"
      className={cn(
        'mb-3 flex items-center gap-2 rounded-control bg-warning/10 px-4 py-3 text-base font-medium text-warning',
        className,
      )}
    >
      <EyeOff aria-hidden className="size-5 shrink-0" />
      {children}
    </p>
  )
}
