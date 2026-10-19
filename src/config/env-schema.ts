import { z } from 'zod'
import { PRESET_NAMES, RADIUS_SCALES, type PresetName, type RadiusScale } from '@/config/presets'

// Pure environment parsing. The server-only memoized accessor lives in ./env.

export interface FirebaseWebConfig {
  apiKey: string
  projectId: string
  messagingSenderId: string
  appId: string
  vapidKey: string
}

export interface ServerEnv {
  /** Firefly API base URL, no trailing slash. */
  FIREFLY_API_URL: string
  FIREFLY_API_KEY: string
  /** Public URL of this storefront, no trailing slash. */
  SITE_URL: string
  STORE_PRESET: PresetName
  THEME_PRIMARY?: string
  THEME_ACCENT?: string
  THEME_RADIUS?: RadiusScale
  THEME_FONT: 'vazirmatn' | 'custom'
  NESHAN_MAP_KEY?: string
  NESHAN_SERVICE_KEY?: string
  FIREBASE?: FirebaseWebConfig
  FEATURE_COMPARE: boolean
  FEATURE_QUICK_VIEW: boolean
  FEATURE_RECENTLY_VIEWED: boolean
  FEATURE_PWA: boolean
  /** Lower-case header carrying the client IP, or 'none'. */
  CLIENT_IP_HEADER: string
}

const DEV_API_URL = 'http://localhost:8000'
const DEV_SITE_URL = 'http://localhost:3000'
const HEX_COLOR = /^#[0-9a-fA-F]{6}$/
const HEADER_NAME = /^[a-z0-9-]+$/

const HTTP_URL = 'must be an http(s) URL'
const BARE_API_URL = 'must be the bare API origin, without a query (?) or fragment (#)'
const BARE_SITE_URL = 'must be the bare site origin, without a query (?) or fragment (#)'
const HEX_HINT = 'must be a #RRGGBB hex colour, e.g. "#4F46E5"'
const FLAG_HINT = 'must be true, false, 1 or 0'
const HEADER_HINT = 'must be an HTTP header name such as "x-real-ip", or "none"'
const REQUIRED = 'is required in production'

