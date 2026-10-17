// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { GET } from '@/app/sw.js/route'
import { buildServiceWorker } from '@/features/pwa/sw-source'

// `/sw.js` as browsers fetch it: JavaScript, allowed the whole site as its scope, and never kept
// without asking (a new deploy's worker is picked up on the next navigation).

describe('/sw.js', () => {
  it('serves the worker with the headers a service worker needs', async () => {
    const res = GET()
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('application/javascript; charset=utf-8')
    expect(res.headers.get('service-worker-allowed')).toBe('/')
    expect(res.headers.get('cache-control')).toBe('no-cache')
    expect(await res.text()).toBe(
      buildServiceWorker({ inboxPath: '/account/notifications/', icon: '/favicon.ico' }),
    )
  })
})
