import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { AppBadges } from '@/components/layout/app-badges'
import { CheckoutFooter } from '@/components/layout/checkout-footer'
import { ContactBlock } from '@/components/layout/contact-block'
import { FooterMenu } from '@/components/layout/footer-menu'
import { SocialLinks } from '@/components/layout/social-links'
import type { SiteSettings } from '@/lib/api/types/settings'
import { createTranslator } from '@/lib/i18n/translator'
import { Globe } from 'lucide-react'
import { menuNode } from './support'

// The footer is one landmark (Plan 5 Task 8, carried from Plan 1 Task 13). Its blocks were
// labelled `<section>`s, and a labelled section is a `region` landmark: four or five regions in
// the footer of every page crowded a screen reader's landmark list. Each block is now a named
// group: still announced with its heading's name when entered, and found by its h2.

const t = createTranslator({})

const contact = {
  phone: '+982191000000',
  phone2: null,
  email: 'support@shop.ir',
  address: 'تهران',
  postal_code: null,
  map_link: null,
  response_time: null,
  support_link: null,
} as unknown as SiteSettings

describe('the footer’s blocks: named groups, never regions', () => {
  it('the contact card, the menu columns, the socials and the apps', () => {
    render(
      <footer>
        <ContactBlock settings={contact} t={t} />
        <FooterMenu
          items={[
            menuNode({
              id: 1,
              title: 'خدمات مشتریان',
              url: null,
              children: [menuNode({ id: 2, title: 'پرسش‌ها', url: '/faq/' })],
            }),
            menuNode({ id: 3, title: 'قوانین', url: '/page/terms/' }),
          ]}
          t={t}
        />
        <SocialLinks
          socials={[
            { id: 1, name: 'اینستاگرام', username_or_id: 'x', logo: null, link: 'https://x.ir' },
          ]}
          title="ما را دنبال کنید"
        />
        <AppBadges
          badges={[
            {
              key: 'web',
              href: 'https://app.shop.ir/',
              hint: 'استفاده از',
              name: 'وب اپ',
              icon: Globe,
            },
          ]}
          title="دریافت اپلیکیشن"
        />
      </footer>,
    )
    const footer = screen.getByRole('contentinfo')
    expect(within(footer).queryAllByRole('region')).toEqual([])
    for (const name of ['ارتباط با ما', 'خدمات مشتریان', 'ما را دنبال کنید', 'دریافت اپلیکیشن']) {
      expect(within(footer).getByRole('group', { name })).toBeInTheDocument()
    }
  })

  it('the checkout’s trust seals', () => {
    render(
      <CheckoutFooter
        phone={null}
        responseTime={null}
        menu={[]}
        trust={<div>نماد</div>}
        labels={{ support: 'پشتیبانی', phoneSupport: 'تماس', trust: 'نمادهای اعتماد' }}
      />,
    )
    const footer = screen.getByRole('contentinfo')
    expect(within(footer).queryAllByRole('region')).toEqual([])
    expect(within(footer).getByRole('group', { name: 'نمادهای اعتماد' })).toHaveTextContent('نماد')
  })
})
