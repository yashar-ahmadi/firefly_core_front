// The geography of the transportation lists (cart digest §8): public, read with the API key only.
// Pure types: safe in any bundle.

/** `GET transportation/province/list/`. */
export interface Province {
  id: number
  name: string
}

/** `GET transportation/city/list/`. City names repeat across provinces: key by `id`. */
export interface City {
  id: number
  name: string
  province: number
  province_name: string
}
