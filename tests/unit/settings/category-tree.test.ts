// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { buildCategoryTree } from '@/features/settings/category-tree'
import type { CategoryCard, CategoryNode } from '@/lib/api/types/settings'
import { calls, envelope, stubEnv, type FetchSpy } from '../bff/support'

function card(id: number, parent_id: number | null, path = `c${id}`): CategoryCard {
  return {
    id,
    name: `دسته ${id}`,
    slug: path.split('/').at(-1) ?? path,
    path,
    parent_id,
    short_description: null,
    image: 'http://x/i.png',
    icon: 'http://x/i.png',
    show_in_homepage: false,
    default_sorting: null,
    product_count: 0,
    created: '2025-01-01T00:00:00+03:30',
    updated: '2025-01-01T00:00:00+03:30',
  }
}

const ids = (nodes: Array<{ id: number }>) => nodes.map((n) => n.id)
const allIds = (nodes: CategoryNode[]): number[] =>
  nodes.flatMap((node) => [node.id, ...allIds(node.children)])

describe('buildCategoryTree', () => {
  it('nests children under their parent and keeps API order at every level', () => {
    const tree = buildCategoryTree([
      card(1, null),
      card(2, 1),
      card(3, 1),
      card(4, 2),
      card(5, null),
      card(6, 5),
    ])
    expect(ids(tree)).toEqual([1, 5])
    expect(ids(tree[0]!.children)).toEqual([2, 3])
    expect(ids(tree[0]!.children[0]!.children)).toEqual([4])
    expect(tree[0]!.children[1]!.children).toEqual([])
    expect(ids(tree[1]!.children)).toEqual([6])
  })

  it('keeps every card field on the node', () => {
    const [root] = buildCategoryTree([card(1, null, 'digital')])
    expect(root).toMatchObject({ id: 1, path: 'digital', slug: 'digital', children: [] })
  })

  it('makes a node whose parent is missing a root, in position', () => {
    const tree = buildCategoryTree([card(1, null), card(2, 99), card(3, 1)])
    expect(ids(tree)).toEqual([1, 2])
    expect(ids(tree[0]!.children)).toEqual([3])
  })

  it('does not nest a node under itself, and ignores duplicate ids', () => {
    const tree = buildCategoryTree([card(1, 1), card(2, null), card(2, null), card(3, 2)])
    expect(ids(tree)).toEqual([1, 2])
    expect(ids(tree[1]!.children)).toEqual([3])
  })

  it('breaks a longer parent cycle instead of dropping its nodes', () => {
    const tree = buildCategoryTree([card(1, 2), card(2, 3), card(3, 1), card(4, null)])
    expect(ids(tree).sort()).toEqual([1, 4])
    expect(allIds(tree).sort()).toEqual([1, 2, 3, 4])
    expect(() => JSON.stringify(tree)).not.toThrow()
  })

  it('breaks a two-node cycle, keeping a branch that hangs off it under its parent', () => {
    // 1 <-> 2 is the loop; 3 is a child of 1 and 4 a child of 3.
    const tree = buildCategoryTree([card(5, null), card(1, 2), card(2, 1), card(3, 1), card(4, 3)])
    expect(ids(tree)).toEqual([5, 1])
    expect(allIds(tree).sort()).toEqual([1, 2, 3, 4, 5])
    const loopRoot = tree[1]!
    expect(ids(loopRoot.children).sort()).toEqual([2, 3])
    expect(() => JSON.stringify(tree)).not.toThrow()
  })

  it('leaves a healthy tree untouched when another part has a cycle', () => {
    const tree = buildCategoryTree([card(1, null), card(2, 1), card(3, 4), card(4, 3)])
    expect(ids(tree[0]!.children)).toEqual([2])
    expect(allIds(tree).sort()).toEqual([1, 2, 3, 4])
  })

  it('does not mutate its input', () => {
    const input = [card(1, null), card(2, 1)]
    buildCategoryTree(input)
    expect(input[0]).not.toHaveProperty('children')
  })

  it('returns [] for an empty list', () => {
    expect(buildCategoryTree([])).toEqual([])
  })
})

describe('getCategoryTree', () => {
  let fetchSpy: FetchSpy

  beforeEach(() => {
    stubEnv()
    fetchSpy = vi.spyOn(globalThis, 'fetch')
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
    vi.resetModules()
    vi.doUnmock('server-only')
  })

  it('reads every page of category/list/ with limit 100 and builds the tree', async () => {
    fetchSpy.mockImplementation(async (input) =>
      String(input).endsWith('page=1')
        ? envelope({ next: 'http://api/x?page=2', results: [card(1, null), card(2, 1)] })
        : envelope({ next: null, results: [card(3, 1), card(4, null), { id: 'bad' }] }),
    )
    vi.resetModules()
    vi.doMock('server-only', () => ({}))
    const { getCategoryTree } = await import('@/features/settings/api')
    const tree = await getCategoryTree()
    expect(ids(tree)).toEqual([1, 4])
    expect(ids(tree[0]!.children)).toEqual([2, 3])
    const [first] = calls(fetchSpy)
    expect(first?.url).toBe('https://api.test/api/v1/product/category/list/?limit=100&page=1')
    expect((first?.init as { next?: unknown }).next).toEqual({
      revalidate: 300,
      tags: ['categories'],
    })
  })
})
