// Who opened a modal panel, so focus can go back there when it closes (`useReturnFocus` in
// overlay-panel.tsx). A light module of its own: the trigger of a panel whose code loads on the
// first opening installs the tracking first, so that first opening is recorded too.

// Safari does not focus a button when it is clicked, so `document.activeElement` is <body> (or
// a focusable container such as an open panel) when a panel opens from a click there. So the
// element last pressed (captured on pointerdown and click) is recorded too, and a key press
// forgets it, because focus is accurate again. One set of listeners serves every panel.
const FOCUSABLE =
  'button, a[href], input, select, textarea, summary, [tabindex], [contenteditable="true"]'
let lastPressed: Element | null = null
let tracking = false

export function trackPresses() {
  if (tracking) return
  tracking = true
  const remember = (event: Event) => {
    lastPressed = event.target instanceof Element ? event.target : null
  }
  document.addEventListener('pointerdown', remember, true)
  document.addEventListener('click', remember, true)
  document.addEventListener('keydown', () => (lastPressed = null), true)
}

/** Who opened a panel, best first: the element just pressed, then the focused one. */
export function openers(): HTMLElement[] {
  const candidates = [lastPressed?.closest(FOCUSABLE), document.activeElement]
  return candidates.filter(
    (element): element is HTMLElement =>
      element instanceof HTMLElement && element !== document.body,
  )
}
