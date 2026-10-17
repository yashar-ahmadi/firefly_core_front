import { bffFetch } from '@/lib/api/client'
import type { Address, AddressPatch, AddressWriteRequest } from '@/lib/api/types/address'
import type { Paginated } from '@/lib/api/types/common'

// The address book's endpoints (cart digest §7.1), through the BFF with the session. Edits go to
// `{id}/update/` (PATCH on `{id}/` is a 405), a delete answers 204 with no body.

/** The whole book: the default first, then the newest (the API's order). */
export interface AddressBook {
  count: number
  results: Address[]
}

/** The API's largest page. The book's size limit is the operator's (10 by default). */
const PAGE_SIZE = 100
/** Stops a list that never ends: 2,000 addresses is far past any real book. */
const MAX_PAGES = 20

async function list(signal?: AbortSignal): Promise<AddressBook> {
  const results: Address[] = []
  let count = 0
  for (let page = 1; page <= MAX_PAGES; page++) {
    const { data } = await bffFetch<Paginated<Address>>('account/address/list/', {
      query: { limit: PAGE_SIZE, page },
      signal,
    })
    count = data.count
    results.push(...data.results)
    if (page >= data.total_pages) break
  }
  return { count, results }
}

export const addressApi = {
  list,
  create: async (body: AddressWriteRequest): Promise<Address> =>
    (await bffFetch<Address>('account/address/create/', { method: 'POST', body })).data,
  update: async (id: number, patch: AddressPatch): Promise<Address> =>
    (await bffFetch<Address>(`account/address/${id}/update/`, { method: 'PATCH', body: patch }))
      .data,
  remove: async (id: number): Promise<void> => {
    await bffFetch<null>(`account/address/${id}/delete/`, { method: 'DELETE' })
  },
  /** No body; a no-op on the current default. */
  setDefault: async (id: number): Promise<Address> =>
    (await bffFetch<Address>(`account/address/${id}/set-default/`, { method: 'POST' })).data,
}
