import { Hourglass, LayoutDashboard } from 'lucide-react'
import Link from 'next/link'
import { buttonClasses } from '@/components/ui/button-styles'
import { EmptyState } from '@/components/ui/empty-state'
import { AccountPageHeader } from './account-page-header'
import { ACCOUNT_HOME } from './nav-items'

/**
 * An account page a later plan builds (orders, awaiting review, the wallet: Plan 4; the reading
 * list: Plan 5), until then: its heading, a friendly «به‌زودی» and the way back to the
 * dashboard. Each placeholder route is one file that its plan replaces; this goes with the last.
 */
export function ComingSoon({ title, description }: { title: string; description: string }) {
  return (
    <>
      <AccountPageHeader title={title} />
      <EmptyState
        icon={<Hourglass />}
        title="به‌زودی"
        description={description}
        className="rounded-card bg-white py-12 shadow-card"
        action={
          <Link href={ACCOUNT_HOME} className={buttonClasses({ variant: 'outline' })}>
            <LayoutDashboard aria-hidden />
            بازگشت به پیشخوان
          </Link>
        }
      />
    </>
  )
}
