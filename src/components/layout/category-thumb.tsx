'use client'

import { useState } from 'react'
import { cn } from '@/components/ui/cn'
import { SmartImage } from '@/components/ui/smart-image'
import { isPlaceholderImage, type CategoryLinkNode } from './menu-tree'

/**
 * A category's round picture: its image (or icon), else, when the API only has its grey
 * placeholder or the file fails, the first letter of the name on a brand tint. Decorative: the
 * name is always shown next to it.
 */
export function CategoryThumb({
  category,
  className,
}: {
  category: Pick<CategoryLinkNode, 'name' | 'image' | 'icon'>
  className?: string
}) {
  const src = [category.image, category.icon].find((url) => !isPlaceholderImage(url))
  const [failed, setFailed] = useState<string | null>(null)

  if (!src || failed === src) {
    return (
      <span
        aria-hidden
        className={cn(
          'grid shrink-0 place-items-center rounded-full bg-brand-50 text-2xl font-bold text-brand-700 ring-1 ring-brand-100',
          className,
        )}
      >
        {Array.from(category.name.trim())[0] ?? ''}
      </span>
    )
  }
  return (
    <SmartImage
      src={src}
      alt=""
      ratio="1/1"
      sizes="80px"
      onError={() => setFailed(src)}
      className={cn('shrink-0 rounded-full bg-ink-100 ring-1 ring-ink-200', className)}
    />
  )
}
