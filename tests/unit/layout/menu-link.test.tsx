import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ComponentProps, ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { MenuLink } from '@/components/layout/menu-link'
import type { PublicStoreConfig } from '@/config/resolve-store-config'
import { StoreConfigProvider } from '@/lib/config-context'
import { menuNode } from './support'

// A marker on Next links, so a client-side link can be told apart from a plain <a>.
vi.mock('next/link', () => ({
  default: (props: ComponentProps<'a'> & { href: string; prefetch?: unknown }) => {
    const anchorProps: ComponentProps<'a'> & { prefetch?: unknown } = { ...props }
    delete anchorProps.prefetch
    return <a data-next-link="" {...anchorProps} />
  },
}))

const CONFIG = {
  siteUrl: 'https://shop.ir/',
  mediaOrigin: 'https://api.shop.ir',
} as PublicStoreConfig

function withConfig(children: ReactNode) {
  return <StoreConfigProvider value={CONFIG}>{children}</StoreConfigProvider>
}

describe('MenuLink', () => {
  it('renders a group heading (link_type none) as a <span>, not a link', () => {
    render(<MenuLink node={menuNode({ id: 1, title: 'کالای دیجیتال', url: null })} />)
    expect(screen.queryByRole('link')).toBeNull()
    expect(screen.getByText('کالای دیجیتال').tagName).toBe('SPAN')
  })

  it('renders a storefront path as a Next Link', () => {
    render(
      <MenuLink
        node={menuNode({ id: 2, title: 'گلکسی S25', url: '/product/x/', link_type: 'product' })}
      />,
    )
    const link = screen.getByRole('link', { name: 'گلکسی S25' })
    expect(link).toHaveAttribute('href', '/product/x/')
    expect(link).toHaveAttribute('data-next-link')
    expect(link).not.toHaveAttribute('target')
  })

  it.each(['/s/phone-fest/', '/s/phone-fest?utm_source=menu', 'https://shop.ir/s/phone-fest/'])(
    'renders the short link %s as a plain <a>, never a prefetching Next Link',
    (url) => {
      render(withConfig(<MenuLink node={menuNode({ id: 9, title: 'جشنواره', url })} />))
      const link = screen.getByRole('link', { name: 'جشنواره' })
      expect(link.getAttribute('href')).toMatch(/^\/s\/phone-fest/)
      expect(link).not.toHaveAttribute('data-next-link')
      expect(link).not.toHaveAttribute('target')
    },
  )

  it('opens open_in_new_tab items in a new tab with rel="noopener", internal paths too', () => {
    render(
      <MenuLink
        node={menuNode({ id: 3, title: 'قوانین', url: '/page/terms/', open_in_new_tab: true })}
      />,
    )
    const link = screen.getByRole('link', { name: 'قوانین' })
    expect(link).toHaveAttribute('href', '/page/terms/')
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', 'noopener')
    expect(link).not.toHaveAttribute('data-next-link')
  })

  it('renders an absolute URL of another site as a plain <a>', () => {
    render(
      <MenuLink node={menuNode({ id: 4, title: 'وبلاگ', url: 'https://blog.example.com/' })} />,
    )
    const link = screen.getByRole('link', { name: 'وبلاگ' })
    expect(link).toHaveAttribute('href', 'https://blog.example.com/')
    expect(link).not.toHaveAttribute('data-next-link')
    expect(link).not.toHaveAttribute('target')
  })

  it('routes an absolute URL of the shop itself on the client', () => {
    render(
      withConfig(
        <MenuLink
          node={menuNode({ id: 5, title: 'تخفیف‌ها', url: 'https://shop.ir/product/list/?a=1' })}
        />,
      ),
    )
    const link = screen.getByRole('link', { name: 'تخفیف‌ها' })
    expect(link).toHaveAttribute('href', '/product/list/?a=1')
    expect(link).toHaveAttribute('data-next-link')
  })

  it('calls onNavigate when the link is followed', async () => {
    const user = userEvent.setup()
    const onNavigate = vi.fn()
    render(<MenuLink node={menuNode({ id: 6, title: 'سامسونگ' })} onNavigate={onNavigate} />)
    // jsdom cannot navigate: cancel the visit after React has handled the click.
    const stay = (event: Event) => event.preventDefault()
    document.addEventListener('click', stay)
    await user.click(screen.getByRole('link', { name: 'سامسونگ' }))
    document.removeEventListener('click', stay)
    expect(onNavigate).toHaveBeenCalledOnce()
  })

  it('does not report a visit for a click a handler cancelled', async () => {
    const user = userEvent.setup()
    const onNavigate = vi.fn()
    render(
      <MenuLink
        node={menuNode({ id: 8, title: 'کالای دیجیتال' })}
        onNavigate={onNavigate}
        onClick={(event) => event.preventDefault()}
      />,
    )
    await user.click(screen.getByRole('link', { name: 'کالای دیجیتال' }))
    expect(onNavigate).not.toHaveBeenCalled()
  })

  it('shows the icon as a decorative 20px image when asked', () => {
    render(
      <MenuLink
        withIcon
        className="item"
        node={menuNode({ id: 7, title: 'موبایل', icon: 'https://api.shop.ir/media/m.svg' })}
      />,
    )
    const link = screen.getByRole('link', { name: 'موبایل' })
    expect(link).toHaveClass('item')
    const icon = link.querySelector('img')
    expect(icon).toHaveAttribute('alt', '')
    expect(icon).toHaveAttribute('width', '20')
    expect(icon).toHaveAttribute('height', '20')
  })
})
