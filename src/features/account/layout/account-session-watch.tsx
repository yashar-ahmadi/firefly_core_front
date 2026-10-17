'use client'

import { SessionSweepAction } from '@/lib/session/session-sweep-action'

/**
 * An account page that is back on screen after its session ended, set right when it mounts.
 * Neither the proxy nor the account layout sees it: Back (or Forward) shows the page Next
 * cached. Every session query is off once the tab has no session, so the page would keep its
 * skeletons forever, or the previous visitor's addresses and contact details.
 *
 * The page is checked against the session flag cookie as the shop-wide sweep checks a tab coming
 * back (`SessionSweepAction`, src/app/providers.tsx: a session ended elsewhere ends here with
 * login in the page's place; a login elsewhere is taken, once; another visitor's login loads the
 * page again), plus the account area's own case: no session and no cookie (a logout or a session
 * end here, then Back), login replaces the page, with it as `next`. A tab coming back is the
 * sweep's alone.
 */
export function AccountSessionWatch() {
  return <SessionSweepAction accountPage />
}