const url = z.url({
  protocol: /^https?$/,
  error: (issue) => (issue.input === undefined ? REQUIRED : HTTP_URL),
})
const stripSlashes = (value: string) => value.replace(/\/+$/, '')
const hasNoQueryOrHash = (value: string) => !/[?#]/.test(value)
/** Paths are appended to it (`/api/v1/…`): a `?` or `#` would swallow them. */
const apiUrl = url.refine(hasNoQueryOrHash, { error: BARE_API_URL }).transform(stripSlashes)
/** Canonical links, the cookies' `Secure` and the CSRF origin check are built on it, likewise. */
const siteUrl = url.refine(hasNoQueryOrHash, { error: BARE_SITE_URL }).transform(stripSlashes)
const hex = z.string().regex(HEX_COLOR, { error: HEX_HINT })
const flag = z
  .stringbool({ truthy: ['true', '1'], falsy: ['false', '0'], error: FLAG_HINT })
  .default(true)

function buildSchema(isProduction: boolean) {
  return z
    .object({
      FIREFLY_API_URL: isProduction ? apiUrl : apiUrl.default(DEV_API_URL),
      FIREFLY_API_KEY: isProduction
        ? z.string({ error: REQUIRED }).min(1, { error: REQUIRED })
        : z.string().default(''),
      SITE_URL: isProduction ? siteUrl : siteUrl.default(DEV_SITE_URL),
      STORE_PRESET: z.enum(PRESET_NAMES).default('default'),
      THEME_PRIMARY: hex.optional(),
      THEME_ACCENT: hex.optional(),
      THEME_RADIUS: z.enum(RADIUS_SCALES).optional(),
      THEME_FONT: z.enum(['vazirmatn', 'custom']).default('vazirmatn'),
      NESHAN_MAP_KEY: z.string().optional(),
      NESHAN_SERVICE_KEY: z.string().optional(),
      FIREBASE_API_KEY: z.string().optional(),
      FIREBASE_PROJECT_ID: z.string().optional(),
      FIREBASE_MESSAGING_SENDER_ID: z.string().optional(),
      FIREBASE_APP_ID: z.string().optional(),
      FIREBASE_VAPID_KEY: z.string().optional(),
      FEATURE_COMPARE: flag,
      FEATURE_QUICK_VIEW: flag,
      FEATURE_RECENTLY_VIEWED: flag,
      FEATURE_PWA: flag,
      CLIENT_IP_HEADER: z
        .string()
        .transform((value) => value.toLowerCase())
        .refine((value) => HEADER_NAME.test(value), { error: HEADER_HINT })
        .default('x-real-ip'),
    })
    .transform(
      ({
        FIREBASE_API_KEY,
        FIREBASE_PROJECT_ID,
        FIREBASE_MESSAGING_SENDER_ID,
        FIREBASE_APP_ID,
        FIREBASE_VAPID_KEY,
        ...env
      }): ServerEnv => ({
        ...env,
        FIREBASE: buildFirebase({
          FIREBASE_API_KEY,
          FIREBASE_PROJECT_ID,
          FIREBASE_MESSAGING_SENDER_ID,
          FIREBASE_APP_ID,
          FIREBASE_VAPID_KEY,
        }),
      }),
    )
}

/**
 * The Firebase config exists only when all five variables are set. Some of them without the rest
 * is a mistake, not a choice: web push stays off and one warning names what is missing (never a
 * value).
 */
function buildFirebase(values: {
  FIREBASE_API_KEY?: string
  FIREBASE_PROJECT_ID?: string
  FIREBASE_MESSAGING_SENDER_ID?: string
  FIREBASE_APP_ID?: string
  FIREBASE_VAPID_KEY?: string
}): FirebaseWebConfig | undefined {
  const apiKey = values.FIREBASE_API_KEY
  const projectId = values.FIREBASE_PROJECT_ID
  const messagingSenderId = values.FIREBASE_MESSAGING_SENDER_ID
  const appId = values.FIREBASE_APP_ID
  const vapidKey = values.FIREBASE_VAPID_KEY
  if (!apiKey || !projectId || !messagingSenderId || !appId || !vapidKey) {
    const missing = Object.entries(values).flatMap(([name, value]) => (value ? [] : [name]))
    if (missing.length < Object.keys(values).length) {
      console.warn(
        `[env] Web push is off: FIREBASE_* is incomplete (missing ${missing.join(', ')}).`,
      )
    }
    return undefined
  }
  return { apiKey, projectId, messagingSenderId, appId, vapidKey }
}

/**
 * Trim every value, drop one pair of surrounding quotes (`docker run --env-file` keeps them)
 * and treat empty or blank strings as unset.
 */
function cleanRaw(raw: Record<string, string | undefined>): Record<string, string | undefined> {
  const out: Record<string, string | undefined> = {}
  for (const [key, value] of Object.entries(raw)) {
    const unquoted = value
      ?.trim()
      .replace(/^(["'])(.*)\1$/s, '$2')
      .trim()
    out[key] = unquoted ? unquoted : undefined
  }
  return out
}

function formatIssues(issues: ReadonlyArray<z.core.$ZodIssue>): string {
  // Only the variable name and the rule are reported, never the offending value,
  // because the environment holds secrets.
  const lines = issues.map((issue) => {
    const name = issue.path.map(String).join('.') || '(environment)'
    return `  - ${name}: ${issue.message}`
  })
  return `Invalid environment configuration:\n${lines.join('\n')}`
}

/**
 * Validates the raw environment. In production the API URL, the site URL and the API key are
 * required; elsewhere they fall back to local development defaults. Throws one Error that
 * lists every invalid variable.
 */
export function parseServerEnv(raw: Record<string, string | undefined>): ServerEnv {
  const cleaned = cleanRaw(raw)
  const result = buildSchema(cleaned.NODE_ENV === 'production').safeParse(cleaned)
  if (!result.success) throw new Error(formatIssues(result.error.issues))
  return result.data
}
