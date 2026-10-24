import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Direction } from 'radix-ui'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MegaMenu } from '@/components/layout/mega-menu'
import { navItems } from '@/components/layout/menu-tree'
import { stubBrowserApis } from '../support/dom-stubs'
import { categoryNode, sampleTree } from './support'

// The mega-menu mounted by its stand-in (categories-menu.tsx) after the visitor reached for it:
// it opens where the stand-in was asked (`opening`). And the touch rule's limit (Plan 1 Task 12,
// carried): a touch press only makes the next TAP on another item with children show them; Enter
// from the keyboard always follows the link, whatever the last press was.

vi.mock('next/navigation', () => ({
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
}))

stubBrowserApis()

const TRIGGER = 'دسته\u{200C}بندی\u{200C}ها'

function rtl(children: ReactNode) {
  return <Direction.Provider dir="rtl">{children}</Direction.Provider>
}

/** Two roots with children (the second one gains a child), so a first tap matters on both. */
function tree() {
  const roots = sampleTree()
  roots[1].children = [
    categoryNode({ id: 10009, name: 'یخچال و فریزر', path: 'home-appliance/refrigerator' }),
  ]
  return navItems([], roots)
}

/** Records whether each link click was left to navigate, and stops jsdom from navigating. */
function recordVisits() {
  const visits: boolean[] = []
  const record = (event: Event) => {
    if (!(event.target instanceof Element) || !event.target.closest('a[href]')) return
    visits.push(!event.defaultPrevented)
    event.preventDefault()
  }
  document.addEventListener('click', record)
  return { visits, stop: () => document.removeEventListener('click', record) }
}

beforeEach(() => {
  document.body.innerHTML = ''
})

describe('MegaMenu, opened by its stand-in', () => {
  it('mounts open with the focus on its button (a click)', () => {
    render(rtl(<MegaMenu items={tree()} opening={{ focus: 'trigger' }} />))
    const button = screen.getByRole('button', { name: TRIGGER })
    expect(button).toHaveAttribute('aria-expanded', 'true')
    expect(button).toHaveFocus()
    expect(screen.getByRole('list', { name: TRIGGER })).toBeVisible()
  })

  it('mounts open on the first or the last item (Down, Up)', () => {
    const { unmount } = render(rtl(<MegaMenu items={tree()} opening={{ focus: 'first' }} />))
    expect(screen.getByRole('link', { name: 'کالای دیجیتال' })).toHaveFocus()
    unmount()
    const items = tree()
    render(rtl(<MegaMenu items={items} opening={{ focus: 'last' }} />))
    expect(screen.getByRole('link', { name: items.at(-1)!.title })).toHaveFocus()
  })

  it('mounts open without taking the focus (a hover)', () => {
    render(rtl(<MegaMenu items={tree()} opening={{ focus: null }} />))
    expect(screen.getByRole('button', { name: TRIGGER })).toHaveAttribute('aria-expanded', 'true')
    expect(document.body).toHaveFocus()
  })

  it('without an opening, mounts closed (as before)', () => {
    render(rtl(<MegaMenu items={tree()} />))
    expect(screen.getByRole('button', { name: TRIGGER })).toHaveAttribute('aria-expanded', 'false')
  })
})

describe('MegaMenu: Enter after a touch press', () => {
  it('Enter on an item with children follows its link, though the last press was a touch', async () => {
    const user = userEvent.setup()
    render(rtl(<MegaMenu items={tree()} />))
    await user.click(screen.getByRole('button', { name: TRIGGER }))
    const first = screen.getByRole('link', { name: 'کالای دیجیتال' })
    const second = screen.getByRole('link', { name: 'لوازم خانگی' })

    const { visits, stop } = recordVisits()
    try {
      // A touch press in the menu (on the first item's columns: a visitor scrolling them).
      const columns = document.querySelector('[data-mega-content="0"]')!
      await user.pointer({ keys: '[TouchA]', target: columns })
      expect(visits).toEqual([])
      // Then the keyboard: to the next item, which has children and was not active at that press.
      first.focus()
      await user.keyboard('{ArrowDown}')
      expect(second).toHaveFocus()
      // Enter: a keyboard click (detail 0) is never a "first tap", so the link is followed.
      await user.keyboard('{Enter}')
      expect(visits).toEqual([true])
    } finally {
      stop()
    }
  })

  it('while a first TAP on that item still only shows its children', async () => {
    const user = userEvent.setup()
    render(rtl(<MegaMenu items={tree()} />))
    await user.click(screen.getByRole('button', { name: TRIGGER }))
    const second = screen.getByRole('link', { name: 'لوازم خانگی' })
    const { visits, stop } = recordVisits()
    try {
      await user.pointer({ keys: '[TouchA]', target: second })
      expect(visits).toEqual([false])
      expect(screen.getByRole('link', { name: 'یخچال و فریزر' })).toBeInTheDocument()
    } finally {
      stop()
    }
  })
})
