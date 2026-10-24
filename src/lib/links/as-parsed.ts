// An operator's URL as the browser's URL parser reads it (the WHATWG URL standard), before any
// check on it: leading and trailing C0 controls and spaces are ignored, tabs and line breaks are
// dropped anywhere, and `\` is read as `/` in an http(s) URL. So `\u{1}//host`, `/<tab>/host`,
// `/<newline>/host` and `/\host` all lead to another host. Pure: safe in any bundle.

/** Leading and trailing C0 controls and spaces: the URL parser ignores them. */
const EDGE_JUNK = /^[\u{0}- ]+|[\u{0}- ]+$/gu
/** Tabs and line breaks: the URL parser drops them anywhere in a URL. */
const TAB_OR_NEWLINE = /[\t\n\r]/g

/** `value` as the URL parser reads it (so `\u{1}//host` is `//host`). */
export function asParsed(value: string): string {
  return value.replace(EDGE_JUNK, '').replace(TAB_OR_NEWLINE, '')
}

/** Whether `value`, as parsed, is a root-relative path: never `//host` nor `/\host`. */
export function isRootPath(value: string): boolean {
  return /^\/(?![/\\])/.test(asParsed(value))
}
