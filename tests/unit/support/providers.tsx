import type { QueryClient } from '@tanstack/react-query'
import { QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { createQueryClient } from '@/lib/query/query-client'
import { SessionProvider } from '@/lib/session/session-context'

/**
 * The client contexts a storefront leaf needs (session flag and TanStack Query), with a fresh
 * QueryClient unless one is given (a second tree sharing the first one's cache). Pass the
 * returned `wrapper` to `render` or `renderHook`.
 */
export function clientProviders({
  hasSession = false,
  client = createQueryClient(),
}: { hasSession?: boolean; client?: QueryClient } = {}): {
  client: QueryClient
  wrapper: (props: { children: ReactNode }) => ReactNode
} {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <SessionProvider initialHasSession={hasSession}>
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    </SessionProvider>
  )
  return { client, wrapper }
}
