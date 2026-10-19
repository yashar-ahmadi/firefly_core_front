import { clearPlacementKey } from '@/features/checkout/idempotency'
import { PLACED_KEY } from '@/features/checkout/placed/last-placed'
import { forgetSessionPayments } from '@/features/payment/pending-payments'
import { purgeOfflinePages } from '@/features/pwa/purge-offline-pages'
import { writeText } from '@/lib/store/json-storage'

// What a logout forgets on this device besides the session and its queries (Plan 4 final fix
// wave; a shared device): the pending payments saved while signed in (their uuids are bearer
// credentials, kept up to a week for the way back from a bank; a guest's own stay), this tab's
// last placed order (`ff-checkout-placed`: the checkout would show it to the tab's next visitor
// for half an hour) and the placement key (sessionStorage and the tab's copy). Other tabs keep
// their own sessionStorage. The service worker forgets the pages it keeps for offline use
// (anonymous copies: nothing of the visitor's is in them; Plan 5 Task 6). Never throws.

export function forgetSignedInStorage(): void {
  forgetSessionPayments()
  writeText('session', PLACED_KEY, null)
  clearPlacementKey()
  purgeOfflinePages()
}
