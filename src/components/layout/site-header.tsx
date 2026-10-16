import { storeName } from '@/app/_shell/metadata'
import { cn } from '@/components/ui/cn'
import { getStoreConfig } from '@/config/store-config'
import { getCategoryTree, getMenu, getSiteSettings, getTranslations } from '@/features/settings/api'
import { htmlToText } from '@/lib/html/to-text'
import { createTranslator } from '@/lib/i18n/translator'
import { AnnouncementBar } from './announcement-bar'
import { CategoriesDrawer } from './categories-drawer'
import { CONTAINER } from './container'
import { HeaderActions } from './header-actions'
import { HeaderLinks } from './header-links'
import { HeaderSearchForm } from './header-search-form'
import { MegaMenu } from './mega-menu'
import { navItems } from './menu-tree'
import { StoreLogo } from './store-logo'
import { SupportPhone } from './support-phone'

/**
 * The shop header (a Server Component; only its interactive leaves are client components).
 *
 * - Phones: a top bar (logo, support, cart) and a full-width search row. Scrolling down slides
 *   the top bar away and keeps the search pinned.
 * - From md: row 1 has the logo, a large centred search and the account and cart; row 2 has
 *   «دسته‌بندی‌ها» (a mega-menu from lg, a drawer on tablets), the `menu/header` links and the
 *   support number. Scrolling down tucks row 2 behind row 1.
 *
 * Compacting only moves rows (transforms): the header keeps its height in the page, so content
 * never jumps. The row heights match `--header-offset` in globals.css.
 */
export async function SiteHeader() {
  const [settings, main, headerMenu, tree, translations] = await Promise.all([
    getSiteSettings(),
    getMenu('main'),
    getMenu('header'),
    getCategoryTree(),
    getTranslations(),
  ])
  const t = createTranslator(translations)
  const name = storeName(getStoreConfig(), settings)
  // Resolved here, so the client menus receive only what they show: the `main` menu, or the
  // category tree as menu items while that menu is empty (never both, never full category cards).
  const items = navItems(main, tree)
  const announcement = htmlToText(settings?.announcement)
  const phone = settings?.phone?.trim() || null
  const phoneLabels = { label: t('support'), iconLabel: t('phone_support') }

  return (
    <>
      {announcement && <AnnouncementBar text={announcement} />}
      <header
        className={cn(
          'pointer-events-none sticky top-0 z-40 transition-transform duration-200 ease-out',
          'max-md:has-[[data-topbar]_:focus-visible]:translate-y-0 max-md:compact:-translate-y-14',
        )}
      >
        <div data-topbar="" className="pointer-events-auto relative z-10 bg-white">
          <div
            className={cn(
              CONTAINER,
              'flex h-14 items-center justify-between gap-3',
              'md:grid md:h-18 md:grid-cols-[auto_minmax(0,1fr)_auto] md:gap-6',
              'lg:grid-cols-[1fr_minmax(0,40rem)_1fr] lg:gap-8',
            )}
          >
            <StoreLogo src={settings?.logo ?? null} name={name} className="justify-self-start" />
            <HeaderSearchForm className="hidden md:flex" />
            <div className="flex items-center gap-1 justify-self-end">
              {phone && (
                <SupportPhone variant="icon" phone={phone} {...phoneLabels} className="md:hidden" />
              )}
              <HeaderActions />
            </div>
          </div>
        </div>

        <div className="pointer-events-auto border-b border-ink-200 bg-white transition-shadow md:hidden scrolled:shadow-md">
          <div className={cn(CONTAINER, 'flex h-14 items-center')}>
            <HeaderSearchForm size="md" overlay className="flex-1" />
          </div>
        </div>

        <div
          className={cn(
            'pointer-events-auto relative hidden border-b border-ink-200 bg-white md:block',
            'transition-[translate,box-shadow] duration-200 ease-out scrolled:shadow-md',
            'has-focus-visible:translate-y-0 compact:-translate-y-full',
          )}
        >
          <nav
            aria-label={t('main_navigation')}
            className={cn(CONTAINER, 'flex h-12 items-center gap-2')}
          >
            <MegaMenu items={items} className="hidden lg:flex" />
            <CategoriesDrawer items={items} className="lg:hidden" />
            {headerMenu.length > 0 && <span aria-hidden className="h-5 w-px shrink-0 bg-ink-200" />}
            <HeaderLinks items={headerMenu} className="flex-1" />
            {phone && <SupportPhone phone={phone} {...phoneLabels} className="ms-auto" />}
          </nav>
        </div>
      </header>
    </>
  )
}
