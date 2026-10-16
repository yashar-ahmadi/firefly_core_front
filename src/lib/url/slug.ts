/**
 * Canonical form of a route slug for API paths. Pure: safe in any bundle.
 *
 * Next.js may hand `params` over still percent-encoded or already decoded, and catalog slugs may be
 * Persian. The raw value is decoded once and each `/`-separated segment encoded once, so both forms
 * give the same result. Returns null when the input cannot be a slug path: malformed
 * percent-encoding, an empty segment, a `.` or `..` segment (which `apiPath` would refuse), or a lone
 * surrogate. A single decode means an encoded `%2F` becomes a separator: callers that need one
 * segment check the result for `/`.
 */
export function normalizeSlug(raw: string): string | null {
  let decoded: string
  try {
    decoded = decodeURIComponent(raw)
  } catch {
    return null
  }
  const segments = decoded.split('/')
  if (segments.some((segment) => segment === '' || segment === '.' || segment === '..')) {
    return null
  }
  try {
    return segments.map((segment) => encodeURIComponent(segment)).join('/')
  } catch {
    // encodeURIComponent throws URIError on a lone surrogate.
    return null
  }
}
