import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderToString } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { HeaderSearchForm } from '@/components/layout/header-search-form'
import { RECENT_SEARCHES_KEY, useRecentSearches } from '@/features/search/recent-searches'
import { stubBrowserApis } from '../support/dom-stubs'
import { clientProviders } from '../support/providers'
import { answer, SAMSUNG } from './fixtures'

const mocks = vi.hoisted(() => ({
  bffFetch: vi.fn(),
  push: vi.fn(),
  suggestBoxFails: false,
  pathname: '/',
}))
vi.mock('@/lib/api/client', () => ({ bffFetch: mocks.bffFetch }))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mocks.push }),
  usePathname: () => mocks.pathname,
}))
vi.mock('@/features/search/suggest-box', async (load) => {
  const actual = await load<typeof import('@/features/search/suggest-box')>()
  return {
    SuggestBox: (props: Parameters<typeof actual.SuggestBox>[0]) => {
      if (mocks.suggestBoxFails) throw new Error('suggest box render bug')
      return <actual.SuggestBox {...props} />
    },
  }
})

stubBrowserApis()

function renderPhone() {
  const { wrapper } = clientProviders()
  const view = render(<HeaderSearchForm size="md" overlay />, { wrapper })
  renderedPhone = view
  return screen.getByRole('searchbox', { name: 'جستجو' })
}

let renderedPhone: ReturnType<typeof render> | null = null

async function openOverlay(field: HTMLElement) {
  await userEvent.click(field)
  return screen.findByRole('dialog', { name: 'جستجو' })
}

beforeEach(() => {
  mocks.bffFetch.mockReset()
  mocks.push.mockReset()
  mocks.suggestBoxFails = false
  mocks.pathname = '/'
  localStorage.clear()
  useRecentSearches.setState({ items: [] })
})

describe('the header search on wider screens', () => {
  it('is the suggest box', () => {
    const { wrapper } = clientProviders()
    render(<HeaderSearchForm />, { wrapper })
    expect(screen.getByRole('combobox', { name: 'جستجو' })).toHaveAttribute('name', 'q')
  })

  it('falls back to the plain form when the suggest box fails to render', () => {
    mocks.suggestBoxFails = true
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      const { wrapper } = clientProviders()
      render(<HeaderSearchForm />, { wrapper })
      expect(screen.getByRole('search')).toHaveAttribute('action', '/search/')
      expect(screen.getByRole('searchbox', { name: 'جستجو' })).toHaveAttribute('name', 'q')
    } finally {
      consoleError.mockRestore()
    }
  })
})

describe('the header search on phones', () => {
  it('server-renders a plain GET form that works without JavaScript', () => {
    const { wrapper: Wrapper } = clientProviders()
    const html = renderToString(
      <Wrapper>
        <HeaderSearchForm size="md" overlay />
      </Wrapper>,
    )
    expect(html).toContain('action="/search/"')
    expect(html).toContain('name="q"')
    expect(html).not.toContain('readonly')
  })

  it('opens a full-screen search with the field focused, and locks the page behind it', async () => {
    const field = renderPhone()
    expect(field).toHaveAttribute('aria-haspopup', 'dialog')
    const dialog = await openOverlay(field)
    const input = within(dialog).getByRole('combobox', { name: 'جستجو' })
    await waitFor(() => expect(input).toHaveFocus())
    await waitFor(() => expect(document.body).toHaveAttribute('data-scroll-locked'))
    expect(within(dialog).getByRole('search')).toHaveAttribute('action', '/search/')
  })

  it('offers the same suggestions, and goes to the one chosen', async () => {
    mocks.bffFetch.mockResolvedValue(answer(SAMSUNG))
    const dialog = await openOverlay(renderPhone())
    const input = within(dialog).getByRole('combobox')
    await userEvent.type(input, 'سامسونگ')
    await within(dialog).findByRole('option', { name: /شارژر دیواری/ })
    expect(within(dialog).getByRole('group', { name: 'برندها' })).toBeInTheDocument()
    await userEvent.keyboard('{ArrowDown}{ArrowDown}{Enter}')
    expect(mocks.push).toHaveBeenCalledWith('/product/samsung-25w-charger/')
    await waitFor(() => expect(dialog).not.toBeInTheDocument())
    expect(useRecentSearches.getState().items).toEqual(['سامسونگ'])
  })

  it('shows the recent searches while its field is empty', async () => {
    const items = ['هدفون', 'لپ تاپ']
    localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify({ state: { items }, version: 0 }))
    useRecentSearches.setState({ items })
    const dialog = await openOverlay(renderPhone())
    const list = within(dialog).getByRole('listbox', { name: 'جستجوهای اخیر' })
    expect(
      within(list)
        .getAllByRole('option')
        .map((option) => option.textContent),
    ).toEqual(items)
  })

  it('goes back with «بازگشت», giving the focus back to the header field', async () => {
    const field = renderPhone()
    const dialog = await openOverlay(field)
    await userEvent.click(within(dialog).getByRole('button', { name: 'بازگشت' }))
    await waitFor(() => expect(dialog).not.toBeInTheDocument())
    expect(field).toHaveFocus()
  })

  it('clears the field on Escape first, then closes', async () => {
    const field = renderPhone()
    const dialog = await openOverlay(field)
    const input = within(dialog).getByRole('combobox')
    await waitFor(() => expect(input).toHaveFocus())
    await userEvent.type(input, 'هد')
    await userEvent.keyboard('{Escape}')
    expect(input).toHaveValue('')
    expect(dialog).toBeInTheDocument()
    await userEvent.keyboard('{Escape}')
    await waitFor(() => expect(dialog).not.toBeInTheDocument())
    expect(field).toHaveFocus()
  })

  it('opens from the keyboard too, keeping a key typed on the field', async () => {
    const field = renderPhone()
    field.focus()
    await userEvent.keyboard('ل')
    const dialog = await screen.findByRole('dialog', { name: 'جستجو' })
    expect(within(dialog).getByRole('combobox')).toHaveValue('ل')
  })

  it('submits a search from the overlay to the results page', async () => {
    const submitted: string[] = []
    const record = (event: Event) => {
      event.preventDefault()
      submitted.push(String(new FormData(event.target as HTMLFormElement).get('q')))
    }
    document.addEventListener('submit', record)
    try {
      const dialog = await openOverlay(renderPhone())
      await userEvent.type(within(dialog).getByRole('combobox'), 'هدفون{Enter}')
      expect(submitted).toEqual(['هدفون'])
      await waitFor(() => expect(dialog).not.toBeInTheDocument())
    } finally {
      document.removeEventListener('submit', record)
    }
  })

  it('closes when the page behind it changes (the phone’s Back button)', async () => {
    const dialog = await openOverlay(renderPhone())
    mocks.pathname = '/product-category/digital/'
    renderedPhone!.rerender(<HeaderSearchForm size="md" overlay />)
    await waitFor(() => expect(dialog).not.toBeInTheDocument())
  })

  it('never shows a request error', async () => {
    mocks.bffFetch.mockRejectedValue(new Error('offline'))
    const dialog = await openOverlay(renderPhone())
    await userEvent.type(within(dialog).getByRole('combobox'), 'هدفون')
    await waitFor(() => expect(mocks.bffFetch).toHaveBeenCalled())
    await act(async () => {})
    expect(within(dialog).queryByText(/خطا/)).toBeNull()
  })
})
