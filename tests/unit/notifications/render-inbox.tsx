import { render } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { FirebaseWebConfig } from '@/config/env-schema'
import { NotificationsPage } from '@/features/notifications/notifications-page'
import { pushProviders } from '../push/support'

/**
 * `/account/notifications/` signed in, the shop without web push unless `firebase` is given;
 * `retry: false` so a failed read shows at once.
 */
export function renderInbox({ firebase = null }: { firebase?: FirebaseWebConfig | null } = {}) {
  const providers = pushProviders({ firebase })
  providers.client.setQueryDefaults(['notifications'], { retry: false })
  const user = userEvent.setup()
  const view = render(<NotificationsPage title="اعلان‌ها" />, { wrapper: providers.wrapper })
  return { user, client: providers.client, ...view }
}
