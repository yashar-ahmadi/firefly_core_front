'use client'

import { Bookmark } from 'lucide-react'
import { useState } from 'react'
import { cn } from '@/components/ui/cn'
import { overlayButtonClasses } from '@/components/ui/overlay-button-styles'
import {
  ReadingListScope,
  useReadingListScope,
  type ReadingListScopeValue,
} from './reading-list-scope'

const LABEL_SAVE = 'افزودن به لیست مطالعه'
const LABEL_REMOVE = 'حذف از لیست مطالعه'

export interface ReadingListButtonProps {
  post: { id: number; slug: string }
  /** The id of the element naming the post (the card's title), for `aria-describedby`. */
  describedBy?: string
  className?: string
}

/**
 * The bookmark: pressed (and filled) while the post is in the reading list. A guest sees it too
 * and is sent to the login page (as the wishlist's heart does). The server and hydration render
 * it unpressed (the page is the same for everyone); the saved state shows from the first client
 * render. While a signed-in visitor's ids load it is `aria-disabled` and ignores presses (a press
 * could not know which way to go), and one press is one request: presses while it is on its way
 * are ignored. Gone while the blog is switched off. 44px. Reads the grid's scope, or its own.
 */
export function ReadingListButton(props: ReadingListButtonProps) {
  const scope = useReadingListScope()
  if (!scope) {
    return (
      <ReadingListScope>
        <ReadingListButton {...props} />
      </ReadingListScope>
    )
  }
  return <ScopedButton {...props} scope={scope} />
}

function ScopedButton({
  post,
  describedBy,
  className,
  scope,
}: ReadingListButtonProps & { scope: ReadingListScopeValue }) {
  const [pending, setPending] = useState(false)
  if (!scope.enabled) return null
  const saved = scope.hydrated && scope.saved.has(post.id)
  const waiting = scope.hydrated && scope.savedLoading

  const onPress = () => {
    if (waiting || pending) return
    setPending(true)
    void scope.toggle(post).finally(() => setPending(false))
  }

  return (
    <button
      type="button"
      aria-pressed={saved}
      aria-label={saved ? LABEL_REMOVE : LABEL_SAVE}
      aria-describedby={describedBy}
      aria-disabled={waiting || undefined}
      onClick={onPress}
      className={cn(
        overlayButtonClasses('sm'),
        'text-ink-600 hover:bg-ink-50 hover:text-ink-900',
        saved && 'text-brand-700 hover:text-brand-800',
        className,
      )}
    >
      <Bookmark aria-hidden className={cn('size-5', saved && 'fill-current')} />
    </button>
  )
}
