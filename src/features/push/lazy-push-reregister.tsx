'use client'

import dynamic from 'next/dynamic'

/**
 * The re-register effect (`PushReregister`), its code loaded in the browser only where it is
 * rendered: the shop layout renders it for a shop with web push only, so the others ship none of
 * it. It renders nothing, so nothing stands in while it loads or when it cannot.
 */
export const LazyPushReregister = dynamic(
  () => import('./push-reregister').then((module) => module.PushReregister).catch(() => () => null),
  { ssr: false },
)
