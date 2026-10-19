import type { Metadata } from 'next'
import { ReadingListPage } from '@/features/account/reading-list/reading-list-page'
import { readingListStates } from '@/features/account/reading-list/reading-list-states'
import { getBlogCategories } from '@/features/blog/api'
import type { BlogCategoryListItem } from '@/lib/api/types/blog'

// «لیست مطالعه» (noindex, per visitor, never cached: the account layout; no loading.tsx). The
// saved posts are read in the browser through the BFF (the URL's search, category, sort and
// page); the blog's categories (anonymous, the server's 300 s cache) give the filter its options
// and the cards their category links. (The title lives here: a constant imported from a client
// module would reach this server file as a client reference.)

const TITLE = 'لیست مطالعه'

export const metadata: Metadata = { title: TITLE }
export const dynamic = 'force-dynamic'

/** The categories, or none while the blog is switched off (the page then says so itself). */
async function categories(): Promise<BlogCategoryListItem[]> {
  try {
    return await getBlogCategories()
  } catch {
    return []
  }
}

export default async function AccountReadingListPage() {
  return (
    <ReadingListPage title={TITLE} categories={await categories()} states={readingListStates()} />
  )
}
