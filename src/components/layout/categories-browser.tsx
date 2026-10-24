'use client'

import { ArrowRight, ChevronLeft } from 'lucide-react'
import Link from 'next/link'
import { Tabs } from 'radix-ui'
import { useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { cn } from '@/components/ui/cn'
import { IconButton } from '@/components/ui/icon-button'
import { useT } from '@/lib/i18n/i18n-context'
import { CategoryThumb } from './category-thumb'
import { categoryPath } from '@/features/catalog/listing-routes'
import type { CategoryLinkNode } from './menu-tree'

const TILE = cn(
  'flex w-full cursor-pointer flex-col items-center gap-2 rounded-card p-1 text-center',
  'transition-colors hover:text-brand-700 [&_img]:transition-transform motion-safe:hover:[&_img]:scale-105',
)

/** The children of one root; a child with children of its own opens inside the page. */
function CategoryPanel({ root }: { root: CategoryLinkNode }) {
  const t = useT()
  const [trail, setTrail] = useState<CategoryLinkNode[]>([])
  const headingRef = useRef<HTMLHeadingElement>(null)
  const current = trail.at(-1) ?? root

  // Move focus to the new heading, so keyboard and screen-reader users follow the change.
  const go = (next: CategoryLinkNode[]) => {
    flushSync(() => setTrail(next))
    headingRef.current?.focus()
  }

  return (
    <>
      <div className="mb-5 flex min-h-11 items-center gap-2">
        {trail.length > 0 && (
          <IconButton
            label={t('back')}
            icon={<ArrowRight className="ltr:rotate-180" />}
            size="sm"
            onClick={() => go(trail.slice(0, -1))}
            className="-ms-2"
          />
        )}
        <h2
          ref={headingRef}
          tabIndex={-1}
          className="min-w-0 flex-1 text-lg leading-8 font-bold text-ink-900 outline-none"
        >
          {current.name}
        </h2>
        <Link
          href={categoryPath(current.path)}
          className="inline-flex min-h-11 shrink-0 items-center gap-1 rounded-control text-sm font-medium text-brand-700 hover:text-brand-800"
        >
          {t('see_all')}
          <ChevronLeft aria-hidden className="size-4 ltr:rotate-180" />
        </Link>
      </div>
      {current.children.length > 0 ? (
        <ul className="grid grid-cols-3 gap-x-2 gap-y-5 sm:grid-cols-4 lg:grid-cols-5">
          {current.children.map((child) => {
            const content = (
              <>
                <CategoryThumb category={child} className="size-16 text-xl sm:size-20" />
                <span className="line-clamp-2 text-sm leading-6 font-medium text-ink-800">
                  {child.name}
                </span>
              </>
            )
            return (
              <li key={child.id}>
                {child.children.length > 0 ? (
                  <button type="button" className={TILE} onClick={() => go([...trail, child])}>
                    {content}
                  </button>
                ) : (
                  <Link href={categoryPath(child.path)} className={TILE}>
                    {content}
                  </Link>
                )}
              </li>
            )
          })}
        </ul>
      ) : (
        <p className="text-base text-ink-600">{t('subcategories_empty')}</p>
      )}
    </>
  )
}

/**
 * The two-pane category browser of `/categories/` (the phone's "categories" tab): the roots as
 * vertical tabs at the start, the chosen root's children as round tiles beside them.
 */
export function CategoriesBrowser({
  categories,
  className,
}: {
  categories: readonly CategoryLinkNode[]
  className?: string
}) {
  const t = useT()
  const [selected, setSelected] = useState(() => String(categories[0]?.id ?? ''))
  if (categories.length === 0) return null

  return (
    <Tabs.Root
      dir="rtl"
      orientation="vertical"
      value={selected}
      onValueChange={setSelected}
      className={cn('flex items-stretch bg-white', className)}
    >
      <div className="w-28 shrink-0 border-e border-ink-200 bg-ink-100 sm:w-40 md:w-56">
        <Tabs.List
          aria-label={t('categories')}
          className={cn(
            'sticky top-(--header-offset) flex flex-col overflow-y-auto overscroll-contain py-1 transition-[top] duration-200',
            'max-h-[calc(100dvh-var(--header-offset)-4rem)] md:max-h-[calc(100dvh-var(--header-offset))]',
          )}
        >
          {categories.map((root) => (
            <Tabs.Trigger
              key={root.id}
              value={String(root.id)}
              className={cn(
                'relative min-h-14 cursor-pointer px-3 py-2.5 text-start text-sm leading-6 font-medium text-ink-700 md:px-4 md:text-base',
                'transition-colors hover:text-brand-700 focus-visible:-outline-offset-2',
                'before:absolute before:inset-y-2 before:start-0 before:w-1 before:rounded-e-full',
                'data-[state=active]:bg-white data-[state=active]:font-bold data-[state=active]:text-brand-700 data-[state=active]:before:bg-brand',
              )}
            >
              {root.name}
            </Tabs.Trigger>
          ))}
        </Tabs.List>
      </div>
      {/* Every root's panel is mounted, so all their links are in the server's HTML (spec
          §8.13); `hidden` (over Radix's own, false when forced) shows the chosen one only, and
          the key remounts a panel when it hides: a root chosen again starts at its own level. */}
      {categories.map((root) => {
        const shown = selected === String(root.id)
        return (
          <Tabs.Content
            key={root.id}
            value={String(root.id)}
            forceMount
            hidden={!shown}
            className="min-w-0 flex-1 p-4 focus-visible:-outline-offset-2 md:p-6"
          >
            <CategoryPanel key={String(shown)} root={root} />
          </Tabs.Content>
        )
      })}
    </Tabs.Root>
  )
}
