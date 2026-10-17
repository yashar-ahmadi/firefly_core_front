import { vi } from 'vitest'

/**
 * Spies on the native history API, which the account lists write their URL with (`useListUrl`):
 * the URLs replaced and pushed so far, in order. Call it after `vi.clearAllMocks()`.
 */
export function spyOnHistory() {
  const replace = vi.spyOn(window.history, 'replaceState')
  const push = vi.spyOn(window.history, 'pushState')
  const urls = (spy: typeof replace) => spy.mock.calls.map(([, , url]) => String(url))
  return { replaced: () => urls(replace), pushed: () => urls(push) }
}
