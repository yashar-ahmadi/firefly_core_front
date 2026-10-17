// What the API takes as an avatar (auth digest §4.16; the backend's `MAX_AVATAR_BYTES` and
// `ALLOWED_AVATAR_FORMATS`), checked before the upload. The API decides by the content, so a
// renamed file can still be refused (`invalid_image`): its message shows then. Pure.

export const AVATAR_TYPES: readonly string[] = ['image/jpeg', 'image/png', 'image/webp']

/** The file picker's `accept`. */
export const AVATAR_ACCEPT = AVATAR_TYPES.join(',')

/** 5 MB, as the API counts it (5 × 1024 × 1024 bytes); the BFF lets 6 MiB of multipart through. */
export const AVATAR_MAX_BYTES = 5 * 1024 * 1024

/** Why `file` cannot be the avatar, or null when it can. */
export function avatarFileError(file: Blob): string | null {
  if (!AVATAR_TYPES.includes(file.type)) return 'فقط تصویر JPG، PNG یا WEBP را می‌توان گذاشت.'
  if (file.size > AVATAR_MAX_BYTES) return 'حجم تصویر باید حداکثر ۵ مگابایت باشد.'
  return null
}
