import 'server-only'
import { cache } from 'react'
import { read } from '@/features/catalog/loaders/read'
import type { LinkerData } from '@/lib/api/types/linker'

/** On every read: `revalidateTag('linker')` refreshes the page. */
export const LINKER_TAG = 'linker'

/**
 * The linker (content digest §8: `GET linker/`, never a 404; `name === ''` means never saved):
 * anonymous, cached 300 s and tagged `linker`; nothing at build time (the root layout is
 * dynamic, R5). A failure is thrown: the error page (Next keeps serving the last good copy while
 * a revalidation fails). `cache()` shares it between `generateMetadata` and the page.
 */
export const getLinker = cache((): Promise<LinkerData> =>
  read<LinkerData>('linker', { revalidate: 300, tags: [LINKER_TAG] }),
)
