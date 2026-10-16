import { vi } from 'vitest'

// A stand-in for the Next router in product-page tests:
//   vi.mock('next/navigation', async () => (await import('./router')).routerMock)
// Kept apart from ./support, which imports the components that import `next/navigation`.

export const router = {
  push: vi.fn(),
  refresh: vi.fn(),
  replace: vi.fn(),
  pathname: '/product/samsung-galaxy-s25-ultra/',
  search: '',
}

export const routerMock = {
  useRouter: () => ({ push: router.push, refresh: router.refresh, replace: router.replace }),
  usePathname: () => router.pathname,
  useSearchParams: () => new URLSearchParams(router.search),
}

export function resetRouter(): void {
  router.push.mockReset()
  router.refresh.mockReset()
  router.replace.mockReset()
  router.pathname = '/product/samsung-galaxy-s25-ultra/'
  router.search = ''
}
