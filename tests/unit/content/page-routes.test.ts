import { describe, expect, it } from 'vitest'
import { CONTACT_US_PATH, contentPagePath } from '@/features/content/pages/page-routes'

// A content page's URL (content digest §10.1): `/page/<slug>/`, except the operator's
// `contact-us` page, whose home is the contact page at `/contact-us/` (the backend's
// `support_link`; `/page/contact-us/` redirects there), so the shop's own links never take the
// redirect's extra hop.

describe('contentPagePath', () => {
  it('is /page/<slug>/, a Persian slug percent-encoded once', () => {
    expect(contentPagePath('about-us')).toBe('/page/about-us/')
    expect(contentPagePath('شرایط-ارسال')).toBe(`/page/${encodeURIComponent('شرایط-ارسال')}/`)
  })

  it('is /contact-us/ for the contact-us page', () => {
    expect(CONTACT_US_PATH).toBe('/contact-us/')
    expect(contentPagePath('contact-us')).toBe('/contact-us/')
  })
})
