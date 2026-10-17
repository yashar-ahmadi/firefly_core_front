// The address book's write shape (cart digest §7.2). The `Address` read shape is the cart's
// (`./cart`): the same object comes back in the cart's destination. Pure types.

export type { Address } from './cart'

/** `POST account/address/create/` and `PUT …/update/`: the seven required fields and the rest. */
export interface AddressWriteRequest {
  title: string
  receiver_first_name: string
  receiver_last_name: string
  /** Iranian mobile only: `09…`, `+989…` or Persian digits. */
  receiver_mobile: string
  /** Always with `city`: the API reads a missing half from the stored row. */
  province: number
  city: number
  address: string
  /** Stored as typed (no digit conversion); null or "" means none. */
  plaque?: string | null
  unit?: string | null
  /** "" means none (never null); 10 digits once dashes and spaces are gone. */
  postal_code?: string
  /** Both or neither; both null clears the pin. Never 0,0 for «unknown». */
  latitude?: number | null
  longitude?: number | null
  is_default?: boolean
}

/** `PATCH account/address/{id}/update/`: only what changed (province and city together). */
export type AddressPatch = Partial<AddressWriteRequest>
