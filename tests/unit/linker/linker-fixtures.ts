import type { LinkerData, LinkerLink } from '@/lib/api/types/linker'

// The linker as the dev backend answers it (content digest §8: the `cyan` theme, a gradient with
// white text and borders on transparent buttons, no logo, two Instagram rows), and the link
// shapes the digest lists.

export const CYAN = {
  key: 'cyan',
  background: 'linear-gradient(#0891b2, #22d3ee)',
  text_color: '#ffffff',
  button_background: 'transparent',
  button_text_color: '#ffffff',
  button_border: '#ffffff',
}

export function linkerFixture(overrides: Partial<LinkerData> = {}): LinkerData {
  return {
    name: 'فروشگاه فایرفلای',
    bio: 'کالای اصل با ضمانت اصالت و ارسال سریع به سراسر کشور.',
    logo: null,
    avatar_letter: 'ف',
    theme: CYAN,
    social_links_position: 'top',
    thumbnail_position: 'right',
    show_footer: true,
    rounded_edges: true,
    links: [
      link({
        id: 10001,
        link_type: 'button',
        title: 'گوشی\u{200C}های پرچمدار با تخفیف',
        value: '/product/list/flagship-phones/',
        href: 'http://localhost:3000/product/list/flagship-phones/',
      }),
      link({
        id: 10003,
        link_type: 'email',
        title: 'ایمیل به پشتیبانی',
        value: 'support@firefly-core.ir',
        href: 'mailto:support@firefly-core.ir',
      }),
      link({
        id: 10002,
        link_type: 'phone',
        title: 'تماس با پشتیبانی',
        value: '02191001234',
        href: 'tel:+982191001234',
      }),
      link({
        id: 10004,
        link_type: 'text',
        title: 'ساعت پاسخگویی',
        value: 'شنبه تا پنجشنبه\nساعت ۹ تا ۱۸',
        href: null,
      }),
    ],
    social_links: [
      {
        id: 10001,
        platform: 'instagram',
        url: 'https://www.instagram.com/firefly.shop',
        icon: 'http://localhost:8000/static/linker/social-icons/instagram.svg',
      },
      {
        id: 10002,
        platform: 'instagram',
        url: 'https://www.instagram.com/firefly.support',
        icon: 'http://localhost:8000/static/linker/social-icons/instagram.svg',
      },
      {
        id: 10003,
        platform: 'telegram',
        url: 'https://t.me/firefly_shop',
        icon: 'http://localhost:8000/static/linker/social-icons/telegram.svg',
      },
    ],
    ...overrides,
  }
}

/** A link row, `thumbnail` null unless given. */
export function link(
  row: Omit<LinkerLink, 'thumbnail'> & { thumbnail?: string | null },
): LinkerLink {
  return { thumbnail: null, ...row } as LinkerLink
}

/** A `button` or `video` row whose `href` is the API's absolute form of `value`. */
export function linkTo(
  id: number,
  link_type: 'button' | 'video',
  title: string,
  value: string,
): LinkerLink {
  const href = value.startsWith('/') ? `http://localhost:3000${value}` : value
  return link({ id, link_type, title, value, href })
}
