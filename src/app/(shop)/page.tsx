import { storeName } from '@/app/_shell/metadata'
import { CONTAINER } from '@/components/layout/container'
import { getStoreConfig } from '@/config/store-config'
import { getSiteSettings } from '@/features/settings/api'

// Placeholder home page: Plan 2 renders the backend homepage sections here.
export default async function ShopHomePage() {
  const name = storeName(getStoreConfig(), await getSiteSettings())
  return (
    <div className={`${CONTAINER} py-10`}>
      <h1 className="text-2xl font-bold text-ink-900">{name}</h1>
      <p className="mt-2 text-ink-600">به‌زودی</p>
    </div>
  )
}
