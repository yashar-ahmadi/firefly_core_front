import 'server-only'
import sanitizeHtml from 'sanitize-html'
import { headingIdFilter, withHeadingIds } from '@/lib/html/heading-ids'
import { wrapImages } from '@/lib/html/image-regions'
import { asParsed } from '@/lib/links/as-parsed'

/**
 * Operator HTML (the footer text, FAQ answers, dynamic content) made safe to render with
 * `dangerouslySetInnerHTML`. Server only: the parser is not shipped to the browser.
 *
 * Built on sanitize-html (an allow-list over the htmlparser2 parser), so markup is parsed the way
 * a browser would parse it before anything is kept; the output is re-serialised, never the
 * input patched. Allowed: text formatting, headings (h1 becomes h2: the page has its own h1),
 * lists, quotes, tables, links and images. Everything else is dropped:
 * - scripts, styles, iframes, objects, svg, math, forms and templates, with their content;
 * - event handlers, `style`, `class`, `id` (but a blog post's heading ids: `headingIds`) and any
 *   other attribute not listed below;
 * - URLs other than http(s), mailto and tel (images: http(s) only), so no `javascript:` or
 *   `data:`, however they are encoded.
 * And rewritten:
 * - `/media/...` and `/static/...` links and images point at the API origin;
 * - links that leave the shop (or, with `linksInNewTab`, every web link) open in a new tab with
 *   `rel="noopener noreferrer"`;
 * - images load lazily and get `alt=""` when the operator gave none; images without a usable
 *   source are dropped;
 * - each table is wrapped in a focusable, labelled scroll region (`.table-wrap`), and with
 *   `wideImages` each picture outside a link too (`.image-wrap`).
 */

export interface SanitizeOptions {
  /** The storefront's own origin: absolute links to it stay in the same tab. */
  siteUrl?: string
  /**
   * Every web link opens in a new tab (`mailto:` and `tel:` aside), for text shown beside a form
   * that following a link would lose (the terms under the registration button).
   */
  linksInNewTab?: boolean
  /**
   * The ids the API put on the content's headings (a blog post's `headings`, its table of
   * contents' anchors): kept on headings only, each on its first heading, never one of the
   * page's own (`RESERVED_IDS`); every other id dropped as usual (`headingIdFilter`).
   */
  headingIds?: ReadonlySet<string>
  /**
   * Each picture outside a link is wrapped in a focusable, labelled scroll region
   * (`.image-wrap`, `image-regions.ts`), as each table is: for a content page's `full_width`
   * layout, where a wide picture keeps its own width on phones and scrolls in its own box.
   */
  wideImages?: boolean
}

/** Tags kept (others are dropped, their text kept unless listed in NON_TEXT_TAGS). */
const ALLOWED_TAGS = [
  // Text
  ...'p br hr div span h2 h3 h4 h5 h6 blockquote pre'.split(' '),
  ...'strong b em i u s del ins mark small sub sup abbr bdi bdo cite code kbd q'.split(' '),
  // Lists, links, media and tables
  ...'ul ol li dl dt dd a img figure figcaption'.split(' '),
  ...'table caption colgroup col thead tbody tfoot tr th td'.split(' '),
]

/** Removed together with their content: nothing inside them is text a visitor should read. */
const NON_TEXT_TAGS = [
  ...'script style noscript template title head'.split(' '),
  ...'iframe object embed svg math textarea select option'.split(' '),
]

const ALLOWED_ATTRIBUTES: Record<string, string[]> = {
  '*': ['dir', 'lang', 'title'],
  a: ['href', 'target', 'rel'],
  img: ['src', 'alt', 'width', 'height', 'loading', 'decoding'],
  ol: ['start', 'reversed', 'type'],
  th: ['colspan', 'rowspan', 'scope'],
  td: ['colspan', 'rowspan'],
  col: ['span'],
  colgroup: ['span'],
}

/** Attributes kept only with one of these values (any tag); `target` is decided per link. */
const ATTRIBUTE_VALUES: Record<string, readonly string[]> = {
  dir: ['rtl', 'ltr', 'auto'],
  scope: ['row', 'col', 'rowgroup', 'colgroup'],
  type: ['1', 'a', 'A', 'i', 'I'],
}

/** Link relations an operator may set; `noopener noreferrer` is added to every new-tab link. */
const REL_TOKENS = new Set(['nofollow', 'sponsored', 'ugc'])
const MEDIA_PATH = /^\/(?:media|static)\//
const MAIL_OR_PHONE = /^(?:mailto|tel):/i
const ABSOLUTE = /^(?:[a-z][a-z\d+.-]*:)?\/\//i
const TABLE_OPEN = /<table(?=[\s>])/g
const TABLE_CLOSE = /<\/table>/g
const TABLE_WRAP = '<div class="table-wrap" role="region" tabindex="0" aria-label="جدول">'

function originOf(url: string | undefined): string | null {
  if (!url) return null
  try {
    return new URL(url).origin
  } catch {
    return null
  }
}

