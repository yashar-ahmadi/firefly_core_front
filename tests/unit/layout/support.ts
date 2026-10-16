import type { CategoryNode, MenuNode } from '@/lib/api/types/settings'

// Builders for menu and category fixtures used by the layout tests.

export interface MenuNodeInit {
  id: number
  title: string
  /** Defaults to `/x/<id>/`; `null` makes a group heading (`link_type: 'none'`). */
  url?: string | null
  link_type?: MenuNode['link_type']
  open_in_new_tab?: boolean
  icon?: string | null
  children?: MenuNode[]
}

export function menuNode(init: MenuNodeInit): MenuNode {
  const url = init.url === undefined ? `/x/${init.id}/` : init.url
  const linkType = init.link_type ?? (url === null ? 'none' : 'url')
  const target =
    linkType === 'none' || linkType === 'url'
      ? null
      : { type: linkType, id: init.id, slug: url?.split('/').filter(Boolean).at(-1) ?? '' }
  return {
    id: init.id,
    title: init.title,
    link_type: linkType,
    url,
    open_in_new_tab: init.open_in_new_tab ?? false,
    icon: init.icon ?? null,
    target,
    children: init.children ?? [],
  } as MenuNode
}

export interface CategoryNodeInit {
  id: number
  name: string
  path: string
  image?: string
  icon?: string
  children?: CategoryNode[]
}

const PLACEHOLDER = 'https://api.shop.ir/static/defaults/default.png'

export function categoryNode(init: CategoryNodeInit): CategoryNode {
  return {
    id: init.id,
    name: init.name,
    slug: init.path.split('/').at(-1) ?? init.path,
    path: init.path,
    parent_id: null,
    short_description: null,
    image: init.image ?? PLACEHOLDER,
    icon: init.icon ?? PLACEHOLDER,
    show_in_homepage: false,
    default_sorting: null,
    product_count: 0,
    created: '2026-09-13T10:00:00+03:30',
    updated: '2026-09-13T10:00:00+03:30',
    children: init.children ?? [],
  }
}

/** The dev sample tree, trimmed: two roots, the first with two children. */
export function sampleTree(): CategoryNode[] {
  return [
    categoryNode({
      id: 10001,
      name: 'کالای دیجیتال',
      path: 'digital',
      children: [
        categoryNode({ id: 10002, name: 'گوشی موبایل', path: 'digital/mobile-phone' }),
        categoryNode({ id: 10003, name: 'لپ تاپ و الترابوک', path: 'digital/laptop' }),
      ],
    }),
    categoryNode({ id: 10008, name: 'لوازم خانگی', path: 'home-appliance' }),
  ]
}
