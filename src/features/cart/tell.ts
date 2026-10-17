import { announce } from '@/components/ui/live-announcer'
import { notify, toastRegionReady, type NotifyOptions } from '@/components/ui/toaster'

// A confirmation of a cart page write, in a toast, and read out once: by the toaster's own live
// region when it is on the page already, else through the shell's (the first toast creates the
// toaster's region along with itself, which a screen reader can miss).

export function tell(message: string, options?: NotifyOptions): void {
  const heard = toastRegionReady()
  if (options) notify.success(message, options)
  else notify.success(message)
  if (!heard) announce(message)
}
