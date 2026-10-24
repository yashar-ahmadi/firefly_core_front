import { describe, expect, it } from 'vitest'
import { mediaOnSite } from '@/features/seo/site-media'

// A blog page's picture for the social cards (og:image), on the shop's origin as its structured
// data has it: both topologies serve /media/ and /static/ there (docs/DEPLOYMENT.md).

describe('mediaOnSite', () => {
  it('a picture under /media/ or /static/ on the shop’s origin (where both topologies serve it)', () => {
    expect(mediaOnSite('http://localhost:8000/media/CACHE/a.jpg', 'https://shop.ir/')).toBe(
      'https://shop.ir/media/CACHE/a.jpg',
    )
    expect(mediaOnSite('https://api.shop.ir/static/d.png?v=2', 'https://shop.ir')).toBe(
      'https://shop.ir/static/d.png?v=2',
    )
  })

  it('anything else as it is', () => {
    expect(mediaOnSite('https://cdn.example/a.jpg', 'https://shop.ir')).toBe(
      'https://cdn.example/a.jpg',
    )
    expect(mediaOnSite('/media/a.jpg', 'https://shop.ir')).toBe('/media/a.jpg')
    expect(mediaOnSite(null, 'https://shop.ir')).toBeNull()
  })
})
