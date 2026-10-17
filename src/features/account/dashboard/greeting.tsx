'use client'

import { Skeleton } from '@/components/ui/skeleton'
import { profileFirstName } from '@/features/auth/profile-display'
import { useMe } from '@/features/auth/use-me'

const SUBTITLE = 'خلاصه\u{0654} حساب، سفارش‌ها و خریدهای اخیرتان اینجاست.'

/**
 * The dashboard's heading: «سلام سارا» (the first name; «سلام» alone without one). While the
 * profile loads, «سلام» and a bar where the name goes, on the same line: nothing moves.
 */
export function DashboardGreeting() {
  const { data: me, isPending } = useMe()
  const first = me ? profileFirstName(me) : null
  return (
    <div>
      <h1 className="flex items-center gap-2 text-xl leading-9 font-bold text-ink-900 md:text-2xl md:leading-10">
        {first ? `سلام ${first}` : 'سلام'}
        {isPending && <Skeleton className="h-6 w-20" />}
      </h1>
      <p className="text-base leading-7 text-ink-600">{SUBTITLE}</p>
    </div>
  )
}
