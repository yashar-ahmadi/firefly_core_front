import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderToString } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { RECENT_SEARCHES_KEY, useRecentSearches } from '@/features/search/recent-searches'
import { SuggestBox } from '@/features/search/suggest-box'
import { ApiError } from '@/lib/api/errors'
import { stubBrowserApis } from '../support/dom-stubs'
import { clientProviders } from '../support/providers'
import { answer, SAMSUNG } from './fixtures'

const mocks = vi.hoisted(() => ({ bffFetch: vi.fn(), push: vi.fn() }))
vi.mock('@/lib/api/client', () => ({ bffFetch: mocks.bffFetch }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: mocks.push }) }))

stubBrowserApis()

const SEARCH_ALL = (q: string) => `جستجوی «${q}» در همه\u{0654} محصولات`
const REMOVE_HINT = 'برای حذف جستجوی انتخاب\u{200C}شده، Delete یا Backspace را بزنید.'
const ZWJ = /\u{200D}/gu

/** Form submissions that reached the document (the test stops the browser's navigation). */
let submitted: string[] = []
function recordSubmit(event: Event) {
  event.preventDefault()
  submitted.push(String(new FormData(event.target as HTMLFormElement).get('q')))
}

/** Searches saved on this device, as a returning visitor has them. */
function remember(items: string[]) {
  localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify({ state: { items }, version: 0 }))
  useRecentSearches.setState({ items })
}

function renderBox() {
  const { wrapper } = clientProviders()
  render(<SuggestBox />, { wrapper })
  return screen.getByRole('combobox', { name: 'جستجو' })
}

function listbox() {
  return screen.getByRole('listbox', { hidden: true })
}

function active(input: HTMLElement): HTMLElement | null {
  const id = input.getAttribute('aria-activedescendant')
  return id ? document.getElementById(id) : null
}

/** The text of an option as read out: decorative parts and joiners left out. */
function text(element: HTMLElement | null): string {
  if (!element) return ''
  const copy = element.cloneNode(true) as HTMLElement
  for (const hidden of copy.querySelectorAll('[aria-hidden="true"]')) hidden.remove()
  return copy.textContent?.replace(ZWJ, '') ?? ''
}

async function typeSamsung(input: HTMLElement) {
  mocks.bffFetch.mockResolvedValue(answer(SAMSUNG))
  await userEvent.type(input, 'سامسونگ')
  await screen.findByRole('option', { name: /شارژر دیواری/ })
}

beforeEach(() => {
  mocks.bffFetch.mockReset()
  mocks.push.mockReset()
  localStorage.clear()
  useRecentSearches.setState({ items: [] })
  submitted = []
  document.addEventListener('submit', recordSubmit)
})

afterEach(() => {
  document.removeEventListener('submit', recordSubmit)
})

