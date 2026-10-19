// Where a bank handoff may send the browser (order digest §5.4; Plan 4 final fix wave). The URL
// comes from the API, and a misbehaving backend's `javascript:` or `data:` URL given to
// `location.assign` or to a form's `action` would run on the shop's own origin. So only `https:`
// leaves: every gateway's payment page is https, as a production storefront is. `http:` is let
// through only in a build that is not production (`next dev`, the unit tests: a sandbox gateway
// on a developer's machine); not by the backend's base URL, which the browser does not know (the
// media origin it has says nothing of where a bank is). A URL refused here is the bank not
// answering (`gateway_unavailable`, said where the answer arrives: nothing saved for the way
// back), and `goToBank` refuses it too, before anything happens. Pure.

export class UnsafeHandoffError extends Error {
  constructor() {
    super('The bank handoff leads to no https page.')
    this.name = 'UnsafeHandoffError'
  }
}

/** The handoff's URL when it may be a bank's page, else null. */
export function bankUrl(raw: string): URL | null {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return null
  }
  if (url.protocol === 'https:') return url
  return url.protocol === 'http:' && process.env.NODE_ENV !== 'production' ? url : null
}
