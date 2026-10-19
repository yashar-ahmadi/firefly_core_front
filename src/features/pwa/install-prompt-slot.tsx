import { shopName } from '@/features/seo/shop-name'
import { InstallPromptGate } from './install-prompt-gate'

/**
 * The install prompt's place in the shop layout (FEATURE_PWA): the gate, with the shop's name
 * read on the server (the settings are cached for the request: the root layout read them).
 */
export async function InstallPromptSlot() {
  return <InstallPromptGate name={await shopName()} />
}
