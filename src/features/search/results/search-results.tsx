import { FileText, LockKeyhole } from 'lucide-react'
import { CategoryThumb } from '@/components/layout/category-thumb'
import { toCardProduct } from '@/features/catalog/card-product'
import { ProductGrid } from '@/features/catalog/components/product-grid'
import { blogPostPath } from '@/features/blog/blog-routes'
import { brandPath, categoryPath } from '@/features/catalog/listing-routes'
import { contentPagePath } from '@/features/content/pages/page-routes'
import type { SearchResults as Results } from '@/lib/api/types/search'
import {
  CompactList,
  ResultGroup,
  seeAllHref,
  type CompactItem,
  type ResultKind,
} from './result-group'

const TITLES: Record<ResultKind, string> = {
  products: 'محصولات',
  product_categories: 'دسته\u{200C}بندی\u{200C}ها',
  brands: 'برندها',
  blog_posts: 'مطالب وبلاگ',
  pages: 'صفحه\u{200C}ها',
}

const ROUND_THUMB = 'size-11 text-lg'
const SQUARE_THUMB = 'size-11 shrink-0 rounded-control border border-ink-100 bg-white text-lg'

function compactItems(results: Results, kind: Exclude<ResultKind, 'products'>): CompactItem[] {
  switch (kind) {
    case 'product_categories':
      return results.product_categories.items.map((category) => ({
        key: category.id,
        href: categoryPath(category.path),
        name: category.name,
        thumb: <CategoryThumb category={category} sizes="44px" className={ROUND_THUMB} />,
      }))
    case 'brands':
      return results.brands.items.map((brand) => ({
        key: brand.id,
        href: brandPath(brand.slug),
        name: brand.name,
        thumb: (
          <CategoryThumb category={brand} fit="contain" sizes="44px" className={SQUARE_THUMB} />
        ),
      }))
    case 'blog_posts':
      return results.blog_posts.items.map((post) => ({
        key: post.id,
        href: blogPostPath(post.slug),
        name: post.name,
        description: post.description,
        // The cover, or the title's first letter while the API has only its placeholder.
        thumb: <CategoryThumb category={post} sizes="44px" className={SQUARE_THUMB} />,
        // A post's page counts a view on every render (ruling P5-R1): never prefetched.
        prefetch: false,
      }))
    case 'pages':
      return results.pages.items.map((page) => ({
        key: page.id,
        // A page counts no views (the backend's `PageDetailView`, `pages/views.py`, has no view
        // counter; docs/ARCHITECTURE.md, «Content pages»): prefetched as any shop link.
        href: contentPagePath(page.slug),
        name: page.title,
        // A page for signed-in visitors only (content digest §2): it sends a guest to login.
        description: page.requires_login
          ? 'ویژه\u{0654} اعضا؛ با ورود به حساب باز می\u{200C}شود'
          : null,
        thumb: (
          <span
            aria-hidden
            className="grid size-11 shrink-0 place-items-center rounded-full bg-brand-50 text-brand-700"
          >
            {page.requires_login ? (
              <LockKeyhole className="size-5" />
            ) : (
              <FileText className="size-5" />
            )}
          </span>
        ),
      }))
  }
}

const COMPACT_KINDS = ['product_categories', 'brands', 'blog_posts', 'pages'] as const

/**
 * The results of a search, group by group in the API's order: products as the listing grid
 * (with the shared add slot: one tap for a simple product, quick view for a variable one),
 * then categories, brands, blog posts and pages as compact lists. A group with nothing found
 * is left out (content digest §7.1), and so are the posts while the blog is switched off
 * (`blogEnabled`; the API sends none then anyway).
 */
export function SearchResults({
  results,
  showOutOfStockLabel,
  blogEnabled = true,
}: {
  results: Results
  showOutOfStockLabel: boolean
  blogEnabled?: boolean
}) {
  const { products } = results
  return (
    <div className="flex flex-col gap-8 md:gap-10">
      {products.items.length > 0 && (
        <ResultGroup
          kind="products"
          title={TITLES.products}
          count={products.count}
          seeAll={seeAllHref('products', products)}
        >
          <ProductGrid
            products={products.items.map(toCardProduct)}
            showOutOfStockLabel={showOutOfStockLabel}
            withAction
            label={TITLES.products}
          />
        </ResultGroup>
      )}
      {COMPACT_KINDS.map((kind) => {
        const group = results[kind]
        if (group.items.length === 0 || (kind === 'blog_posts' && !blogEnabled)) return null
        return (
          <ResultGroup
            key={kind}
            kind={kind}
            title={TITLES[kind]}
            count={group.count}
            seeAll={seeAllHref(kind, group)}
          >
            <CompactList items={compactItems(results, kind)} />
          </ResultGroup>
        )
      })}
    </div>
  )
}
