import { ApiError } from '@/lib/api/errors'

// The blog switch turned off, as the blog's loaders report it (blog digest §0.6). Pure.

/**
 * A blog read the API refused with `503 feature_disabled` for the `blog` switch: the blog is
 * off. `reason` is the API's `detail`: the operator's `disable_reason` when one was written,
 * else its default sentence naming the feature. The pages show it on «وبلاگ موقتاً در دسترس
 * نیست» (`src/app/(shop)/blog/unavailable.tsx`) instead of an error.
 */
export class BlogUnavailableError extends Error {
  readonly reason: string | null

  constructor(reason: string | null) {
    super(reason ?? 'The blog is switched off')
    this.name = 'BlogUnavailableError'
    this.reason = reason
  }
}

/**
 * Whether `error` is the blog switch: a `503 feature_disabled` for `blog`, or naming no feature
 * (a blog endpoint refused). Another switch (`blog_comments`, on comment submit) is not.
 */
export function isBlogSwitchedOff(error: unknown): error is ApiError {
  return (
    error instanceof ApiError &&
    error.status === 503 &&
    error.isFeatureDisabled() &&
    (error.feature === 'blog' || error.feature === null)
  )
}

/** `error` as a BlogUnavailableError when it is the blog switch; as it came otherwise. */
export function asBlogError(error: unknown): unknown {
  if (!isBlogSwitchedOff(error)) return error
  return new BlogUnavailableError(error.detail.trim() || null)
}
