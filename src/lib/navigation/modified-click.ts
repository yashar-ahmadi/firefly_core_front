/** What the check reads of a click: a DOM `MouseEvent` and React's both have it. */
export type ClickModifiers = Pick<
  MouseEvent,
  'button' | 'metaKey' | 'ctrlKey' | 'shiftKey' | 'altKey'
>

/**
 * A click the browser should handle itself: not the main button, or with a modifier that opens
 * the link elsewhere (new tab or window) or downloads it. Code that takes over link clicks
 * (client navigation, opening a dialog, scrolling to a section) leaves these alone.
 */
export function isModifiedClick(event: ClickModifiers): boolean {
  return event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey
}
