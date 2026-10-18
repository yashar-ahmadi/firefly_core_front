import 'server-only'
import { headers } from 'next/headers'
import { ROUTE_KIND_HEADER } from '@/config/credential-routes'

/**
 * Whether this request may carry the operator's code (`extra-snippets/`: scripts, styles and the
 * visible HTML zones): only a page the proxy marked as an ordinary page. A page whose URL holds a
 * payment credential is marked `credential` and gets none, and so does anything the proxy did not
 * mark (fail closed): see src/config/credential-routes.ts.
 */
export async function operatorCodeAllowed(): Promise<boolean> {
  return (await headers()).get(ROUTE_KIND_HEADER) === 'page'
}
