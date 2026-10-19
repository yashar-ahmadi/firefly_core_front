import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getLinker } from '@/features/linker/api'
import { LinkerPage } from '@/features/linker/linker-page'
import { linkerMetadata } from '@/features/linker/linker-seo'
import { notFoundMetadata } from '@/features/seo/not-found-metadata'

/** A linker the operator never saved: the API answers it with an empty name. */
const isUnsaved = (name: string) => name.trim() === ''

export async function generateMetadata(): Promise<Metadata> {
  const linker = await getLinker()
  if (isUnsaved(linker.name)) return notFoundMetadata()
  return linkerMetadata(linker)
}

/**
 * `/links/`, the linker (content digest §8), in its own minimal layout (no shop shell), public
 * and indexable. Read once per 300 s for everyone (`getLinker`, shared with `generateMetadata`).
 * A linker never saved (`name === ''`) is a real 404 (R9: awaited, before anything streams).
 */
export default async function LinksPage() {
  const linker = await getLinker()
  if (isUnsaved(linker.name)) notFound()
  return <LinkerPage linker={linker} />
}
