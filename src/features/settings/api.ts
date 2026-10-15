import 'server-only'
import { cache } from 'react'
import { buildCategoryTree } from '@/features/settings/category-tree'
import { fetchAllRows, guarded, isRecord, text } from '@/features/settings/load'
import { ApiError } from '@/lib/api/errors'
import { apiFetch } from '@/lib/api/server'
import { FEATURE_KEYS, isFeatureKey, type FeatureKey } from '@/lib/api/types/common'
import type {
  AuthSettings,
  CategoryCard,
  CategoryNode,
  FeatureState,
  MenuKey,
  MenuNode,
  SiteSettings,
  Snippet,
  Social,
} from '@/lib/api/types/settings'

/**
 * Loaders for the data every page shell needs. They run in the root layout, so none of them
 * throws: a failure is logged once (status and code only, never headers or URLs) and the
 * documented fallback is returned. Reads are anonymous and cached by the Next.js data cache, so
 * the visitor's IP is deliberately not forwarded. `cache()` dedupes the calls within one render.
 */

const REVALIDATE_SECONDS = 300
const FEATURES_REVALIDATE_SECONDS = 60

/** The safe `auth` block: every sign-in method off. A fresh object, so callers cannot share it. */
function disabledAuth(): AuthSettings {
  return {
    google_login_enabled: false,
    google_client_id: null,
    sms_otp_enabled: false,
    telegram_otp_enabled: false,
    available_otp_methods: [],
    registration_methods: [],
    default_otp_methods: { email: 'email' },
  }
}

/** `GET global/settings/`: shop identity, contact data, footer HTML and the `auth` block. */
export const getSiteSettings = cache(async (): Promise<SiteSettings | null> =>
  guarded('getSiteSettings', null, async () => {
    const { data } = await apiFetch<unknown>('global/settings', {
      revalidate: REVALIDATE_SECONDS,
      tags: ['settings'],
    })
    if (!isRecord(data)) throw new Error('unexpected settings payload')
    // `auth` is always present per the contract; if it is not, login and registration stay off.
    const auth = isRecord(data.auth) ? data.auth : disabledAuth()
    return { ...data, auth } as unknown as SiteSettings
  }),
)

/**
 * The ten feature switches. A key the API does not return is enabled (the API's own rule), and so
 * is every key when the call fails: the API enforces the switches anyway with `503 feature_disabled`.
 */
export const getFeatureStatus = cache(async (): Promise<Record<FeatureKey, FeatureState>> => {
  const states = Object.fromEntries(
    FEATURE_KEYS.map((key) => [key, { key, name: '', enabled: true, reason: null }]),
  ) as Record<FeatureKey, FeatureState>
  return guarded('getFeatureStatus', states, async () => {
    const rows = await fetchAllRows('global/feature-status', {
      revalidate: FEATURES_REVALIDATE_SECONDS,
      tags: ['features'],
    })
    const result = { ...states }
    for (const row of rows) {
      if (!isRecord(row) || !isFeatureKey(row.feature_key)) continue
      const enabled = row.is_enabled !== false
      const reason = text(row.disable_reason).trim() === '' ? null : text(row.disable_reason)
      result[row.feature_key] = {
        key: row.feature_key,
        name: text(row.display_name),
        enabled,
        reason: enabled ? null : reason,
      }
    }
    return result
  })
})

/** Keep well-formed nodes only, with `children` always an array (a bad node must not crash the shell). */
function normalizeMenu(raw: unknown): MenuNode[] {
  if (!Array.isArray(raw)) return []
  const nodes: MenuNode[] = []
  for (const item of raw) {
    if (!isRecord(item) || typeof item.title !== 'string') continue
    nodes.push({ ...item, children: normalizeMenu(item.children) } as unknown as MenuNode)
  }
  return nodes
}

/**
 * `GET menu/<key>/` as a tree of ready-made links. Menus arrive pre-filtered: do not filter again.
 * An unknown or disabled menu (`menu_not_found`) is an empty menu, silently.
 */
export const getMenu = cache(async (key: MenuKey): Promise<MenuNode[]> =>
  guarded(`getMenu(${key})`, [], async () => {
    try {
      const { data } = await apiFetch<unknown>(`menu/${key}`, {
        revalidate: REVALIDATE_SECONDS,
        tags: [`menu:${key}`],
      })
      return isRecord(data) ? normalizeMenu(data.items) : []
    } catch (error) {
      if (error instanceof ApiError && error.code === 'menu_not_found') return []
      throw error
    }
  }),
)