describe('SuggestBox', () => {
  it('is a search form with an ARIA 1.2 combobox, collapsed at first', () => {
    const input = renderBox()
    expect(screen.getByRole('search')).toHaveAttribute('action', '/search/')
    expect(input).toHaveAttribute('name', 'q')
    expect(input).toHaveAttribute('aria-expanded', 'false')
    expect(input).toHaveAttribute('aria-autocomplete', 'list')
    expect(input).toHaveAttribute('aria-controls', listbox().id)
    expect(input).not.toHaveAttribute('aria-activedescendant')
  })

  it('server-renders the plain form, without anything saved on this device', () => {
    remember(['هدفون بی سیم'])
    const { wrapper: Wrapper } = clientProviders()
    const html = renderToString(
      <Wrapper>
        <SuggestBox />
      </Wrapper>,
    )
    expect(html).toContain('name="q"')
    expect(html).not.toContain('هدفون بی سیم')
  })

  it('lists products, categories and brands under labelled groups, after «search everywhere»', async () => {
    const input = renderBox()
    await typeSamsung(input)
    expect(input).toHaveAttribute('aria-expanded', 'true')
    const options = within(listbox()).getAllByRole('option')
    expect(text(options[0]!)).toBe(SEARCH_ALL('سامسونگ'))
    const groups = within(listbox()).getAllByRole('group')
    expect(groups.map((group) => group.getAttribute('aria-labelledby'))).toHaveLength(3)
    const products = screen.getByRole('group', { name: 'محصولات' })
    expect(within(products).getAllByRole('option').map(text)).toEqual(
      SAMSUNG.products.map((product) => product.name),
    )
    // A thumbnail beside each name (decorative: the name says it all).
    expect(products.querySelectorAll('img[alt=""]')).toHaveLength(3)
    const categories = screen.getByRole('group', { name: 'دسته\u{200C}بندی\u{200C}ها' })
    expect(within(categories).getByRole('option')).toHaveAttribute(
      'href',
      '/product-category/digital/mobile-phone/',
    )
    const brands = screen.getByRole('group', { name: 'برندها' })
    expect(within(brands).getByRole('option')).toHaveAttribute('href', '/brand/samsung/')
  })

  it('marks the typed term in each name, folding digits («۲۵» finds «25»)', async () => {
    mocks.bffFetch.mockResolvedValue(answer(SAMSUNG))
    const input = renderBox()
    await userEvent.type(input, 'شارژر 25')
    const option = await screen.findByRole('option', { name: /شارژر دیواری/ })
    const marks = [...option.querySelectorAll('mark')].map((mark) => text(mark))
    expect(marks).toEqual(['شارژر', '۲۵'])
  })

  it('moves through the options with the arrow keys, wrapping at both ends', async () => {
    const input = renderBox()
    await typeSamsung(input)
    const count = within(listbox()).getAllByRole('option').length
    await userEvent.keyboard('{ArrowDown}')
    expect(text(active(input))).toBe(SEARCH_ALL('سامسونگ'))
    expect(active(input)).toHaveAttribute('aria-selected', 'true')
    // The highlight's bar is drawn in the theme's focus colour (3:1 on the page by design).
    expect(active(input)?.className).toContain('before:bg-(--focus)')
    await userEvent.keyboard('{ArrowDown}')
    expect(text(active(input))).toBe('شارژر دیواری سامسونگ ۲۵ وات')
    await userEvent.keyboard('{ArrowUp}{ArrowUp}')
    expect(text(active(input))).toBe('سامسونگ')
    for (let step = 0; step < count; step += 1) await userEvent.keyboard('{ArrowDown}')
    expect(text(active(input))).toBe('سامسونگ')
    await userEvent.keyboard('{ArrowDown}')
    expect(text(active(input))).toBe(SEARCH_ALL('سامسونگ'))
  })

  it('goes to the highlighted suggestion on Enter, and remembers the query', async () => {
    const input = renderBox()
    await typeSamsung(input)
    await userEvent.keyboard('{ArrowDown}{ArrowDown}{ArrowDown}{ArrowDown}{Enter}')
    expect(mocks.push).toHaveBeenCalledWith('/product/samsung-galaxy-a56/')
    expect(submitted).toEqual([])
    expect(useRecentSearches.getState().items).toEqual(['سامسونگ'])
    expect(input).toHaveAttribute('aria-expanded', 'false')
  })

  it('submits to the results page on Enter when nothing is highlighted', async () => {
    const input = renderBox()
    await typeSamsung(input)
    await userEvent.keyboard('{Enter}')
    expect(submitted).toEqual(['سامسونگ'])
    expect(mocks.push).not.toHaveBeenCalled()
    expect(useRecentSearches.getState().items).toEqual(['سامسونگ'])
  })

  it('«search everywhere» goes to the results page for the term', async () => {
    const input = renderBox()
    await typeSamsung(input)
    await userEvent.keyboard('{ArrowDown}{Enter}')
    expect(mocks.push).toHaveBeenCalledWith(`/search/?q=${encodeURIComponent('سامسونگ')}`)
  })

  it('closes on Escape, then clears the field on a second Escape', async () => {
    const input = renderBox()
    await typeSamsung(input)
    await userEvent.keyboard('{ArrowDown}{Escape}')
    expect(input).toHaveAttribute('aria-expanded', 'false')
    expect(input).not.toHaveAttribute('aria-activedescendant')
    expect(input).toHaveValue('سامسونگ')
    await userEvent.keyboard('{Escape}')
    expect(input).toHaveValue('')
    expect(input).toHaveFocus()
  })

  it('remembers the query when a suggestion is clicked', async () => {
    const input = renderBox()
    await typeSamsung(input)
    const brand = within(screen.getByRole('group', { name: 'برندها' })).getByRole('option')
    brand.addEventListener('click', (event) => event.preventDefault())
    await userEvent.click(brand)
    expect(useRecentSearches.getState().items).toEqual(['سامسونگ'])
    expect(input).toHaveAttribute('aria-expanded', 'false')
  })

  it('announces how many suggestions there are', async () => {
    const input = renderBox()
    await typeSamsung(input)
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('۵ پیشنهاد'))
  })

  it('leaves a modified click (a new tab) alone: the list stays open and nothing is remembered', async () => {
    const input = renderBox()
    await typeSamsung(input)
    const brand = within(screen.getByRole('group', { name: 'برندها' })).getByRole('option')
    brand.addEventListener('click', (event) => event.preventDefault())
    const user = userEvent.setup()
    await user.keyboard('{Control>}')
    await user.click(brand)
    await user.keyboard('{/Control}')
    expect(useRecentSearches.getState().items).toEqual([])
    expect(input).toHaveAttribute('aria-expanded', 'true')
  })

  it('offers only «search everywhere» when suggestions fail, and shows no error', async () => {
    mocks.bffFetch.mockRejectedValue(new ApiError({ status: 429, code: 'throttled' }))
    const input = renderBox()
    await userEvent.type(input, 'سامسونگ')
    await waitFor(() => expect(mocks.bffFetch).toHaveBeenCalled())
    await act(async () => {})
    const options = within(listbox()).getAllByRole('option')
    expect(options.map(text)).toEqual([SEARCH_ALL('سامسونگ')])
    expect(screen.queryByText(/خطا/)).toBeNull()
  })

  it('stays closed for one character', async () => {
    const input = renderBox()
    await userEvent.type(input, 'س')
    expect(input).toHaveAttribute('aria-expanded', 'false')
    expect(mocks.bffFetch).not.toHaveBeenCalled()
  })
})

