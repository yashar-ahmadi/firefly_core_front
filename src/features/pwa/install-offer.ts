import { DISMISSED_KEY, OFFER_KEPT } from './install-state'

// The install prompt's own state (install-prompt.tsx, its lazily loaded chunk): the browser's
// install offer the registration script kept, and the dismissal. Storage in try/catch: refused,
// the prompt still hides (it may show again on a later visit).

/** The browser's `beforeinstallprompt` event, as Chromium sends it. */
export interface InstallOffer extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

type OfferWindow = Window & { [OFFER_KEPT]?: InstallOffer }

/** The offer the registration script kept (it prompts once), or null. */
export function installOffer(): InstallOffer | null {
  return (window as OfferWindow)[OFFER_KEPT] ?? null
}

export function forgetOffer(): void {
  delete (window as OfferWindow)[OFFER_KEPT]
}

export function rememberDismissal(): void {
  try {
    localStorage.setItem(DISMISSED_KEY, '1')
  } catch {
    // Not remembered: it may show again on a later visit.
  }
}
