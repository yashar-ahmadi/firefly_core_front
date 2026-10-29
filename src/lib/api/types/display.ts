/**
 * What the content, product and blog digests share for the panel's «سبک نمایش» (content digest
 * §2 and §6, product digest §4.2, blog digest §5). Pure types.
 */

/**
 * One of the four designs a home section (`style`), a page block (`style`) or a category's
 * banners (`banner_style`) is drawn in. The numbering is shared, the designs are per component;
 * an unknown value is read as `style_1` (`displayStyle`).
 */
export type DisplayStyle = 'style_1' | 'style_2' | 'style_3' | 'style_4'

/**
 * A link the operator wrote: `url` a `/…` storefront path (it may carry a query) or an http(s)
 * URL, as menus; `title` its label, "" for the shop's own («مشاهدهٔ همه»).
 */
export interface OperatorLink {
  url: string
  title: string
}

/**
 * A banner of a product or blog category (`banners` of its detail): the picture never null and
 * never resized, `mobile_image` null for the same one on phones, "" for an unset title or alt.
 */
export interface CategoryBanner {
  id: number
  title: string
  image: string
  mobile_image: string | null
  alt: string
  /** null: the banner links nowhere. */
  link: OperatorLink | null
}
