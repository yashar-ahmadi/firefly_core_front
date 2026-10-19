/**
 * A blog post's page counts a view on every render (blog digest §1.5: `GET blog/post/<slug>/`
 * increments `view_count`, with no dedupe), so a link to one is never prefetched (ruling P5-R1):
 * the blog's own links say `prefetch={false}` (tests/unit/blog/post-links-prefetch.test.ts checks
 * the source), and operator URLs (MenuLink, StoreLink) ask `isBlogPostPath`. Pure and tiny: the
 * shell's menus import it.
 */

/** `/blog/<slug>/`, a post. */
export function blogPostPath(slug: string): string {
  return `/blog/${encodeURIComponent(slug)}/`
}

/**
 * Whether a root-relative href is a post's page: `/blog/<one segment>` with or without its slash,
 * a query or a hash. Not the blog's home (`/blog/`) nor a category (`/blog/category/<path>/`);
 * `/blog/category/` itself is routed to the post page (a category needs a path), so it is one.
 */
export function isBlogPostPath(href: string): boolean {
  return /^\/blog\/[^/?#]+\/?(?:[?#]|$)/.test(href)
}
