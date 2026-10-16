// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { calls, envelope, failure } from '../bff/support'
import { API, GOOSHI, GOOSHI_ENCODED, loadCatalog, mockCatalogApi, nextOf } from './support'

const mocks = mockCatalogApi()

const PAGE = {
  count: 1,
  total_pages: 1,
  current_page: 1,
  page_size: 20,
  next: null,
  previous: null,
  results: [{ id: 1, review: 'خوب' }],
}

describe('getFirstComments', () => {
  it('reads page 1 of one type anonymously, cached 60 s under the product tag', async () => {
    mocks.fetch.mockImplementation(async () => envelope(PAGE))
    const { getFirstComments } = await loadCatalog()
    expect(await getFirstComments('samsung-galaxy-s25-ultra', 'question')).toEqual(PAGE)
    const [call] = calls(mocks.fetch)
    expect(call?.url).toBe(
      `${API}product/detail/samsung-galaxy-s25-ultra/comment/list/?comment_type=question&page=1`,
    )
    expect(nextOf(call)).toEqual({
      revalidate: 60,
      tags: ['product:samsung-galaxy-s25-ultra', 'catalog'],
    })
    for (const name of ['Authorization', 'X-Cart-Token', 'X-Forwarded-For'])
      expect(call?.headers.has(name), name).toBe(false)
  })

  it('encodes a Persian slug once and tags it decoded', async () => {
    mocks.fetch.mockImplementation(async () => envelope(PAGE))
    const { getFirstComments } = await loadCatalog()
    await getFirstComments(GOOSHI, 'comment')
    const [call] = calls(mocks.fetch)
    expect(call?.url).toBe(
      `${API}product/detail/${GOOSHI_ENCODED}/comment/list/?comment_type=comment&page=1`,
    )
    expect(nextOf(call)?.tags).toEqual([`product:${GOOSHI}`, 'catalog'])
  })

  it('never throws: null on a failure, logged once', async () => {
    mocks.fetch.mockImplementation(async () => failure(500, 'server_error'))
    const { getFirstComments } = await loadCatalog()
    expect(await getFirstComments('x', 'comment')).toBeNull()
    expect(mocks.error).toHaveBeenCalledTimes(1)
    mocks.fetch.mockRejectedValue(new TypeError('fetch failed'))
    expect(await getFirstComments('y', 'comment')).toBeNull()
  })

  it('asks nothing for a slug that cannot be one segment', async () => {
    const { getFirstComments } = await loadCatalog()
    expect(await getFirstComments('a/b', 'comment')).toBeNull()
    expect(mocks.fetch).not.toHaveBeenCalled()
  })
})
