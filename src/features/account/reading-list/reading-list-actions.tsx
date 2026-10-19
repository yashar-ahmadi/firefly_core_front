'use client'

import { Button } from '@/components/ui/button'
import { useFeature } from '@/features/settings/feature-context'
import { useListUrl } from '../lists/use-list-url'
import { parseReadingListParams, readingListSearch } from './reading-list-params'

const PATH = '/account/reading-list/'

/** «نمایش همه مطالب»: the search and the category cleared (the sort kept), in place of the URL. */
export function ClearReadingListFilters() {
  const url = useListUrl(PATH, parseReadingListParams, readingListSearch)
  return (
    <Button
      variant="outline"
      onClick={() => url.replace({ ...url.params, search: '', category: null, page: 1 })}
    >
      نمایش همه مطالب
    </Button>
  )
}

/** The operator's reason for switching the blog off, as the page knows it (else a calm sentence). */
export function BlogOffReason() {
  const { reason } = useFeature('blog')
  return <>{reason ?? 'به\u{200C}زودی برمی\u{200C}گردیم. لطفاً کمی بعد سر بزنید.'}</>
}
