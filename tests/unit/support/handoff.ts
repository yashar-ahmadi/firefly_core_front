import userEvent from '@testing-library/user-event'
import {
  clearIdentifierHandoff,
  peekIdentifier,
  type AuthPage,
} from '@/features/auth/identifier-handoff'

// The identifier handoff between the auth pages (identifier-handoff.ts), for tests.

/** No handoff in this tab (a page that took one lets go of it when it unmounts). */
export function resetHandoff(): void {
  sessionStorage.clear()
  clearIdentifierHandoff()
}

/**
 * Clicks `link` as a visitor does, without the browser following it, and returns what it
 * handed to `page` ('' for nothing).
 */
export async function handedByClick(link: HTMLElement, page: AuthPage): Promise<string> {
  link.addEventListener('click', (event) => event.preventDefault(), { once: true })
  await userEvent.setup().click(link)
  return peekIdentifier(page)
}
