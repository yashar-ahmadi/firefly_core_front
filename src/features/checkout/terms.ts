import 'server-only'
import { richContentHtml } from '@/features/content/rich-content-html'
import type { SiteSettings } from '@/lib/api/types/settings'
import type { CheckoutTerms } from './terms-checks'

/**
 * The operator's checkout sentences (`accept_terms_text`, `confirm_legal_age`: operator HTML,
 * auth-settings digest §1), sanitised on the server with relative media made absolute and every
 * web link opening in a new tab (following one must not lose the checkout); null when there is
 * none, or nothing visible is left.
 */
export function checkoutTerms(settings: SiteSettings | null): CheckoutTerms {
  const safe = (html: string | null | undefined) =>
    html?.trim() ? richContentHtml(html, { linksInNewTab: true }) : null
  return { accept: safe(settings?.accept_terms_text), legalAge: safe(settings?.confirm_legal_age) }
}
