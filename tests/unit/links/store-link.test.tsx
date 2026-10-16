import { render, screen } from '@testing-library/react'
import type { ComponentProps, ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import type { PublicStoreConfig } from '@/config/resolve-store-config'
import { StoreConfigProvider } from '@/lib/config-context'
import { StoreLink } from '@/lib/links/store-link'

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

function renderLink(props: ComponentProps<typeof StoreLink>, withConfig = true) {
  const node: ReactNode = <StoreLink {...props} />
  return render(
    withConfig ? <StoreConfigProvider value={CONFIG}>{node}</StoreConfigProvider> : node,
  )
}

describe('StoreLink', () => {
  it('renders a storefront path as a Next Link', () => {
    renderLink({ href: '/product/x/', children: 'گلکسی', className: 'tile' })
    const link = screen.getByRole('link', { name: 'گلکسی' })
    expect(link).toHaveAttribute('href', '/product/x/')
    expect(link).toHaveAttribute('data-next-link')
    expect(link).toHaveClass('tile')
    expect(link).not.toHaveAttribute('target')
  })

  it.each(['/s/phone-fest/', '/s/phone-fest?utm_source=home', '/s'])(
    'renders the short link %s as a plain <a>, never a prefetching Next Link',
    (href) => {
      renderLink({ href, children: 'جشنواره' })
      const link = screen.getByRole('link', { name: 'جشنواره' })
      expect(link).toHaveAttribute('href', href)
      expect(link).not.toHaveAttribute('data-next-link')
      expect(link).not.toHaveAttribute('target')
    },
  )

  it('renders an absolute URL as a plain <a rel="noopener">', () => {
    renderLink({ href: 'https://blog.example.com/a/', children: 'وبلاگ' })
    const link = screen.getByRole('link', { name: 'وبلاگ' })
    expect(link).toHaveAttribute('href', 'https://blog.example.com/a/')
    expect(link).toHaveAttribute('rel', 'noopener')
    expect(link).not.toHaveAttribute('data-next-link')
    expect(link).not.toHaveAttribute('target')
  })

  it('opens a new tab with rel="noopener" when asked, internal paths too', () => {
    renderLink({ href: 'https://blog.example.com/a/', children: 'وبلاگ', newTab: true })
    const external = screen.getByRole('link', { name: 'وبلاگ' })
    expect(external).toHaveAttribute('target', '_blank')
    expect(external).toHaveAttribute('rel', 'noopener')

    renderLink({ href: '/product/x/', children: 'گلکسی', newTab: true })
    const internal = screen.getByRole('link', { name: 'گلکسی' })
    expect(internal).toHaveAttribute('target', '_blank')
    expect(internal).toHaveAttribute('rel', 'noopener')
    expect(internal).not.toHaveAttribute('data-next-link')
  })

  it("treats an absolute URL on the shop's own origin as a storefront path", () => {
    renderLink({ href: 'https://shop.ir/product/list/?has_discount=true', children: 'تخفیف' })
    const link = screen.getByRole('link', { name: 'تخفیف' })
    expect(link).toHaveAttribute('href', '/product/list/?has_discount=true')
    expect(link).toHaveAttribute('data-next-link')
    expect(link).not.toHaveAttribute('rel')
  })

  it("keeps a short link on the shop's own origin a plain <a>", () => {
    renderLink({ href: 'https://shop.ir/s/phone-fest/', children: 'جشنواره' })
    const link = screen.getByRole('link', { name: 'جشنواره' })
    expect(link).toHaveAttribute('href', '/s/phone-fest/')
    expect(link).not.toHaveAttribute('data-next-link')
  })

  it('never routes a protocol-relative or backslash URL on the client', () => {
    renderLink({ href: '//evil.example/x', children: 'الف' })
    expect(screen.getByRole('link', { name: 'الف' })).not.toHaveAttribute('data-next-link')
    renderLink({ href: '/\\evil.example/x', children: 'ب' })
    expect(screen.getByRole('link', { name: 'ب' })).not.toHaveAttribute('data-next-link')
  })

  it('works without the store configuration (own-origin URLs stay absolute)', () => {
    renderLink({ href: 'https://shop.ir/x/', children: 'الف' }, false)
    expect(screen.getByRole('link', { name: 'الف' })).toHaveAttribute('href', 'https://shop.ir/x/')
  })

  it('passes an accessible name to a link whose content has none', () => {
    renderLink({ href: '/product/x/', children: <span aria-hidden />, 'aria-label': 'بنر ۱' })
    expect(screen.getByRole('link', { name: 'بنر ۱' })).toHaveAttribute('href', '/product/x/')
  })
})