/** `/media/x.png` on the API origin; anything else as written. */
function absolutize(value: string | undefined, apiOrigin: string | null): string | undefined {
  if (value === undefined || apiOrigin === null) return value
  const parsed = asParsed(value)
  return MEDIA_PATH.test(parsed) ? `${apiOrigin}${parsed}` : value
}

/**
 * Whether a link leaves the shop: an absolute or protocol-relative URL on another origin.
 * Browsers ignore leading and trailing C0 controls and spaces, drop tabs and line breaks, and
 * read `\` as `/` in http(s) URLs, so `\u{1}//host`, `/\host`, `\\host` and `/<tab>/host` are
 * protocol-relative too: normalise the same way before checking.
 */
function isExternal(href: string, siteOrigin: string | null): boolean {
  const normalised = asParsed(href).replaceAll('\\', '/')
  if (!ABSOLUTE.test(normalised)) return false
  try {
    return new URL(normalised, siteOrigin ?? 'https://invalid.invalid').origin !== siteOrigin
  } catch {
    return true
  }
}

/** Drop the attributes whose value is not one of the listed ones. */
function knownValues(attribs: sanitizeHtml.Attributes): sanitizeHtml.Attributes {
  return Object.fromEntries(
    Object.entries(attribs).filter(
      ([name, value]) =>
        !Object.hasOwn(ATTRIBUTE_VALUES, name) || ATTRIBUTE_VALUES[name].includes(value.trim()),
    ),
  )
}

function linkAttributes(
  attribs: sanitizeHtml.Attributes,
  apiOrigin: string | null,
  siteOrigin: string | null,
  allInNewTab: boolean,
): sanitizeHtml.Attributes {
  const { target, rel, ...rest } = attribs
  const href = absolutize(attribs.href, apiOrigin)
  const result: sanitizeHtml.Attributes = { ...rest }
  if (href !== undefined) result.href = href
  const tokens = (rel ?? '')
    .toLowerCase()
    .split(/\s+/)
    .filter((token) => REL_TOKENS.has(token))
  const newTab =
    target?.trim().toLowerCase() === '_blank' ||
    (href ? isExternal(href, siteOrigin) : false) ||
    (allInNewTab && href !== undefined && !MAIL_OR_PHONE.test(asParsed(href)))
  if (newTab) {
    result.target = '_blank'
    tokens.push('noopener', 'noreferrer')
  }
  if (tokens.length > 0) result.rel = [...new Set(tokens)].join(' ')
  return result
}

function imageAttributes(
  attribs: sanitizeHtml.Attributes,
  apiOrigin: string | null,
): sanitizeHtml.Attributes {
  const src = absolutize(attribs.src, apiOrigin)
  return {
    ...attribs,
    ...(src === undefined ? {} : { src }),
    alt: attribs.alt ?? '',
    loading: 'lazy',
    decoding: 'async',
  }
}

/**
 * The safe version of `html`. `apiUrl` is the API base URL (its origin serves `/media/` and
 * `/static/`). Empty or whitespace-only input gives ''.
 */
export function sanitizeOperatorHtml(
  html: string,
  apiUrl: string,
  options: SanitizeOptions = {},
): string {
  if (html.trim() === '') return ''
  const apiOrigin = originOf(apiUrl)
  const siteOrigin = originOf(options.siteUrl)
  const headingId = headingIdFilter(options.headingIds)
  const clean = sanitizeHtml(html, {
    allowedTags: ALLOWED_TAGS,
    allowedAttributes: withHeadingIds(ALLOWED_ATTRIBUTES, options.headingIds),
    allowedClasses: {},
    allowedStyles: {},
    allowedSchemes: ['http', 'https', 'mailto', 'tel'],
    allowedSchemesByTag: { img: ['http', 'https'] },
    allowedSchemesAppliedToAttributes: ['href', 'src'],
    allowProtocolRelative: true,
    disallowedTagsMode: 'discard',
    nonTextTags: NON_TEXT_TAGS,
    nestingLimit: 64,
    // An image whose source was removed (data:, javascript:) or never set shows nothing.
    exclusiveFilter: (frame) => frame.tag === 'img' && !frame.attribs.src,
    parseStyleAttributes: false,
    transformTags: {
      h1: 'h2',
      a: (tagName, attribs) => ({
        tagName,
        attribs: linkAttributes(attribs, apiOrigin, siteOrigin, options.linksInNewTab ?? false),
      }),
      img: (tagName, attribs) => ({ tagName, attribs: imageAttributes(attribs, apiOrigin) }),
      // Runs after the tag's own transform (an h1 is an h2 here).
      '*': (tagName, attribs) => ({
        tagName,
        attribs: knownValues(headingId(tagName, attribs)),
      }),
    },
  })
  // The output is re-serialised with `<` escaped in text and attribute values, so a literal
  // "<table" (or "<img") can only be a real tag here.
  const wrapped = clean
    .replace(TABLE_OPEN, `${TABLE_WRAP}<table`)
    .replace(TABLE_CLOSE, '</table></div>')
    .trim()
  return options.wideImages ? wrapImages(wrapped) : wrapped
}
