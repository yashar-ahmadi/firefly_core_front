import { describe, expect, it } from 'vitest'
import {
  categoryLinks,
  categoryTree,
  childCategories,
  postCategory,
} from '@/features/blog/blog-categories'
import type { BlogCategoryListItem } from '@/lib/api/types/blog'

// The flat category list (tree pre-order, blog digest §1.6) as the blog's links: a path for each
// published category, its children, the sidebar's tree (a child of a draft parent is a root),
// and the category a card shows (a draft category has no page: its name, unlinked).

function category(id: number, path: string, parent_id: number | null): BlogCategoryListItem {
  const slug = path.split('/').at(-1)!
  return {
    id,
    name: `دسته ${id}`,
    slug,
    path,
    parent_id,
    short_description: null,
    image: '',
    icon: '',
    post_count: 1,
    created: '',
    updated: '',
  }
}

const LIST = [
  category(1, 'tech-news', null),
  category(6, 'tech-news/mobile-blog', 1),
  category(2, 'buying-guide', null),
  category(7, 'buying-guide/appliance-blog', 2),
  // Its parent (99) is a draft, missing from the list.
  category(8, 'hidden/orphan', 99),
]

describe('blog categories', () => {
  it('links each published category by id to /blog/category/<path>/', () => {
    const links = categoryLinks(LIST)
    expect(links.get(6)).toBe('/blog/category/tech-news/mobile-blog/')
    expect(links.get(8)).toBe('/blog/category/hidden/orphan/')
    expect(links.has(99)).toBe(false)
  })

  it('a category’s children, in the API’s order; the top level with the orphans', () => {
    expect(childCategories(LIST, 1).map((c) => c.id)).toEqual([6])
    expect(childCategories(LIST, 6)).toEqual([])
    expect(childCategories(LIST, null).map((c) => c.id)).toEqual([1, 2, 8])
  })

  it('the tree in one pass: roots in order, each with its children; an orphan is a root', () => {
    const tree = categoryTree(LIST)
    expect(tree.map((node) => [node.id, node.children.map((child) => child.id)])).toEqual([
      [1, [6]],
      [2, [7]],
      [8, []],
    ])
    expect(tree[0]).toMatchObject({ name: 'دسته 1', href: '/blog/category/tech-news/' })
  })

  it('a card’s category: its first published one, linked; a draft one only named', () => {
    const links = categoryLinks(LIST)
    const draft = { id: 99, name: 'پیش‌نویس', slug: 'hidden', parent_id: null }
    const mobile = { id: 6, name: 'گوشی', slug: 'mobile-blog', parent_id: 1 }
    expect(postCategory([draft, mobile], links)).toEqual({
      name: 'گوشی',
      href: '/blog/category/tech-news/mobile-blog/',
    })
    expect(postCategory([draft], links)).toEqual({ name: 'پیش‌نویس', href: null })
    expect(postCategory([], links)).toBeNull()
  })
})
