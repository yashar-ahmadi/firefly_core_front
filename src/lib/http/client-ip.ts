/** IPv4 or IPv6 (including `::ffff:1.2.3.4`): hex digits, dots and colons, at least one of `.:`. */
const IP_SHAPE = /^(?=.*[.:])[0-9a-f:.]{2,45}$/i

/**
 * The visitor's IP from the configured trusted header, or null.
 *
 * `headerName` is `CLIENT_IP_HEADER` (`x-real-ip` by default, `x-forwarded-for`,
 * `cf-connecting-ip`...); `none` disables forwarding. For a list the first non-empty entry is the
 * client. Only point this at a header your edge overwrites: any other header is spoofable.
 */
export function getClientIp(headers: Headers, headerName: string): string | null {
  const name = headerName.trim().toLowerCase()
  if (!name || name === 'none') return null
  const raw = headers.get(name)
  if (!raw) return null
  const first = raw
    .split(',')
    .map((part) => part.trim())
    .find((part) => part !== '')
  return first && IP_SHAPE.test(first) ? first : null
}
