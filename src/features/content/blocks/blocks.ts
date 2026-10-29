import type { BlockPlacement, PageBlock, PageBlockType } from '@/lib/api/types/page'

// A content page's optional blocks (content digest §2, «بلوک‌های صفحه»): what the storefront
// reads of them before drawing. Pure.

export const BLOCK_TYPES: readonly PageBlockType[] = [
  'slider',
  'banners',
  'gallery',
  'cards',
  'stats',
  'testimonials',
  'faq',
  'video',
  'call_to_action',
  'rich_text',
  'contact_info',
]

/** Whether the storefront draws this type (a type added to the backend later is skipped). */
export function isBlockType(type: string): type is PageBlockType {
  return (BLOCK_TYPES as readonly string[]).includes(type)
}

/** Where a block goes: `before_content` as sent, anything else after the content (the default). */
export function blockPlacement(placement: string): BlockPlacement {
  return placement === 'before_content' ? 'before_content' : 'after_content'
}

/** The blocks drawn at `placement`, in the API's order, unknown types left out. */
export function blocksAt(blocks: readonly PageBlock[], placement: BlockPlacement): PageBlock[] {
  return blocks.filter(
    (block) => isBlockType(block.type) && blockPlacement(block.placement) === placement,
  )
}

/** Trimmed text, "" for null. */
export function text(value: string | null | undefined): string {
  return value?.trim() ?? ''
}

/** The id of a block's heading (`aria-labelledby`). */
export function blockHeadingId(block: Pick<PageBlock, 'id'>): string {
  return `page-block-${block.id}`
}
