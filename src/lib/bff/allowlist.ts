/**
 * Which API paths the browser may reach through `/api/bff/*`. Anything not listed answers 404,
 * so the BFF can never be used as an open proxy to the rest of the API (redirect resolution,
 * short links, robots, the sitemap and the bank callback are handled elsewhere).
 */

const READ = ['GET'] as const
const ANY = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] as const

interface Rule {
  /** First path segment. */
  root: string
  methods: readonly string[]
  /** Only the bare `root/` path, nothing under it. */
  exact?: boolean
  /** Sub-trees (segments after `root`) that stay closed. */
  except?: string[][]
}

const RULES: readonly Rule[] = [
  { root: 'account', methods: ANY },
  { root: 'cart', methods: ANY },
  { root: 'order', methods: ANY },
  { root: 'payment', methods: ANY, except: [['gateway', 'callback']] },
  { root: 'wallet', methods: ANY },
  { root: 'product', methods: ANY },
  { root: 'blog', methods: ANY },
  { root: 'pages', methods: ANY },
  { root: 'dashboard', methods: ANY },
  { root: 'notification', methods: ANY },
  { root: 'devices', methods: ANY },
  { root: 'contact-us', methods: ANY },
  { root: 'search', methods: ANY },
  { root: 'transportation', methods: ANY },
  { root: 'faq', methods: ANY },
  { root: 'homepage', methods: READ, exact: true },
  { root: 'menu', methods: READ },
  { root: 'linker', methods: READ, exact: true },
  { root: 'global', methods: READ, except: [['feature-toggles']] },
]

/**
 * A segment that could move the request out of its prefix: a dot segment, or one that still
 * holds a slash, a backslash or a percent sign once decoded (an encoded slash, or a second
 * encoding layer such as `%252e`). A proxy in front of the API that decodes and normalises paths
 * would otherwise resolve it outside the allowed prefix. Real API path segments (slugs, ids,
 * order codes, UUIDs) never contain these characters.
 */
function isUnsafeSegment(segment: string): boolean {
  let decoded: string
  try {
    decoded = decodeURIComponent(segment)
  } catch {
    return true
  }
  return decoded === '.' || decoded === '..' || /[/\\%]/.test(decoded)
}

function startsWith(segments: string[], prefix: string[]): boolean {
  return prefix.every((part, index) => segments[index] === part)
}

/**
 * True when `method` may be forwarded to the API path `path` (relative to `/api/v1/`, with or
 * without slashes). Matching is per segment and case-sensitive; unsafe segments never match.
 */
export function isAllowed(method: string, path: string): boolean {
  const segments = path.split('/').filter((segment) => segment !== '')
  const [root, ...rest] = segments
  if (root === undefined || segments.some(isUnsafeSegment)) return false
  const rule = RULES.find((candidate) => candidate.root === root)
  if (!rule || !rule.methods.includes(method.toUpperCase())) return false
  if (rule.exact && rest.length > 0) return false
  return !rule.except?.some((prefix) => startsWith(rest, prefix))
}
