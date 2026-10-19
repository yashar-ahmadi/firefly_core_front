/**
 * Wire types of the help centre (`GET faq/category/list/`, blog-faq digest §2). Pure types: safe
 * in any bundle.
 */

export interface FaqItem {
  /** Unique across the help centre: the question's anchor (`#faq-<id>`). */
  id: number
  /** Plain text, may hold line breaks: escaped, shown with `white-space: pre-line`. */
  question: string
  /**
   * CKEditor HTML, NOT sanitised by the API, with `/media/…` URLs left relative (or plain text
   * without tags): always sanitised and treated as HTML.
   */
  answer: string
  created: string
  updated: string
}

/** One category, its visible questions in creation order (`items` is never paginated). */
export interface FaqCategory {
  /** The stable key: names are not unique. */
  id: number
  name: string
  /** Always an array; `[]` for a category whose questions are all hidden. */
  items: FaqItem[]
  created: string
  /** The category row's own: question edits do not bump it. */
  updated: string
}
