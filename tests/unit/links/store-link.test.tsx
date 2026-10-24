import { render, screen } from '@testing-library/react'
import type { ComponentProps, ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import type { PublicStoreConfig } from '@/config/resolve-store-config'
import { StoreConfigProvider } from '@/lib/config-context'
import { StoreLink } from '@/lib/links/store-link'

// A marker on Next links, so a client-side link can be told apart from a plain <a>, with its
// prefetch setting (`auto` when none is given).
vi.mock('next/link', () => ({
  default: (props: ComponentProps<'a'> & { href: string; prefetch?: unknown }) => {
    const anchorProps: ComponentProps<'a'> & { prefetch?: unknown } = { ...props }
    delete anchorProps.prefetch
    const prefetch = props.prefetch === undefined ? 'auto' : String(props.prefetch)
    return <a data-next-link="" data-prefetch={prefetch} {...anchorProps} />
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

  // Ruling P5-R1: a post's page counts a view on every render (blog digest §1.5).
  it.each(['/blog/best-phones-under-30m/', 'https://shop.ir/blog/x/'])(
    'never prefetches the post %s',
    (href) => {
      renderLink({ href, children: 'مطلب' })
      const link = screen.getByRole('link', { name: 'مطلب' })
      expect(link).toHaveAttribute('data-next-link')
      expect(link).toHaveAttribute('data-prefetch', 'false')
    },
  )

  it('prefetches other storefront paths as Next decides (the blog’s home included)', () => {
    renderLink({ href: '/blog/', children: 'وبلاگ' })
    expect(screen.getByRole('link', { name: 'وبلاگ' })).toHaveAttribute('data-prefetch', 'auto')
  })

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

  // The browser drops a tab or a line break anywhere in a URL: `/<tab>/host` is `//host`.
  it.each(['/\t/evil.example/x', '/\n\\evil.example/x', '\u{1}//evil.example/x'])(
    '%j, another host as the browser reads it: a plain <a rel="noopener">',
    (href) => {
      renderLink({ href, children: 'پ' })
      const link = screen.getByRole('link', { name: 'پ' })
      expect(link).not.toHaveAttribute('data-next-link')
      expect(link).toHaveAttribute('rel', 'noopener')
    },
  )

  it('a short link typed with a space or a line break: still a plain <a>, never prefetched', () => {
    renderLink({ href: ' /s/phone-fest/\n', children: 'جشنواره' })
    const link = screen.getByRole('link', { name: 'جشنواره' })
    expect(link).toHaveAttribute('href', '/s/phone-fest/')
    expect(link).not.toHaveAttribute('data-next-link')
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
