'use client'

import { Button } from '@/components/ui/button'

/** «تلاش دوباره»: loads the page again, which reads the settings again. */
export function ReloadButton() {
  return (
    <Button size="lg" fullWidth onClick={() => window.location.reload()}>
      تلاش دوباره
    </Button>
  )
}
