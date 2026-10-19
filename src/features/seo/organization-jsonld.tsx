import { storeName, storeSlogan } from '@/app/_shell/metadata'
import { getStoreConfig } from '@/config/store-config'
import { JsonLd } from '@/features/seo/json-ld'
import { siteJsonLd } from '@/features/seo/site-json-ld'
import { getSiteSettings, getSocials } from '@/features/settings/api'

/**
 * The shop's Organization and WebSite JSON-LD (`site-json-ld.ts`), for the home page: from the
 * settings and the social profiles, both read once per request (the layout and the footer read
 * the same, React-cached), written escaped (`JsonLd`). A Server Component: no client JavaScript.
 * The backend's homepage has no structured data of its own, so nothing is merged or skipped.
 */
export async function OrganizationJsonLd() {
  const config = getStoreConfig()
  const [settings, socials] = await Promise.all([getSiteSettings(), getSocials()])
  return (
    <JsonLd
      data={siteJsonLd({
        name: storeName(config, settings),
        slogan: storeSlogan(settings),
        siteUrl: config.siteUrl,
        logo: settings?.logo,
        phone: settings?.phone,
        email: settings?.email,
        socials,
      })}
    />
  )
}
