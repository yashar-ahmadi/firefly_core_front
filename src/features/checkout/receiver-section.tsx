'use client'

import { useFeature } from '@/features/settings/feature-context'
import { AddressPicker } from './address-picker'
import { GuestReceiverForm } from './guest-receiver-form'
import { LoginPrompt } from './login-prompt'
import type { Checkout } from './use-checkout'

// «گیرنده و آدرس» (spec §8.7.1): a signed-in shopper picks among their saved addresses; a guest
// fills the receiver form while the shop takes guest orders (`guest_checkout`), else is asked to
// log in (the cart is kept through the login's merge).

export function ReceiverSection({ checkout }: { checkout: Checkout }) {
  const guestCheckout = useFeature('guest_checkout')
  if (checkout.signedIn) return <AddressPicker checkout={checkout} />
  if (!guestCheckout.enabled) return <LoginPrompt />
  return <GuestReceiverForm checkout={checkout} />
}