describe('SuggestBox recent searches', () => {
  beforeEach(() => {
    remember(['هدفون', 'گوشی سامسونگ', 'لپ تاپ'])
  })

  it('shows them when the empty field is focused, newest first', async () => {
    const input = renderBox()
    await userEvent.click(input)
    expect(input).toHaveAttribute('aria-expanded', 'true')
    expect(listbox()).toHaveAccessibleName('جستجوهای اخیر')
    expect(within(listbox()).getAllByRole('option').map(text)).toEqual([
      'هدفون',
      'گوشی سامسونگ',
      'لپ تاپ',
    ])
  })

  it('searches a recent term again, from the keyboard or a click', async () => {
    const input = renderBox()
    await userEvent.click(input)
    await userEvent.keyboard('{ArrowUp}{Enter}')
    expect(mocks.push).toHaveBeenCalledWith(`/search/?q=${encodeURIComponent('لپ تاپ')}`)
    expect(useRecentSearches.getState().items[0]).toBe('لپ تاپ')
    expect(input).toHaveValue('لپ تاپ')
  })

  it('removes one with its × button, or with Delete on the highlighted one', async () => {
    const input = renderBox()
    await userEvent.click(input)
    await userEvent.click(
      screen.getByRole('button', { name: 'حذف «گوشی سامسونگ» از جستجوهای اخیر' }),
    )
    expect(useRecentSearches.getState().items).toEqual(['هدفون', 'لپ تاپ'])
    expect(input).toHaveFocus()
    await userEvent.keyboard('{ArrowDown}{Delete}')
    expect(useRecentSearches.getState().items).toEqual(['لپ تاپ'])
  })

  it('tells how to remove one: a description on the field, shortcuts on each option', async () => {
    const input = renderBox()
    expect(input).not.toHaveAccessibleDescription()
    await userEvent.click(input)
    expect(input).toHaveAccessibleDescription(REMOVE_HINT)
    for (const option of within(listbox()).getAllByRole('option')) {
      expect(option).toHaveAttribute('aria-keyshortcuts', 'Delete Backspace')
    }
    await userEvent.type(input, 'سا')
    expect(input).not.toHaveAccessibleDescription()
  })

  it('removes the highlighted one with Backspace too, keeping the highlight at its place', async () => {
    const input = renderBox()
    await userEvent.click(input)
    await userEvent.keyboard('{ArrowDown}{Backspace}')
    expect(useRecentSearches.getState().items).toEqual(['گوشی سامسونگ', 'لپ تاپ'])
    expect(text(active(input))).toBe('گوشی سامسونگ')
    await userEvent.keyboard('{ArrowDown}{Delete}')
    expect(useRecentSearches.getState().items).toEqual(['گوشی سامسونگ'])
    expect(text(active(input))).toBe('گوشی سامسونگ')
    expect(input).toHaveValue('')
  })

  it('a held Delete or Backspace removes one recent search, not one per auto-repeat', async () => {
    const input = renderBox()
    await userEvent.click(input)
    await userEvent.keyboard('{ArrowDown}{Backspace>4}')
    expect(useRecentSearches.getState().items).toEqual(['گوشی سامسونگ', 'لپ تاپ'])
    await userEvent.keyboard('{/Backspace}{Delete>4/}')
    expect(useRecentSearches.getState().items).toEqual(['لپ تاپ'])
    expect(input).toHaveValue('')
  })

  it('«پاک کردن همه» forgets them all and gives the focus back to the field', async () => {
    const input = renderBox()
    await userEvent.click(input)
    await userEvent.click(screen.getByRole('button', { name: 'پاک کردن همه' }))
    expect(useRecentSearches.getState().items).toEqual([])
    expect(input).toHaveAttribute('aria-expanded', 'false')
    expect(input).toHaveFocus()
  })

  it('closes when the focus leaves the box', async () => {
    const { wrapper } = clientProviders()
    render(
      <>
        <SuggestBox />
        <button type="button">elsewhere</button>
      </>,
      { wrapper },
    )
    const input = screen.getByRole('combobox')
    await userEvent.click(input)
    expect(input).toHaveAttribute('aria-expanded', 'true')
    await userEvent.click(screen.getByRole('button', { name: 'elsewhere' }))
    expect(input).toHaveAttribute('aria-expanded', 'false')
  })
})
