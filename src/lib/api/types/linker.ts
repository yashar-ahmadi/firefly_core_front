/**
 * Wire types of the linker ("link in bio", `GET linker/`, content digest §8). Pure types: safe in
 * any bundle.
 */

/** The theme's palette; `key` is informational only (never branch on it). */
export interface LinkerTheme {
  key: string
  /** Any CSS `background`: a colour or a gradient. */
  background: string
  text_color: string
  /** May be `transparent`. */
  button_background: string
  button_text_color: string
  /** May be `transparent`. */
  button_border: string
}

interface LinkerLinkBase {
  id: number
  title: string
  value: string
  /** Absolute, or null. */
  thumbnail: string | null
}

/** Pre-filtered by the API (inactive and invalid rows dropped): never filtered again. */
export type LinkerLink =
  /** `value`: a store path (`/product/list/x/`) or an http(s) URL; `href` absolute. */
  | (LinkerLinkBase & { link_type: 'button'; href: string })
  /** As a button; an Aparat or YouTube URL is embedded. */
  | (LinkerLinkBase & { link_type: 'video'; href: string })
  /** `mailto:…`. */
  | (LinkerLinkBase & { link_type: 'email'; href: string })
  /** `tel:+98…` (E.164); `value` as typed. */
  | (LinkerLinkBase & { link_type: 'phone'; href: string })
  /** Plain text (`value`, multi-line): never HTML. */
  | (LinkerLinkBase & { link_type: 'text'; href: null })

export interface LinkerSocialLink {
  id: number
  /** One of 26 platforms (`instagram`, `telegram`…); the same one may repeat. */
  platform: string
  /** Absolute. */
  url: string
  /** An absolute, black, monochrome SVG on the API host. */
  icon: string
}

export interface LinkerData {
  /** '' while the page was never saved: the page is a 404. */
  name: string
  /** ≤ 500; '' for none. */
  bio: string
  logo: string | null
  /** The name's first letter, shown without a logo; null only while `name` is ''. */
  avatar_letter: string | null
  theme: LinkerTheme
  social_links_position: 'top' | 'bottom'
  /** The PHYSICAL side on screen (the page is RTL). */
  thumbnail_position: 'right' | 'left'
  show_footer: boolean
  rounded_edges: boolean
  links: LinkerLink[]
  social_links: LinkerSocialLink[]
}
