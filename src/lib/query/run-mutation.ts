import type { MutationOptions, QueryClient } from '@tanstack/react-query'

/**
 * Runs one mutation without a hook, for a write created when it is pressed (a product card's
 * heart or add button creates none before). The mutation goes into the client's mutation cache
 * like a hook's: its options' callbacks and the cache's own run, and a `scope` still queues it
 * behind the writes of the same scope. With no observer it is garbage-collected `gcTime` after
 * it settles; a `MutationObserver` left subscribed would keep it for the page's lifetime.
 * Rejects with the mutation's error.
 */
export function runMutation<TData, TError, TVariables, TContext>(
  client: QueryClient,
  options: MutationOptions<TData, TError, TVariables, TContext>,
  variables: TVariables,
): Promise<TData> {
  return client.getMutationCache().build(client, options).execute(variables)
}
