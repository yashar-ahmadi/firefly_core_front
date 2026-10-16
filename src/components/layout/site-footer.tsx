import type { ReactNode } from 'react'
import { storeName } from '@/app/_shell/metadata'
import { cn } from '@/components/ui/cn'
import { getStoreConfig } from '@/config/store-config'
import { getMenu, getSiteSettings, getSocials, getTranslations } from '@/features/settings/api'
import { renderSnippetHtmlZone } from '@/features/settings/snippets'
import { sanitizeOperatorHtml } from '@/lib/html/sanitize'
import { htmlToText } from '@/lib/html/to-text'
import { createTranslator } from '@/lib/i18n/translator'
import { AppBadges, appBadges } from './app-badges'
import { BackToTop } from './back-to-top'
import { ContactBlock } from './contact-block'
import { CONTAINER } from './container'
import { FooterMenu } from './footer-menu'
import { FOOTER_HEADING } from './footer-styles'
import { SocialLinks } from './social-links'
import { StoreLogo } from './store-logo'

/** Each seal (one snippet's HTML) sits on its own white tile; images are kept to badge size. */
const TRUST_ZONE = cn(
  'mt-4 flex flex-wrap items-center gap-2',
  '[&>div]:grid [&>div]:min-h-20 [&>div]:min-w-20 [&>div]:place-items-center [&>div]:rounded-control',
  '[&>div]:border [&>div]:border-ink-200 [&>div]:bg-white [&>div]:p-2',
  '[&_img]:h-auto [&_img]:max-h-24 [&_img]:w-auto [&_img]:max-w-32',
)

function TrustBadges({ zone, title }: { zone: ReactNode; title: string }) {
  return (
    <section aria-labelledby="footer-trust">
      <h2 id="footer-trust" className={FOOTER_HEADING}>
        {title}
      </h2>
      {zone}
    </section>
  )
}

/**
 * The shop footer (a Server Component; the accordion, social logos and back-to-top button are
 * client leaves).
 *
 * - Top: logo (`logo2`, else `logo`, else the name) and «بازگشت به بالا»; the slogan and the
 *   operator's `footer` HTML (sanitised, `/media` made absolute).
 * - The contact card: phones, email, address, response time (side by side on wide screens).
 * - `menu/footer` columns (an accordion on phones), then socials, app badges and the trust
 *   badges: the visible HTML of the `bottom_of_body`/`outside_of_body` snippets (eNamad and
 *   similar seals; their scripts run from the end of <body>).
 * - Bottom bar: the copyright as plain text.
 *
 * The visual order is the reading and tab order at every width; on phones contact comes before
 * the menu. Null settings hide their parts, so an unreachable API still gives a tidy footer.
 */
export async function SiteFooter() {
  const [settings, menu, socials, translations, trustZone] = await Promise.all([
    getSiteSettings(),
    getMenu('footer'),
    getSocials(),
    getTranslations(),
    renderSnippetHtmlZone('bottom', TRUST_ZONE),
  ])
  const config = getStoreConfig()
  const t = createTranslator(translations)
  const name = storeName(config, settings)
  const slogan = settings?.slogan?.trim() ?? ''
  const about = sanitizeOperatorHtml(settings?.footer ?? '', config.apiUrl, {
    siteUrl: config.siteUrl,
  })
  const hasAbout = htmlToText(about) !== '' || about.includes('<img')
  const copyright = htmlToText(settings?.copyright)
  const badges = settings ? appBadges(settings, t) : []
  const extras = [
    socials.length > 0 && <SocialLinks key="socials" socials={socials} title={t('follow_us')} />,
    badges.length > 0 && <AppBadges key="apps" badges={badges} title={t('download_app')} />,
    trustZone && <TrustBadges key="trust" zone={trustZone} title={t('trust_badges')} />,
  ].filter(Boolean)

  return (
    <footer className="border-t border-ink-200 bg-white">
      <div className={cn(CONTAINER, 'pt-8 pb-10 lg:pt-12 lg:pb-14')}>
        <div className="flex items-center justify-between gap-4">
          <StoreLogo
            src={settings?.logo2 ?? null}
            fallbackSrc={settings?.logo ?? null}
            name={name}
            priority={false}
          />
          <BackToTop />
        </div>

        {(slogan || hasAbout) && (
          <div className="mt-4 max-w-3xl">
            {slogan && <p className="text-base font-bold text-ink-800">{slogan}</p>}
            {hasAbout && (
              <div
                className="rich-content mt-1 text-base leading-8 text-ink-600"
                dangerouslySetInnerHTML={{ __html: about }}
              />
            )}
          </div>
        )}

        {settings && <ContactBlock settings={settings} t={t} className="mt-8" />}

        {(menu.length > 0 || extras.length > 0) && (
          <div className="mt-10 grid gap-10 lg:grid-cols-12 lg:gap-12">
            <div className="lg:col-span-7">
              <FooterMenu items={menu} t={t} />
            </div>
            {extras.length > 0 && (
              <div className="flex flex-wrap content-start gap-x-12 gap-y-8 lg:col-span-5">
                {extras}
              </div>
            )}
          </div>
        )}
      </div>

      {copyright && (
        <div className="border-t border-ink-200 bg-ink-50">
          <p className={cn(CONTAINER, 'py-4 text-center text-sm leading-6 text-ink-600')}>
            {copyright}
          </p>
        </div>
      )}
    </footer>
  )
}
