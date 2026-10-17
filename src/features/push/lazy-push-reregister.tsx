'use client'

import dynamic from 'next/dynamic'
import { useEffect, useSyncExternalStore } from 'react'
import { useOptionalStoreConfig } from '@/lib/config-context'
import { useSession } from '@/lib/session/session-context'
import { clearPushState, readPushState } from './push-storage'

/** The re-register effect, in its own chunk. It renders nothing, so nothing stands in for it. */
const PushReregister = dynamic(
  () => import('./push-reregister').then((module) => module.PushReregister).catch(() => () => null),
  { ssr: false },
)

const noSubscription = () => () => {}

/** Whether this browser has web push on (a stored registration); false on the server. */
function usePushOn(): boolean {
  return useSyncExternalStore(
    noSubscription,
    () => readPushState() !== null,
    () => false,
  )
}

/**
 * Web push's re-register effect (`PushReregister`), its code downloaded only where it can do
 * something: a shop with push (the shop layout renders this for one only), a browser with push
 * on (a stored registration: `push-storage.ts` is in every page's bundle already) and a session.
 * Everyone else, guests first, downloads none of it. A registration left behind while signed out
 * (a session that ended unseen) is forgotten here, without the chunk.
 */
export function LazyPushReregister() {
  const firebase = useOptionalStoreConfig()?.firebase ?? null
  const { hasSession } = useSession()
  const pushOn = usePushOn()
  useEffect(() => {
    if (firebase && !hasSession && readPushState()) clearPushState()
  }, [firebase, hasSession])
  return firebase && hasSession && pushOn ? <PushReregister /> : null
}
