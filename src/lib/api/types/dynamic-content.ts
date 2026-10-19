// Dynamic content (auth-settings digest §7.8–7.9): message slots the operator fills in the panel,
// each a content page type (its `key`) with active items. Not pages: no URL, no sitemap.

export interface ContentPageType {
  id: number
  key: string
  title: string
  description: string | null
}

export interface DynamicContent {
  id: number
  page_type: number
  page_type_detail: ContentPageType
  content_type: 'description' | 'warning'
  /** An optional heading. */
  title: string | null
  /** Rich-text HTML from the panel: unsanitised, its relative URLs not made absolute. */
  content: string
}

/** `GET global/dynamic-content/<key>/`: the slot's items, each kind in id order. */
export interface DynamicContentGroup {
  page_type: number
  page_type_key: string
  /** The page type's title. */
  page_display_name: string
  descriptions: DynamicContent[]
  /** Shown as a distinct alert box. */
  warnings: DynamicContent[]
}
