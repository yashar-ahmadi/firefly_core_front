import type { Metadata } from 'next'
import { WishlistPage } from '@/features/account/wishlist/wishlist-page'
import { getProductSettings } from '@/features/catalog/api'

// «علاقه‌مندی‌ها» (noindex and per visitor, like every account page: see the account layout). The
// list is read in the browser through the BFF; the shop's product settings (anonymous, cached
// like the catalog's) say whether cards mark «ناموجود». (The title lives here: a constant
// imported from a client module would reach this server file as a client reference.)

const TITLE = 'علاقه‌مندی‌ها'

export const metadata: Metadata = { title: TITLE }

export default async function AccountWishlistPage() {
  const settings = await getProductSettings()
  return <WishlistPage title={TITLE} showOutOfStockLabel={settings.show_out_of_stock_label} />
}
