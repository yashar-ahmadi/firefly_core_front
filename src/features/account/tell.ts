import { announce } from '@/components/ui/live-announcer'
import { notify, toastRegionReady, type NotifyOptions } from '@/components/ui/toaster'

/**
 * Says what an account write did, once: in a toast, read out by the toaster's region when it is
 * on the page, else by the shell's (the first toast creates the region along with itself, which
 * a screen reader can miss). A done write is a success; news that is not (it was gone already) is
 * information.
 */
export function tell(
  message: string,
  tone: 'success' | 'info' = 'success',
  options?: NotifyOptions,
): void {
  const heard = toastRegionReady()
  if (options) notify[tone](message, options)
  else notify[tone](message)
  if (!heard) announce(message)
}
