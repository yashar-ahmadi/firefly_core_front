import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { isValidElement, type ReactElement, type ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { clearMissing } from '@/features/catalog/loaders/missing'
import { DynamicSlot } from '@/features/content/dynamic/dynamic-slot'
import { ApiError } from '@/lib/api/errors'
import type { DynamicContentGroup } from '@/lib/api/types/dynamic-content'
import { stubBrowserApis } from '../support/dom-stubs'
import { resolveServerTree } from '../support/server-tree'
import { group, item, TERMS } from './dynamic-fixtures'

// DynamicSlot (Plan 5 Task 5): an operator's message slot. `inline` is server HTML only (no client
// code): the descriptions as content blocks, the warnings as a distinct note box with an icon
// and a title, all through the shared sanitiser. `dialog-link` is a small button whose dialog's
// code loads on the first press, the content already rendered on the server; no content, no
// button. A missing slot (404) or any failure renders nothing.

const apiFetch = vi.hoisted(() => vi.fn())
const loaded = vi.hoisted(() => new Set<string>())
vi.mock('server-only', () => ({}))
vi.mock('@/lib/api/server', () => ({ apiFetch }))
vi.mock('@/config/store-config', async () => {
  const pure = await import('@/config/resolve-store-config')
  const { parseServerEnv } = await import('@/config/env-schema')
  const config = pure.resolveStoreConfig(
    parseServerEnv({ FIREFLY_API_URL: 'https://api.shop.ir/', SITE_URL: 'https://shop.ir/' }),
  )
  return { ...pure, getStoreConfig: () => config }
})
vi.mock('@/features/content/dynamic/slot-dialog', async (importOriginal) => {
  loaded.add('slot-dialog')
  return importOriginal()
})

stubBrowserApis()

function answer(data: DynamicContentGroup | ApiError) {
  apiFetch.mockImplementation(() =>
    data instanceof ApiError
      ? Promise.reject(data)
      : Promise.resolve({ data, msg: '', status: 200, headers: new Headers() }),
  )
}

async function slot(props: Parameters<typeof DynamicSlot>[0]) {
  return resolveServerTree(await DynamicSlot(props))
}

async function show(props: Parameters<typeof DynamicSlot>[0]) {
  return render(<>{await slot(props)}</>)
}

/** Every element type in a resolved tree, its children and any element passed as a prop. */
function types(node: ReactNode, into: unknown[] = []): unknown[] {
  if (Array.isArray(node)) node.forEach((child) => types(child, into))
  if (!isValidElement(node)) return into
  const element = node as ReactElement<Record<string, unknown>>
  into.push(element.type)
  for (const value of Object.values(element.props)) types(value as ReactNode, into)
  return into
}

const NOT_FOUND = new ApiError({ status: 404, code: 'not_found', detail: 'یافت نشد.' })

beforeEach(() => {
  apiFetch.mockReset()
  clearMissing()
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
})

describe('DynamicSlot inline', () => {
  it('renders nothing for a 404 (no such slot, or switched off), nor for a failure', async () => {
    answer(NOT_FOUND)
    expect(await DynamicSlot({ pageType: 'home', variant: 'inline' })).toBeNull()
    answer(new ApiError({ status: 503, code: 'http_503' }))
    expect(await DynamicSlot({ pageType: 'cart', variant: 'inline' })).toBeNull()
  })

  it('renders nothing for an empty slot, or one with nothing visible left', async () => {
    answer(group({ warnings: [] }))
    expect(await DynamicSlot({ pageType: 'terms', variant: 'inline' })).toBeNull()
    answer(
      group({ warnings: [item(1, 'warning', { content: '<p>&nbsp;</p><script>x()</script>' })] }),
    )
    expect(await DynamicSlot({ pageType: 'product', variant: 'inline' })).toBeNull()
    answer({ ...TERMS, descriptions: null, warnings: 'x' } as unknown as DynamicContentGroup)
    expect(await DynamicSlot({ pageType: 'checkout', variant: 'inline' })).toBeNull()
  })

  it('descriptions as content blocks, warnings as a note box with an icon and a title', async () => {
    answer(
      group({
        descriptions: [
          item(1, 'description', {
            title: 'ساعات ارسال',
            content: '<p>ارسال روزانه تا ساعت ۱۶.</p>',
          }),
          item(2, 'description', { content: '<p>بدون عنوان</p>' }),
        ],
        warnings: [
          item(3, 'warning', {
            title: 'کالاهای غیرقابل مرجوع',
            content: '<p>بهداشتی باز شده.</p>',
          }),
          item(4, 'warning', { content: '<p>هزینهٔ ارسال مرجوعی با مشتری است.</p>' }),
        ],
      }),
    )
    const { container } = await show({ pageType: 'terms', variant: 'inline' })
    expect(container.querySelector('[data-slot="terms"]')).not.toBeNull()
    // One heading per titled description (h2 by default), the untitled one without.
    expect(
      screen.getAllByRole('heading').map((heading) => [heading.tagName, heading.textContent]),
    ).toEqual([['H2', 'ساعات ارسال']])
    expect(screen.getByText('بدون عنوان').closest('[role="note"]')).toBeNull()
    const notes = screen.getAllByRole('note')
    expect(notes).toHaveLength(2)
    // Text says it is a warning, not the colour alone: its title, else «توجه»; a decorative icon.
    expect(within(notes[0]!).getByText('کالاهای غیرقابل مرجوع')).toBeInTheDocument()
    expect(within(notes[1]!).getByText('توجه')).toBeInTheDocument()
    for (const note of notes) {
      expect(note.querySelector('svg')).toHaveAttribute('aria-hidden', 'true')
    }
    expect(within(notes[1]!).getByText('هزینهٔ ارسال مرجوعی با مشتری است.')).toBeInTheDocument()
  })

  it('takes the heading level it is given', async () => {
    answer(group({ descriptions: [item(1, 'description', { title: 'یادداشت', content: 'x' })] }))
    await show({ pageType: 'terms', variant: 'inline', headingLevel: 3 })
    expect(screen.getByRole('heading', { level: 3, name: 'یادداشت' })).toBeInTheDocument()
  })

  it('sanitises the operator HTML and points /media and /static at the API', async () => {
    answer(
      group({
        descriptions: [
          item(1, 'description', {
            content:
              '<p onclick="steal()">متن<script>alert(1)</script></p><img src="/media/x.png" alt="x"><a href="javascript:alert(1)">بد</a><a href="/static/guide.pdf">راهنما</a>',
          }),
        ],
        warnings: [],
      }),
    )
    const { container } = await show({ pageType: 'home', variant: 'inline' })
    expect(container.innerHTML).not.toContain('<script')
    expect(container.innerHTML).not.toContain('onclick')
    expect(container.innerHTML).not.toContain('javascript:')
    expect(container.querySelector('img')).toHaveAttribute('src', 'https://api.shop.ir/media/x.png')
    expect(screen.getByRole('link', { name: 'راهنما' })).toHaveAttribute(
      'href',
      'https://api.shop.ir/static/guide.pdf',
    )
  })

  it('links are plain anchors: a post never prefetched (P5-R1), a short link counted once, others leave in a new tab', async () => {
    answer(
      group({
        descriptions: [
          item(1, 'description', {
            content:
              '<a href="/blog/tea-brewing-guide/">راهنما</a> <a href="/s/abc">کوتاه</a> <a href="/product/x/">کالا</a> <a href="https://other.ir/">بیرون</a>',
          }),
        ],
        warnings: [],
      }),
    )
    const tree = await slot({ pageType: 'home', variant: 'inline' })
    // Server HTML only: no component in the tree, so nothing ships to the browser and no link
    // is ever prefetched.
    expect(types(tree).filter((type) => typeof type !== 'string')).toEqual([])
    render(<>{tree}</>)
    expect(screen.getByRole('link', { name: 'راهنما' })).toHaveAttribute(
      'href',
      '/blog/tea-brewing-guide/',
    )
    expect(screen.getByRole('link', { name: 'راهنما' })).not.toHaveAttribute('target')
    expect(screen.getByRole('link', { name: 'کوتاه' })).toHaveAttribute('href', '/s/abc')
    expect(screen.getByRole('link', { name: 'کالا' })).not.toHaveAttribute('target')
    expect(screen.getByRole('link', { name: 'بیرون' })).toHaveAttribute('target', '_blank')
  })

  it('newTabLinks: every web link opens in a new tab (the checkout’s)', async () => {
    answer(
      group({
        descriptions: [item(1, 'description', { content: '<a href="/page/terms/">قوانین</a>' })],
      }),
    )
    await show({ pageType: 'checkout', variant: 'inline', newTabLinks: true })
    expect(screen.getByRole('link', { name: 'قوانین' })).toHaveAttribute('target', '_blank')
  })
})

describe('DynamicSlot dialog-link', () => {
  it('no content: no link at all', async () => {
    answer(NOT_FOUND)
    expect(
      await DynamicSlot({ pageType: 'terms', variant: 'dialog-link', label: 'مطالعهٔ قوانین' }),
    ).toBeNull()
    answer(group({ warnings: [] }))
    expect(await DynamicSlot({ pageType: 'return-policy', variant: 'dialog-link' })).toBeNull()
  })

  it('a button that opens, on its first press, a dialog with the content; focus on «بستن», then back', async () => {
    answer(TERMS)
    await show({ pageType: 'terms', variant: 'dialog-link', label: 'مطالعهٔ قوانین' })
    const button = screen.getByRole('button', { name: 'مطالعهٔ قوانین' })
    expect(button).toHaveAttribute('type', 'button')
    expect(button).toHaveAttribute('aria-haspopup', 'dialog')
    expect(loaded.has('slot-dialog')).toBe(false)
    expect(screen.queryByText('کالاهای غیرقابل مرجوع')).toBeNull()

    const user = userEvent.setup()
    await user.click(button)
    const dialog = await screen.findByRole('dialog', { name: 'قوانین و مقررات' })
    expect(loaded.has('slot-dialog')).toBe(true)
    expect(within(dialog).getByRole('note')).toHaveTextContent('کالاهای غیرقابل مرجوع')
    expect(
      within(dialog).getByRole('heading', { level: 2, name: 'قوانین و مقررات' }),
    ).toBeInTheDocument()
    expect(document.activeElement).toHaveAccessibleName('بستن')
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(button).toHaveFocus()
  })

  it('its «بستن» closes it; a second press opens it again', async () => {
    answer(TERMS)
    await show({ pageType: 'terms', variant: 'dialog-link' })
    const user = userEvent.setup()
    // Without a label, the link reads as the slot's own name.
    const button = screen.getByRole('button', { name: 'قوانین و مقررات' })
    await user.click(button)
    const dialog = await screen.findByRole('dialog')
    const closes = within(dialog).getAllByRole('button', { name: 'بستن' })
    await user.click(closes.at(-1)!)
    expect(screen.queryByRole('dialog')).toBeNull()
    await user.click(button)
    expect(await screen.findByRole('dialog')).toBeInTheDocument()
  })
})
