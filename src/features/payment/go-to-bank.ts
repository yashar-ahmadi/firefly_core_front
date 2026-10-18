import type { RedirectPayload } from '@/lib/api/types/payment'
import { loadPage } from '@/lib/navigation/hard-navigation'

/**
 * Sends the browser to the bank exactly as order digest §5.4 says: a GET handoff loads the
 * gateway's URL with its params set in the query (BMI's `Token`); a POST one builds a form of
 * hidden fields (Mellat's `RefId`, SEP's `Token`) and submits it. The page has saved the pending
 * payment before calling this. Loaded only after the shopper's click (a lazy chunk).
 */
export function goToBank(handoff: RedirectPayload): void {
  if (handoff.method === 'GET') {
    const url = new URL(handoff.url)
    for (const [key, value] of Object.entries(handoff.params)) url.searchParams.set(key, value)
    loadPage(url.toString())
    return
  }
  const form = document.createElement('form')
  form.method = 'POST'
  form.action = handoff.url
  for (const [key, value] of Object.entries(handoff.params)) {
    const input = document.createElement('input')
    input.type = 'hidden'
    input.name = key
    input.value = value
    form.appendChild(input)
  }
  document.body.appendChild(form)
  form.submit()
}
