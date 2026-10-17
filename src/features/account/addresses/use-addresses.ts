'use client'

import {
  useMutation,
  useMutationState,
  useQueryClient,
  type QueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query'
import { CART_KEY } from '@/features/cart/cart-cache'
import { isApiNotFound } from '@/lib/api/errors'
import type { Address, AddressPatch, AddressWriteRequest } from '@/lib/api/types/address'
import { useSessionExpired } from '@/lib/session/use-session-expired'
import { isSessionExpiredError } from '@/lib/session/viewer-queries'
import { useAccountQuery } from '../use-account-query'
import { addressApi, type AddressBook } from './address-api'

/** The signed-in visitor's address book (a session-only query: logout removes it). */
export const ADDRESSES_KEY = ['addresses'] as const
/** Every address write, so the list can show which cards are being written. */
export const ADDRESS_WRITE_KEY = ['addresses', 'write'] as const
/** One write at a time, in the order made: each moves `is_default` around the whole book. */
const WRITES = { id: 'addresses' }

/** The whole book (`GET account/address/list/?limit=100`), with the session only. */
export function useAddresses(): UseQueryResult<AddressBook> {
  return useAccountQuery({
    queryKey: ADDRESSES_KEY,
    queryFn: ({ signal }) => addressApi.list(signal),
  })
}

/**
 * After any write: the list (a write never says which *other* address lost or gained the
 * default) and the cart (its destination may be this address: an edit of its province or city
 * clears the shipping choice, a delete clears the destination). Resolves once the list is read;
 * the cart reads alongside, without holding the save up.
 */
export async function refreshAfterAddressWrite(client: QueryClient): Promise<void> {
  void client.invalidateQueries({ queryKey: CART_KEY })
  await client.invalidateQueries({ queryKey: ADDRESSES_KEY })
}

/**
 * A write of the book. It settles after the list is read again (the cart too, alongside), so
 * the caller sees the book as it is now. A 401 that means the session is gone ends it (login, with this
 * page as `next`); a 404 (the address went meanwhile) reads the list again.
 */
function useAddressWrite<V extends { id?: number }, R>(
  write: (variables: V) => Promise<R>,
): UseMutationResult<R, Error, V> {
  const client = useQueryClient()
  const expire = useSessionExpired()
  return useMutation({
    mutationKey: ADDRESS_WRITE_KEY,
    scope: WRITES,
    mutationFn: write,
    onSuccess: () => refreshAfterAddressWrite(client),
    onError: (error) => {
      if (isSessionExpiredError(error)) expire({ toLogin: true })
      else if (isApiNotFound(error)) void client.invalidateQueries({ queryKey: ADDRESSES_KEY })
    },
  })
}

export const useCreateAddress = () =>
  useAddressWrite(({ body }: { id?: undefined; body: AddressWriteRequest }) =>
    addressApi.create(body),
  )

export const useUpdateAddress = () =>
  useAddressWrite(({ id, patch }: { id: number; patch: AddressPatch }) =>
    addressApi.update(id, patch),
  )

/** `DELETE …/{id}/delete/` (204). Deleting the default promotes the newest other address. */
export const useDeleteAddress = () =>
  useAddressWrite(({ id }: { id: number; address?: Address }) => addressApi.remove(id))

export const useSetDefaultAddress = () =>
  useAddressWrite(({ id }: { id: number }) => addressApi.setDefault(id))

/** The ids of the addresses a write is on its way for (queued ones too). */
export function usePendingAddressIds(): ReadonlySet<number> {
  const ids = useMutationState({
    filters: { mutationKey: ADDRESS_WRITE_KEY, status: 'pending' },
    select: (mutation) => (mutation.state.variables as { id?: number } | undefined)?.id,
  })
  return new Set(ids.filter((id): id is number => id !== undefined))
}
