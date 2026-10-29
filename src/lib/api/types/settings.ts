/**
 * Wire types of the global endpoints (`/global/*`), menus and the category list.
 * Pure types: safe in any bundle. Shapes follow the auth-settings, content and product digests.
 */
import type { SortValue } from '@/lib/api/types/catalog/enums'
import type { FeatureKey } from '@/lib/api/types/common'

export type OtpMethod = 'email' | 'sms' | 'telegram'
export type ContactType = 'email' | 'phone'

/** The login and registration configuration; identical in `settings/` and `auth-settings/`. */
export interface AuthSettings {
  google_login_enabled: boolean
  google_client_id: string | null
  sms_otp_enabled: boolean
  telegram_otp_enabled: boolean
  /** Email is always first. */
  available_otp_methods: OtpMethod[]
  /** Does not reflect the `registration` feature switch. */
  registration_methods: ContactType[]
  /** The `phone` key is absent when neither SMS nor Telegram is on. */
  default_otp_methods: { email: 'email'; phone?: 'sms' | 'telegram' }
}

/** `GET global/settings/`. A null field means "do not render that section". */
export interface SiteSettings {
  /** '' (not null) on an unconfigured install. */
  name: string
  slogan: string | null
  /** Plain text. */
  copyright: string | null
  /** Operator HTML: sanitise and absolutise before rendering. */
  footer: string | null
  /** Operator HTML; null or '' hides the top bar. */
  announcement: string | null
  logo: string | null
  logo2: string | null
  favicon: string | null
  /**
   * The theme's primary colour from the panel, always `#rrggbb` (lowercase); null: the store's
   * own (THEME_PRIMARY, else the preset's). The storefront reads it through `panelTheme`.
   */
  primary_color: string | null
  /** The secondary colour, the theme's accent; the same format and null rule. */
  secondary_color: string | null
  /** E.164, usable in `tel:` as is. */
  phone: string | null
  phone2: string | null
  /** The sales and consultation lines (E.164), apart from support; null when unset. */
  sales_phone: string | null
  sales_phone2: string | null
  response_time: string | null
  email: string | null
  address: string | null
  postal_code: string | null
  /** A Google Maps `<iframe>` embed or a plain URL: not validated. */
  map: string | null
  accept_terms_text: string | null
  confirm_legal_age: string | null
  app_store_download_link: string | null
  ios_application_download_link: string | null
  google_play_download_link: string | null
  android_application_download_link: string | null
  web_application_link: string | null
  support_link: string | null
  auth: AuthSettings
}

/** One feature switch, as the storefront uses it. */
export interface FeatureState {
  key: FeatureKey
  /** Persian label; '' for a key the API did not return. */
  name: string
  enabled: boolean
  /** Operator text, only while disabled. */
  reason: string | null
}

/** One row of `GET global/feature-status/`. */
export interface FeatureStatusRow {
  feature_key: FeatureKey
  display_name: string
  is_enabled: boolean
  disable_reason: string | null
}

export type MenuKey = 'main' | 'header' | 'footer' | 'blog-sidebar'

export type MenuTargetType =
  'page' | 'product' | 'product_category' | 'brand' | 'product_list' | 'blog_post' | 'blog_category'

export interface MenuTarget<T extends MenuTargetType = MenuTargetType> {
  type: T
  /** Id of the target row in its own table, not the menu item id. */
  id: number
  /** The current slug; for categories only the last path segment. */
  slug: string
}

interface MenuNodeBase {
  id: number
  title: string
  open_in_new_tab: boolean
  /** Absolute API-host URL (image or SVG): render with `<img alt="">`. */
  icon: string | null
  children: MenuNode[]
}

/** `url` is always ready to use; never build a link from `target`. */
export type MenuNode =
  | (MenuNodeBase & { link_type: 'none'; url: null; target: null })
  | (MenuNodeBase & { link_type: 'url'; url: string; target: null })
  | (MenuNodeBase & { link_type: 'page'; url: string; target: MenuTarget<'page'> })
  | (MenuNodeBase & { link_type: 'product'; url: string; target: MenuTarget<'product'> })
  | (MenuNodeBase & {
      link_type: 'product_category'
      url: string
      target: MenuTarget<'product_category'>
    })
  | (MenuNodeBase & { link_type: 'brand'; url: string; target: MenuTarget<'brand'> })
  | (MenuNodeBase & { link_type: 'product_list'; url: string; target: MenuTarget<'product_list'> })
  | (MenuNodeBase & { link_type: 'blog_post'; url: string; target: MenuTarget<'blog_post'> })
  | (MenuNodeBase & {
      link_type: 'blog_category'
      url: string
      target: MenuTarget<'blog_category'>
    })

export interface Menu {
  key: string
  title: string
  items: MenuNode[]
}

export interface Social {
  id: number
  name: string
  /** Free format; may or may not include '@'. */
  username_or_id: string
  /** Absolute URL; may be SVG. */
  logo: string | null
  link: string
}

export type SnippetPosition = 'in_head' | 'top_of_body' | 'bottom_of_body' | 'outside_of_body'

export interface Snippet {
  id: number
  /** Operator note: not for display. */
  description: string
  /** Live values are the documented ones; any other string is tolerated. */
  position: SnippetPosition | (string & Record<never, never>)
  type: 'style' | 'link' | 'script' | 'meta' | (string & Record<never, never>)
  /** Raw operator code, unsanitised, usually complete HTML. */
  snippet: string
}

/** The listing sorts; `SORT_VALUES` in the catalog types is the single source. */
export type CategorySorting = SortValue

/** One row of `GET product/category/list/` (same card as the homepage category grid). */
export interface CategoryCard {
  id: number
  name: string
  slug: string
  /** "digital/mobile-phone": the link is `/product-category/{path}/`, never the slug. */
  path: string
  parent_id: number | null
  short_description: string | null
  image: string
  icon: string
  show_in_homepage: boolean
  /** The API may send '' for none. */
  default_sorting: CategorySorting | '' | null
  /** Direct published products only: parents are often 0. */
  product_count: number
  created: string
  updated: string
}

export type CategoryNode = CategoryCard & { children: CategoryNode[] }

/** `GET global/get-translation/<code>/` (the key is singular here, plural in `languages/`). */
export interface TranslationResponse {
  language_code: string
  is_rtl: boolean
  translation: Record<string, unknown> | null
}

export interface EnabledLanguage {
  language_code: string
  language_name: string | null
  /** Relative path: prefix the API origin. */
  icon: string | null
  is_rtl: boolean
  translations: Record<string, unknown> | null
}

export interface LanguagesResponse {
  default_language: string
  enabled_languages: EnabledLanguage[]
}