/** `GET global/socials/`, in API order (by name). Rows without a link are dropped. */
export const getSocials = cache(async (): Promise<Social[]> =>
  guarded('getSocials', [], async () => {
    const rows = await fetchAllRows('global/socials', {
      revalidate: REVALIDATE_SECONDS,
      tags: ['socials'],
    })
    return rows.flatMap((row): Social[] =>
      isRecord(row) && typeof row.id === 'number' && text(row.link) !== ''
        ? [
            {
              id: row.id,
              name: text(row.name),
              username_or_id: text(row.username_or_id),
              logo: text(row.logo) || null,
              link: text(row.link),
            },
          ]
        : [],
    )
  }),
)

/**
 * `GET global/extra-snippets/` in API order (alphabetical by position string, then type, then id).
 * Group by `position` and keep the order inside each group. Feed `snippet` to `parseSnippet`.
 */
export const getSnippets = cache(async (): Promise<Snippet[]> =>
  guarded('getSnippets', [], async () => {
    const rows = await fetchAllRows('global/extra-snippets', {
      revalidate: REVALIDATE_SECONDS,
      tags: ['snippets'],
    })
    return rows.flatMap((row): Snippet[] =>
      isRecord(row) && typeof row.id === 'number' && text(row.snippet).trim() !== ''
        ? [
            {
              id: row.id,
              description: text(row.description),
              position: text(row.position),
              type: text(row.type),
              snippet: text(row.snippet),
            },
          ]
        : [],
    )
  }),
)

/** The string entries of a server dictionary; anything else cannot be a label. */
function stringEntries(raw: unknown): Record<string, string> {
  if (!isRecord(raw)) return {}
  return Object.fromEntries(
    Object.entries(raw).filter((entry): entry is [string, string] => typeof entry[1] === 'string'),
  )
}

async function translationFromEndpoint(): Promise<Record<string, string>> {
  const { data } = await apiFetch<unknown>('global/get-translation/fa', {
    revalidate: REVALIDATE_SECONDS,
    tags: ['translations'],
  })
  // The key is singular here and plural in `languages/`; null means "nothing to merge".
  if (!isRecord(data) || !('translation' in data || 'translations' in data)) {
    throw new Error('unexpected get-translation payload')
  }
  return stringEntries(data.translation ?? data.translations)
}

async function translationFromLanguages(): Promise<Record<string, string>> {
  const { data } = await apiFetch<unknown>('global/languages', {
    query: { platform: 'web' },
    revalidate: REVALIDATE_SECONDS,
    tags: ['translations'],
  })
  if (!isRecord(data) || !Array.isArray(data.enabled_languages)) {
    throw new Error('unexpected languages payload')
  }
  const fa = data.enabled_languages.find(
    (language) => isRecord(language) && language.language_code === 'fa',
  )
  return isRecord(fa) ? stringEntries(fa.translations) : {}
}

/**
 * The operator's overrides of the bundled interface dictionary (`createTranslator` merges them).
 * Reads `get-translation/fa/`, then the `fa` entry of `languages/`; `{}` when both fail.
 */
export const getTranslations = cache(async (): Promise<Record<string, string>> => {
  try {
    return await translationFromEndpoint()
  } catch {
    // Fall back to languages/ below; only a failure of both is reported.
  }
  return guarded('getTranslations', {}, translationFromLanguages)
})

function isCategoryCard(row: unknown): row is CategoryCard {
  return (
    isRecord(row) &&
    typeof row.id === 'number' &&
    typeof row.name === 'string' &&
    typeof row.path === 'string' &&
    (row.parent_id === null || row.parent_id === undefined || typeof row.parent_id === 'number')
  )
}

/** The published category tree: `category/list/` (all pages, tree order) nested by `parent_id`. */
export const getCategoryTree = cache(async (): Promise<CategoryNode[]> =>
  guarded('getCategoryTree', [], async () => {
    const rows = await fetchAllRows('product/category/list', {
      revalidate: REVALIDATE_SECONDS,
      tags: ['categories'],
    })
    const cards = rows
      .filter(isCategoryCard)
      .map((card): CategoryCard => ({ ...card, parent_id: card.parent_id ?? null }))
    return buildCategoryTree(cards)
  }),
)
