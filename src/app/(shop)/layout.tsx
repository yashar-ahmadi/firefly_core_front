import type { ReactNode } from 'react'
import { ShopShell } from '@/components/layout/shop-shell'

/** The shop pages: header, footer and bottom navigation around every page (see ShopShell). */
export default function ShopLayout({ children }: { children: ReactNode }) {
  return <ShopShell>{children}</ShopShell>
}
