import { expect, type APIRequestContext } from '@playwright/test'

// The links the header's menus show (`navItems`, components/layout/menu-tree.ts): the operator's
// `menu/main`, or the category tree while that menu is empty. Read through the BFF (read only).

const HEADERS = { 'X-Requested-With': 'ff' }

interface MenuItem {
  url: string | null
  children: MenuItem[]
}

const urlsOf = (items: MenuItem[]): string[] =>
  items.flatMap((item) => [...(item.url === null ? [] : [item.url]), ...urlsOf(item.children)])

async function read(request: APIRequestContext, path: string): Promise<unknown> {
  const response = await request.get(`/api/bff/${path}`, { headers: HEADERS })
  expect(response.ok(), path).toBe(true)
  return ((await response.json()) as { data: unknown }).data
}

/** Every URL of the header's menu, as its links' `href` (own-origin URLs as paths). */
export async function menuLinkUrls(request: APIRequestContext, origin: string): Promise<string[]> {
  const menu = (await read(request, 'menu/main/')) as { items: MenuItem[] }
  let urls = urlsOf(menu.items)
  if (urls.length === 0) {
    const paths: string[] = []
    for (let page = 1; page <= 20; page++) {
      const data = (await read(request, `product/category/list/?limit=100&page=${page}`)) as {
        results: { path: string }[]
        next: string | null
      }
      paths.push(
        ...data.results.map(
          (category) =>
            `/product-category/${category.path.split('/').map(encodeURIComponent).join('/')}/`,
        ),
      )
      if (!data.next) break
    }
    urls = paths
  }
  return urls.map((url) => (url.startsWith(origin) ? url.slice(origin.length) || '/' : url))
}

/** The `href` of every `<a>` in a page's HTML as served (entities decoded). */
export function hrefsIn(html: string): Set<string> {
  return new Set(
    [...html.matchAll(/<a\s[^>]*?href="([^"]*)"/g)].map((match) =>
      match[1]!.replaceAll('&amp;', '&').replaceAll('&quot;', '"').replaceAll('&#x27;', "'"),
    ),
  )
}
