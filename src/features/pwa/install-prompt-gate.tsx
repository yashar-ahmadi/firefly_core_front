'use client'

import dynamic from 'next/dynamic'
import { useSyncExternalStore } from 'react'
import { MAY_OFFER_EVENT, MAY_OFFER_FLAG } from './install-flag'

/** The prompt, in its own chunk; it renders nothing until it has something to offer. */
const InstallPrompt = dynamic(
  () => import('./install-prompt').then((module) => module.InstallPrompt).catch(() => () => null),
  { ssr: false },
)

/** The registration script raises the flag as the page is parsed, or later with its event. */
function subscribe(change: () => void) {
  window.addEventListener(MAY_OFFER_EVENT, change)
  return () => window.removeEventListener(MAY_OFFER_EVENT, change)
}

const offered = () => (window as Window & { [MAY_OFFER_FLAG]?: boolean })[MAY_OFFER_FLAG] === true

/**
 * The install prompt's place (FEATURE_PWA; the shop layout renders this for such a shop only).
 * Whether this device may be offered the install is the registration script's verdict
 * (register-sw.tsx: a phone, from the second visit, never dismissed, never the installed app,
 * not landing on the visitor's own pages): the prompt's code downloads for such a device alone;
 * everyone else gets this gate and nothing more.
 */
export function InstallPromptGate({ name }: { name: string }) {
  return useSyncExternalStore(subscribe, offered, () => false) ? (
    <InstallPrompt name={name} />
  ) : null
}
