// Full page loads, for when the page's own code cannot do the job (a chunk that failed to load
// after a deploy, no quick view host): the browser fetches fresh HTML and scripts. Kept apart so
// tests can stand in for them (jsdom cannot navigate).

/** Loads `href` as a new page (not through the client router). */
export function loadPage(href: string): void {
  window.location.assign(href)
}

/** Loads this page again. */
export function reloadPage(): void {
  window.location.reload()
}
