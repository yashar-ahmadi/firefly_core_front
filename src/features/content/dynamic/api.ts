import 'server-only'
import { cache } from 'react'
import { orRememberedNotFound } from '@/features/catalog/loaders/read'
import { ApiError } from '@/lib/api/errors'
import { apiFetch } from '@/lib/api/server'
import type { DynamicContentGroup } from '@/lib/api/types/dynamic-content'

/** On every slot read: `revalidateTag('dynamic-content')` refreshes them all. */
export const DYNAMIC_CONTENT_TAG = 'dynamic-content'
const REVALIDATE = 300
/** Slug-style keys (the digest: keys are free-form, agree on slugs): one path segment. */
const SLOT_KEY = /^[a-z0-9]+(?:[-_][a-z0-9]+)*$/

/**
 * A message slot's items (`global/dynamic-content/<key>/`, auth-settings digest §7.9), or null.
 * One anonymous read for everyone (no token, no visitor IP: one Data Cache entry), cached
 * 300 s and tagged `dynamic-content:<key>` and `dynamic-content`. null when the slot is missing
 * or switched off (the API's 404, remembered a minute in process memory like the catalog's, since
 * Next caches only 200s: a page with an empty slot costs no API call per visit), for a key that
 * is not slug-style, and on any failure, logged with its status alone. It never throws: a slot
 * is never worth the page. `cache()` shares the read within a render.
 */
export const getDynamicContent = cache(async (key: string): Promise<DynamicContentGroup | null> => {
  if (!SLOT_KEY.test(key)) return null
  try {
    return await orRememberedNotFound(`dynamic-content:${key}`, async () => {
      const { data } = await apiFetch<DynamicContentGroup>(`global/dynamic-content/${key}`, {
        revalidate: REVALIDATE,
        tags: [`dynamic-content:${key}`, DYNAMIC_CONTENT_TAG],
      })
      return data
    })
  } catch (error) {
    console.error(
      `[dynamic-content] ${key}:`,
      error instanceof ApiError ? String(error.status) : 'error',
    )
    return null
  }
})
