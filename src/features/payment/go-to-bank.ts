import type { RedirectPayload } from '@/lib/api/types/payment'
import { loadPage } from '@/lib/navigation/hard-navigation'
import { bankUrl, UnsafeHandoffError } from './handoff-url'

/**
 * Sends the browser to the bank exactly as order digest §5.4 says: a GET handoff loads the
 * gateway's URL with its params set in the query (BMI's `Token`); a POST one builds a form of
 * hidden fields (Mellat's `RefId`, SEP's `Token`) and submits it. The page has saved the pending
 * payment before calling this. Loaded only after the shopper's click (a lazy chunk). A URL that
 * is no bank's (`bankUrl`: not https) throws `UnsafeHandoffError` before anything happens: it is
 * never given to `location` nor to a form's `action`.
 */
export function goToBank(handoff: RedirectPayload): void {
  const target = bankUrl(handoff.url)
  if (!target) throw new UnsafeHandoffError()
  if (handoff.method === 'GET') {
    for (const [key, value] of Object.entries(handoff.params)) target.searchParams.set(key, value)
    loadPage(target.toString())
    return
  }
  const form = document.createElement('form')
  form.method = 'POST'
  form.action = target.href
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
