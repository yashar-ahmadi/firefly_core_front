import 'server-only'
import { ApiError } from '@/lib/api/errors'
import { apiFetch } from '@/lib/api/server'

/**
 * Operator redirect rules (managed in the admin panel), applied by `src/proxy.ts`.
 *
 * Every `resolve/` hit is counted by the API, so it is called only for paths that match a known
 * rule source. The list of sources is kept in memory per server process: refreshed every five
 * minutes, served stale while one refresh runs, and awaited only by the very first request.
 */

export interface RedirectRule {
  status: 301 | 302 | 410
  /** Storefront path or absolute http(s) URL; '' for a gone (410) rule. */
  target: string
}

interface RuleListPage {
  next: string | null
  results: Array<{ source_path?: unknown }>
}

interface ResolvedRule {
  target?: unknown
  status_code?: unknown
}

const RULE_LIST_TTL_MS = 5 * 60 * 1000
const LIST_TIMEOUT_MS = 3_000
const RESOLVE_TIMEOUT_MS = 1_000
const PAGE_SIZE = 100
/** A bound on a misbehaving `next` link: 100 000 rules. */
const MAX_PAGES = 1_000

let ruleSources: Set<string> | null = null
let loadedAt = 0
let refreshing: Promise<void> | null = null

/**
 * The spelling the API stores for `pathname` (backend `normalize_path`): percent-decoded,
 * repeated slashes collapsed, trailing slash dropped (except for `/`), case kept. Null when it
 * cannot be computed locally: an encoded `/ ? # %` (the API keeps those encoded), invalid
 * percent-encoding, or whitespace and control characters.
 */
export function ruleSpelling(pathname: string): string | null {
  if (/%(?:25|2f|3f|23)/i.test(pathname)) return null
  let path: string
  try {
    path = decodeURIComponent(pathname)
  } catch {
    return null
  }
  if (/[\s\p{Cc}]/u.test(path)) return null
  path = path.replace(/\/{2,}/g, '/')
  return path.length > 1 ? path.replace(/\/+$/, '') || '/' : path
}

async function loadRuleSources(): Promise<Set<string>> {
  const sources = new Set<string>()
  for (let page = 1; page <= MAX_PAGES; page++) {
    const { data } = await apiFetch<RuleListPage>('redirects/list', {
      query: { limit: PAGE_SIZE, page },
      timeoutMs: LIST_TIMEOUT_MS,
    })
    for (const rule of data?.results ?? []) {
      if (typeof rule.source_path === 'string') sources.add(rule.source_path)
    }
    if (!data?.next) break
  }
  return sources
}

/** The `source_path` of every active rule (gone rules included). Empty until the API answers. */
export async function knownSources(): Promise<Set<string>> {
  if (Date.now() - loadedAt > RULE_LIST_TTL_MS) {
    refreshing ??= loadRuleSources()
      .then((sources) => {
        ruleSources = sources
      })
      .catch((error: unknown) => {
        console.error('[redirects] could not load the rule list', error)
      })
      .finally(() => {
        loadedAt = Date.now()
        refreshing = null
      })
    if (ruleSources === null) await refreshing
  }
  return ruleSources ?? new Set()
}

/**
 * The rule for `pathAndSearch` (the raw pathname plus query), or null: no rule, a bad path, an
 * unexpected answer, or an API that does not answer within one second. Never cached; the query
 * is carried to the target by the API. `forwardedFor` is the visitor IP for the API throttle.
 */
export async function resolveRedirect(
  pathAndSearch: string,
  forwardedFor: string | null = null,
): Promise<RedirectRule | null> {
  let rule: ResolvedRule | null
  try {
    const result = await apiFetch<ResolvedRule | null>('redirects/resolve', {
      query: { path: pathAndSearch },
      forwardedFor,
      timeoutMs: RESOLVE_TIMEOUT_MS,
    })
    rule = result.data
  } catch (error) {
    // 404 `redirect_not_found` is the normal "no rule"; any 400 is a path the API refuses.
    if (
      error instanceof ApiError &&
      error.status !== 0 &&
      error.status !== 400 &&
      error.status !== 404
    ) {
      console.error('[redirects] resolve answered', error.status, error.code)
    }
    return null
  }

  const status = rule?.status_code
  const target = typeof rule?.target === 'string' ? rule.target : ''
  if (status === 410) return { status, target: '' }
  if ((status === 301 || status === 302) && target !== '') return { status, target }
  console.error('[redirects] unexpected rule', status)
  return null
}
