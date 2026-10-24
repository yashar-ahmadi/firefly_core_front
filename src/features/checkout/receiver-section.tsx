'use client'

import { useFeature } from '@/features/settings/feature-context'
import { AddressPicker, GuestReceiverForm } from './lazy-steps'
import { LoginPrompt } from './login-prompt'
import type { Checkout } from './use-checkout'

// «گیرنده و آدرس» (spec §8.7.1): a signed-in shopper picks among their saved addresses; a guest
// fills the receiver form while the shop takes guest orders (`guest_checkout`), else is asked to
// log in (the cart is kept through the login's merge). The picker and the form are code loaded
// when the step opens (lazy-steps.tsx).

export function ReceiverSection({ checkout }: { checkout: Checkout }) {
  const guestCheckout = useFeature('guest_checkout')
  // The book's default posted for the shopper on arrival (use-auto-choices) is behind the page's
  // skeleton (checkout-page.tsx): the picker's code loads only if they are asked after all.
  if (checkout.signedIn) return <AddressPicker checkout={checkout} />
  if (!guestCheckout.enabled) return <LoginPrompt />
  return <GuestReceiverForm checkout={checkout} />
}
