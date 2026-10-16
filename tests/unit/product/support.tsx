import { render } from '@testing-library/react'
import type { ReactNode } from 'react'
import { ProductProvider } from '@/features/product/components/product-provider'
import { FeatureProvider, type FeatureMap } from '@/features/settings/feature-context'
import type { ProductDetail } from '@/lib/api/types/catalog'
import { clientProviders } from '../support/providers'

// Rendering product-page leaves: the client providers, the feature switches and the product.
// Tests mock `next/navigation` with ./router and `@/lib/api/client`.

export interface RenderProductOptions {
  product: ProductDetail
  initialVariantId?: number | null
  /** ProductProvider's `syncUrl` (on by default, as on the product page). */
  syncUrl?: boolean
  hasSession?: boolean
  /** The `stock_notifications` switch (on by default). */
  stockNotifications?: boolean
}

export function renderWithProduct(ui: ReactNode, options: RenderProductOptions) {
  const { client, wrapper: Base } = clientProviders({ hasSession: options.hasSession ?? false })
  const features: Partial<FeatureMap> = {
    stock_notifications: {
      key: 'stock_notifications',
      name: 'اطلاع\u{200C}رسانی موجود شدن کالا',
      enabled: options.stockNotifications ?? true,
      reason: options.stockNotifications === false ? 'موقتاً غیرفعال است.' : null,
    },
  }
  // A wrapper, so `rerender` keeps the providers.
  const wrapper = ({ children }: { children: ReactNode }) => (
    <Base>
      <FeatureProvider initial={features}>
        <ProductProvider
          product={options.product}
          initialVariantId={options.initialVariantId}
          syncUrl={options.syncUrl}
        >
          {children}
        </ProductProvider>
      </FeatureProvider>
    </Base>
  )
  return { ...render(ui, { wrapper }), client }
}
