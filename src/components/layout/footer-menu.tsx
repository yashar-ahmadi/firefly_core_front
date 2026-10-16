import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'
import { cn } from '@/components/ui/cn'
import type { MenuNode } from '@/lib/api/types/settings'
import type { Translate } from '@/lib/i18n/translator'
import { FOOTER_HEADING } from './footer-styles'
import { MenuLink } from './menu-link'

export interface FooterColumn {
  key: string
  /** The column's own item (a `none` heading or a link with children); null for loose links. */
  heading: MenuNode | null
  title: string
  links: MenuNode[]
}

/**
 * `menu/footer` as columns (content.md §5.1): every top-level item with children is a column
 * headed by that item, and the top-level links without children are gathered into one column
 * titled `looseTitle` («لینک‌های مفید»), placed where the first of them is. A `none` heading
 * without children stays a column with its heading only.
 */
export function footerColumns(items: readonly MenuNode[], looseTitle: string): FooterColumn[] {
  const columns: FooterColumn[] = []
  let loose: FooterColumn | null = null
  for (const item of items) {
    if (item.children.length > 0 || item.url === null) {
      columns.push({
        key: `item-${item.id}`,
        heading: item,
        title: item.title,
        links: item.children,
      })
      continue
    }
    if (!loose) {
      loose = { key: 'loose', heading: null, title: looseTitle, links: [] }
      columns.push(loose)
    }
    loose.links.push(item)
  }
  return columns
}

const LINK = cn(
  'inline-flex min-h-11 items-center gap-2 rounded-control py-1 text-base text-ink-600',
  'transition-colors hover:text-brand-700 focus-visible:outline-offset-0',
)

function FooterLinks({ nodes, nested = false }: { nodes: readonly MenuNode[]; nested?: boolean }) {
  if (nodes.length === 0) return null
  return (
    <ul className={cn(nested ? 'ps-4' : 'mt-2')}>
      {nodes.map((node) => (
        <li key={node.id}>
          <MenuLink node={node} withIcon prefetch={false} className={LINK} />
          <FooterLinks nodes={node.children} nested />
        </li>
      ))}
    </ul>
  )
}

/**
 * The footer menu: columns from md, an accordion (every column closed) on phones. Both are in
 * the HTML and CSS shows one, so links never depend on JavaScript to appear on wide screens.
 */
export function FooterMenu({ items, t }: { items: readonly MenuNode[]; t: Translate }) {
  const columns = footerColumns(items, t('useful_links'))
  if (columns.length === 0) return null
  // On phones a heading that is a link moves into its panel, first («مشاهدهٔ …»).
  const panels = columns
    .map((column) => ({
      column,
      own: column.heading?.url ? column.heading : null,
    }))
    .filter(({ column, own }) => own !== null || column.links.length > 0)

  return (
    <nav aria-label={t('footer_navigation')}>
      <div className="hidden gap-x-8 gap-y-10 md:grid md:grid-cols-[repeat(auto-fill,minmax(11rem,1fr))]">
        {columns.map((column) => {
          const id = `footer-column-${column.key}`
          return (
            <section key={column.key} aria-labelledby={id} className="min-w-0">
              <h2 id={id} className={FOOTER_HEADING}>
                {column.heading ? (
                  <MenuLink
                    node={column.heading}
                    prefetch={false}
                    className="rounded-control hover:text-brand-700"
                  />
                ) : (
                  column.title
                )}
              </h2>
              <FooterLinks nodes={column.links} />
            </section>
          )
        })}
      </div>

      {panels.length > 0 && (
        <Accordion type="multiple" className="border-y border-ink-200 md:hidden">
          {panels.map(({ column, own }) => (
            <AccordionItem key={column.key} value={column.key}>
              <AccordionTrigger level={2} className="font-bold">
                {column.title}
              </AccordionTrigger>
              <AccordionContent className="pb-3">
                {own && (
                  <MenuLink node={own} prefetch={false} className={cn(LINK, 'font-medium')}>
                    {t('menu_view', { name: own.title })}
                  </MenuLink>
                )}
                <FooterLinks nodes={column.links} />
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      )}
    </nav>
  )
}
