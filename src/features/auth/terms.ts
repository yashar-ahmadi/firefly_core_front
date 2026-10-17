import 'server-only'
import { richContentHtml } from '@/features/content/rich-content'

/**
 * The operator's terms (`accept_terms_text`, operator HTML) for under the registration button:
 * sanitised on the server, with every web link opening in a new tab (following one must not
 * lose the form), or null when nothing visible is left.
 */
export function registrationTermsHtml(html: string | null): string | null {
  return html ? richContentHtml(html, { linksInNewTab: true }) : null
}
