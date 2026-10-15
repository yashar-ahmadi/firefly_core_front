import { getServerEnv } from '@/config/env'

/**
 * robots.txt exactly as the operator wrote it in the panel (`GET robots/?format=txt`), byte for
 * byte so group and rule order survive. The API's own error text is never served as robots.txt:
 * when the API fails and nothing is cached the answer is an uncached 503, which crawlers read as
 * a temporary "disallow everything" (safer than "allow everything" for a blocked staging shop).
 */
export const dynamic = 'force-dynamic'

const REVALIDATE_SECONDS = 300
const TIMEOUT_MS = 5_000
const TEXT = 'text/plain; charset=utf-8'
const RETRY_AFTER_SECONDS = '300'
const UNAVAILABLE = 'robots.txt is temporarily unavailable.\n'

export async function GET(): Promise<Response> {
  const env = getServerEnv()
  const headers: Record<string, string> = { Accept: 'text/plain' }
  if (env.FIREFLY_API_KEY) headers['X-API-Key'] = env.FIREFLY_API_KEY

  try {
    const res = await fetch(`${env.FIREFLY_API_URL}/api/v1/robots/?format=txt`, {
      headers,
      redirect: 'manual',
      signal: AbortSignal.timeout(TIMEOUT_MS),
      next: { revalidate: REVALIDATE_SECONDS },
    })
    if (res.status === 200 && res.headers.get('content-type')?.startsWith('text/plain')) {
      return new Response(await res.arrayBuffer(), { headers: { 'Content-Type': TEXT } })
    }
    console.error('[robots] API answered', res.status)
  } catch (error) {
    console.error('[robots] API unreachable', error)
  }
  return new Response(UNAVAILABLE, {
    status: 503,
    headers: {
      'Content-Type': TEXT,
      'Cache-Control': 'no-store',
      'Retry-After': RETRY_AFTER_SECONDS,
    },
  })
}
