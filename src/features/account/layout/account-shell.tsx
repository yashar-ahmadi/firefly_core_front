import type { ReactNode } from 'react'
import { CONTAINER } from '@/components/layout/container'
import { cn } from '@/components/ui/cn'
import { AccountHeader } from './account-header'
import { AccountNav } from './account-nav'

/**
 * The account area around its pages (inside the shop shell's `<main>`). From lg two columns:
 * the account card at the start (who is signed in, then the navigation; sticky under the
 * header) and the page at the end. Below lg the page alone: the dashboard is the hub (it lists
 * the navigation as large rows) and every other page starts with a link back to it
 * (`AccountPageHeader`). Server-rendered markup around client leaves.
 */
export function AccountShell({ children }: { children: ReactNode }) {
  return (
    <div className={cn(CONTAINER, 'pt-4 pb-8 md:pt-6 lg:pt-8 lg:pb-12')}>
      <div className="lg:grid lg:grid-cols-[17.5rem_minmax(0,1fr)] lg:items-start lg:gap-8">
        <div className="hidden transition-[top] duration-200 lg:sticky lg:top-[calc(var(--header-offset)+1rem)] lg:block">
          <div className="rounded-card bg-white p-3 shadow-card">
            <AccountHeader className="px-2 pt-2 pb-4" />
            <div aria-hidden className="mx-2 mb-3 h-px bg-ink-100" />
            <AccountNav variant="sidebar" />
          </div>
        </div>
        <div className="min-w-0">{children}</div>
      </div>
    </div>
  )
}
