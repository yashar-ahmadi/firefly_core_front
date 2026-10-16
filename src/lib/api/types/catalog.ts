/**
 * Wire types of the catalog endpoints (`product/*`) and the homepage, hand-written from the
 * product digest §3–§4 and the content digest §2 (the OpenAPI schema is wrong in places).
 * Pure types plus the sort list: safe in any bundle. Split by area under `./catalog/`.
 */
export * from '@/lib/api/types/catalog/enums'
export * from '@/lib/api/types/catalog/home'
export * from '@/lib/api/types/catalog/listing'
export * from '@/lib/api/types/catalog/product'
export * from '@/lib/api/types/catalog/reviews'
export * from '@/lib/api/types/catalog/taxonomy'
export * from '@/lib/api/types/catalog/variant'
