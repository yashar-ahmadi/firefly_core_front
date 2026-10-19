import { describe, expect, it } from 'vitest'
import { videoEmbedUrl } from '@/features/linker/video-embed'

// A linker video is embedded only for Aparat and YouTube (content digest §8), at each provider's
// own embed address: Aparat's `/v/<hash>` → `/video/video/embed/videohash/<hash>/vt/frame`
// (Aparat's embed code), YouTube's `watch?v=<id>` and `youtu.be/<id>` → `/embed/<id>`. Anything
// else, a look-alike host included, is no embed (the link shows as a button).

const APARAT = (hash: string) =>
  `https://www.aparat.com/video/video/embed/videohash/${hash}/vt/frame`
const YOUTUBE = (id: string) => `https://www.youtube.com/embed/${id}`

describe('videoEmbedUrl', () => {
  it.each([
    ['https://www.aparat.com/v/rajj65c', APARAT('rajj65c')],
    ['https://aparat.com/v/iNgzs/', APARAT('iNgzs')],
    ['http://www.aparat.com/v/b4jv2/عنوان-ویدیو', APARAT('b4jv2')],
  ])('Aparat: %s', (url, embed) => {
    expect(videoEmbedUrl(url)).toBe(embed)
  })

  it.each([
    ['https://www.youtube.com/watch?v=dQw4w9WgXcQ', YOUTUBE('dQw4w9WgXcQ')],
    ['https://youtube.com/watch?v=dQw4w9WgXcQ&t=42s', YOUTUBE('dQw4w9WgXcQ')],
    ['https://m.youtube.com/watch?feature=share&v=a_B-c1d2e3F', YOUTUBE('a_B-c1d2e3F')],
    ['https://youtu.be/dQw4w9WgXcQ', YOUTUBE('dQw4w9WgXcQ')],
    ['https://youtu.be/dQw4w9WgXcQ?si=abc123', YOUTUBE('dQw4w9WgXcQ')],
  ])('YouTube: %s', (url, embed) => {
    expect(videoEmbedUrl(url)).toBe(embed)
  })

  it.each([
    'https://vimeo.com/123456',
    'https://www.aparat.com/u/some-channel',
    'https://www.aparat.com/v/',
    'https://www.youtube.com/watch?v=short',
    'https://www.youtube.com/channel/UC123',
    'https://evil.example/watch?v=dQw4w9WgXcQ',
    'https://www.youtube.com.evil.example/watch?v=dQw4w9WgXcQ',
    'https://notaparat.com/v/abc12',
    'https://youtu.be/dQw4w9WgXcQ/extra',
    'ftp://www.aparat.com/v/abc12',
    'javascript:alert(1)',
    '/product/list/flagship-phones/',
    '',
  ])('no embed for %s', (url) => {
    expect(videoEmbedUrl(url)).toBeNull()
  })
})
