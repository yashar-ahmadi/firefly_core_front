import { ProductCard } from '@/features/catalog/components/product-card'
import { ProductCardSkeleton } from '@/features/catalog/components/product-card-skeleton'
import { ProductGrid, ProductGridSkeleton } from '@/features/catalog/components/product-grid'
import { ProductCardDemo } from './product-card-demo'
import { SHOWCASE_PRODUCTS, showcaseProduct } from './product-fixtures'
import { Demo, Section, sectionTitle } from './showcase'

// The catalog's product card, grid and skeleton (src/features/catalog/components).

const SIDE_BY_SIDE = 'grid grid-cols-2 items-start gap-2 sm:gap-3 md:grid-cols-4'

export function ProductCardSection() {
  return (
    <Section
      id="products"
      title={sectionTitle('products')}
      description="فقط با داده‌های فهرست کالاها. نام کالا پیوندی است که همه کارت را می‌پوشاند؛ قلب، مقایسه و مشاهده سریع روی آن قرار دارند و با ماوس هنگام اشاره ظاهر می‌شوند."
    >
      <Demo
        label="شبکه کالاها: ۲ ستون در گوشی، ۳ در تبلت، ۴ در دسکتاپ، ۵ در صفحه‌های عریض"
        className="block"
      >
        <div data-showcase="product-grid">
          <ProductGrid products={SHOWCASE_PRODUCTS} showOutOfStockLabel />
        </div>
      </Demo>

      <Demo label="کارت در کنار اسکلت بارگذاری خودش: هم‌اندازه" className={SIDE_BY_SIDE}>
        <div data-showcase="card-plain">
          <ProductCard product={showcaseProduct('hisense-tv-55-u7')} showOutOfStockLabel />
        </div>
        <div data-showcase="skeleton-plain">
          <ProductCardSkeleton />
        </div>
        <div data-showcase="card-action">
          <ProductCardDemo product={showcaseProduct('xiaomi-redmi-note-14-pro')} />
        </div>
        <div data-showcase="skeleton-action">
          <ProductCardSkeleton withAction />
        </div>
      </Demo>

      <Demo
        label="ناموجود: با برچسب، و بدون آن وقتی تنظیم فروشگاه خاموش است"
        className={SIDE_BY_SIDE}
      >
        <ProductCard product={showcaseProduct('chips-pack-family')} showOutOfStockLabel />
        <ProductCard product={showcaseProduct('chips-pack-family')} showOutOfStockLabel={false} />
      </Demo>

      <Demo label="شبکه در حال بارگذاری" className="block">
        <ProductGridSkeleton count={5} />
      </Demo>

      <Demo label="شبکه خالی" className="block">
        <ProductGrid products={[]} showOutOfStockLabel />
      </Demo>
    </Section>
  )
}
