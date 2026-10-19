// Pictures as scroll regions, for sanitised HTML whose wide pictures keep their own width on phones
// (a content page's `full_width` layout: rich-content.css, `.rich-content-wide`). Pure.

/**
 * A span (phrasing content: it may sit inside the paragraph holding the picture) that is a
 * focusable, labelled region, as each table's wrapper is: the keyboard can scroll it, and a screen
 * reader names it.
 */
export const IMAGE_WRAP = '<span class="image-wrap" role="region" tabindex="0" aria-label="تصویر">'

/** A link's start and end tags, and a picture, in sanitised (re-serialised) markup. */
const TOKENS = /<a(?=[\s>])|<\/a>|<img\b[^>]*>/g

/**
 * `html` with each picture outside a link wrapped in `IMAGE_WRAP`. A picture inside a link is left
 * alone: a focusable region there would nest one interactive element in another (the link takes
 * the focus instead). Only for sanitiser output, which escapes `<` and `>` in text and attribute
 * values, so every match is a real tag.
 */
export function wrapImages(html: string): string {
  let linkDepth = 0
  return html.replace(TOKENS, (token) => {
    if (token === '</a>') {
      linkDepth = Math.max(0, linkDepth - 1)
      return token
    }
    if (token === '<a') {
      linkDepth += 1
      return token
    }
    return linkDepth > 0 ? token : `${IMAGE_WRAP}${token}</span>`
  })
}
