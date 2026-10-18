'use client'

import { useFeature } from '@/features/settings/feature-context'
import { AddressPicker, GuestReceiverForm, StepLoading } from './lazy-steps'
import { LoginPrompt } from './login-prompt'
import type { Checkout } from './use-checkout'

// «گیرنده و آدرس» (spec §8.7.1): a signed-in shopper picks among their saved addresses; a guest
// fills the receiver form while the shop takes guest orders (`guest_checkout`), else is asked to
// log in (the cart is kept through the login's merge). The picker and the form are code loaded
// when the step opens (lazy-steps.tsx).

export function ReceiverSection({ checkout }: { checkout: Checkout }) {
  const guestCheckout = useFeature('guest_checkout')
  if (checkout.signedIn) {
    // The book's default being posted for the shopper (use-auto-choices): the picker's code
    // loads only if they are asked after all.
    if (checkout.autoDestination.working) {
      return <StepLoading label={'در حال انتخاب آدرس پیش\u{200C}فرض'} />
    }
    return <AddressPicker checkout={checkout} />
  }
  if (!guestCheckout.enabled) return <LoginPrompt />
  return <GuestReceiverForm checkout={checkout} />
}
