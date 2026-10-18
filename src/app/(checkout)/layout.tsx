import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import { storeName } from '@/app/_shell/metadata'
import { CheckoutFooter } from '@/components/layout/checkout-footer'
import { CheckoutHeader } from '@/components/layout/checkout-header'
import { ShellFrame } from '@/components/layout/shell-frame'
import { getStoreConfig } from '@/config/store-config'
import { getMenu, getSiteSettings, getTranslations } from '@/features/settings/api'
import { renderSnippetHtmlZone } from '@/features/settings/snippets'
import { createTranslator } from '@/lib/i18n/translator'

// The checkout's pages (ruling P4-R3; Plan 4: `/checkout/` and the payment pages are noindex and
// dynamic): per visitor, never cached, never indexed. No loading.tsx (R9).
export const dynamic = 'force-dynamic'

export const metadata: Metadata = { robots: { index: false, follow: true } }

/**
 * A quiet frame for buying: the shell's non-navigational hosts (the navigation progress bar, the
 * polite live region, `<main id="main">` for the root layout's skip link; `ShellFrame`), a header
 * with only the logo, «خرید امن» and the way back to the cart, and a footer with the support
 * line and the legal links, then the operator's bottom HTML zone (trust seals). No mega menu,
 * search, bottom navigation, compare bar or quick view: the page's own lazily loaded parts sit
 * in their own WidgetBoundary.
 */
export default async function CheckoutLayout({ children }: { children: ReactNode }) {
  const [settings, menu, translations, trust] = await Promise.all([
    getSiteSettings(),
    getMenu('footer'),
    getTranslations(),
    // The operator's trust seals (the root layout leaves the bottom zone to the frames).
    renderSnippetHtmlZone('bottom'),
  ])
  const t = createTranslator(translations)
  return (
    <ShellFrame
      header={
        <CheckoutHeader
          logo={settings?.logo ?? null}
          name={storeName(getStoreConfig(), settings)}
        />
      }
      footer={
        <>
          <CheckoutFooter
            phone={settings?.phone?.trim() || null}
            responseTime={settings?.response_time?.trim() || null}
            menu={menu}
            labels={{ support: t('support'), phoneSupport: t('phone_support') }}
          />
          {trust}
        </>
      }
    >
      {children}
    </ShellFrame>
  )
}
