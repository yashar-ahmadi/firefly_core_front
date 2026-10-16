import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DescriptionSection } from '@/features/product/components/description-section'
import { stubBrowserApis } from '../support/dom-stubs'
import { resolveServerTree } from '../support/server-tree'

vi.mock('server-only', () => ({}))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock('@/config/store-config', async () => {
  const pure = await import('@/config/resolve-store-config')
  const { parseServerEnv } = await import('@/config/env-schema')
  const config = () =>
    pure.resolveStoreConfig(
      parseServerEnv({
        FIREFLY_API_URL: 'https://api.shop.ir/',
        SITE_URL: 'https://shop.ir/',
        FIREFLY_API_KEY: 'k',
      }),
    )
  return { ...pure, getStoreConfig: config }
})

stubBrowserApis()

const MORE = 'ادامه\u{0654} مطلب'
const CONTENT = '<p>دوربین ۲۰۰ مگاپیکسلی</p><ul><li>باتری ۵۰۰۰</li></ul>'

async function renderSection(description: string | null, content: string | null) {
  const tree = await resolveServerTree(
    (await DescriptionSection({ description, content })) as ReactNode,
  )
  return render(<>{tree}</>)
}

/** Every element taller than it is shown: the content overflows its collapsed box. */
function overflowing(scrollHeight: number) {
  vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockReturnValue(scrollHeight)
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(384)
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('DescriptionSection («معرفی»)', () => {
  it('shows the plain-text description with its line breaks, then the rich content', async () => {
    await renderSection('خط اول\nخط دوم', CONTENT)
    expect(screen.getByRole('region', { name: 'معرفی' })).toHaveAttribute('id', 'intro')
    const lead = screen.getByText(/خط اول/)
    expect(lead).toHaveClass('whitespace-pre-wrap')
    expect(lead.textContent).toBe('خط اول\nخط دوم')
    expect(screen.getByRole('listitem')).toHaveTextContent('باتری ۵۰۰۰')
  })

  it('leaves out a description the content already starts with (no repeated paragraph)', async () => {
    await renderSection('دوربین ۲۰۰ مگاپیکسلی', CONTENT)
    expect(screen.getAllByText('دوربین ۲۰۰ مگاپیکسلی')).toHaveLength(1)
  })

  it('renders nothing without a description or content', async () => {
    const { container } = await renderSection(null, '<p>&nbsp;</p>')
    expect(container).toBeEmptyDOMElement()
  })

  it('needs no expander for short content', async () => {
    await renderSection(null, CONTENT)
    expect(screen.queryByRole('button', { name: MORE })).toBeNull()
  })

  it('collapses tall content behind «read more», keeping all of it in the page', async () => {
    overflowing(2000)
    const user = userEvent.setup()
    await renderSection(null, CONTENT)
    const more = await screen.findByRole('button', { name: MORE })
    expect(more).toHaveAttribute('aria-expanded', 'false')
    const box = document.getElementById(more.getAttribute('aria-controls')!)!
    expect(box).toHaveClass('max-h-96', 'overflow-hidden')
    // Collapsed by CSS only: the text is still there for search engines.
    expect(box).toHaveTextContent('باتری ۵۰۰۰')
    await user.click(more)
    expect(more).toHaveAttribute('aria-expanded', 'true')
    expect(more).toHaveTextContent('بستن')
    expect(box).not.toHaveClass('max-h-96')
  })
})
