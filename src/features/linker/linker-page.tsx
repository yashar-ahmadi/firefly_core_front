import { cn } from '@/components/ui/cn'
import { SmartImage } from '@/components/ui/smart-image'
import type { LinkerData, LinkerSocialLink } from '@/lib/api/types/linker'
import { httpUrl } from '@/lib/html/safe-url'
import { LinkerLinks } from './linker-links'
import { linkerStyle } from './linker-theme'

/**
 * The root paints the theme: its background (a colour or a gradient: never repeated, the whole
 * screen high), its text colour, and a focus ring in the text colour, which the theme keeps
 * readable on its own background (every ring sits on it, outside its control).
 */
const ROOT = cn(
  'min-h-screen [background:var(--linker-background)_no-repeat] text-(--linker-text)',
  '[&_:focus-visible]:outline-(--linker-text)',
)

/** The social accounts: black monochrome icons on white circles, 48px, each named by platform. */
function LinkerSocials({ socials }: { socials: readonly LinkerSocialLink[] }) {
  const accounts = socials.flatMap((social) => {
    const href = httpUrl(social.url)
    return href ? [{ social, href }] : []
  })
  if (accounts.length === 0) return null
  return (
    <ul aria-label={'شبکه\u{200C}های اجتماعی'} className="flex flex-wrap justify-center gap-3">
      {accounts.map(({ social, href }) => (
        <li key={social.id}>
          <a
            href={href}
            aria-label={social.platform}
            className="grid size-12 place-items-center rounded-full bg-white shadow-sm transition-transform hover:scale-105 motion-reduce:transition-none"
          >
            <SmartImage src={social.icon} alt="" width={24} height={24} className="size-6" />
          </a>
        </li>
      ))}
    </ul>
  )
}

/**
 * The linker ("link in bio", content digest §8), one template for every theme: the palette as
 * CSS variables on the root (`linkerStyle`), never a branch on `theme.key`. Its head (the logo,
 * or the name's letter in a circle; the name as the page's one h1; the bio), the social row on
 * top (under the head) or at the bottom (under the links), the links (LinkerLinks: thumbnails on
 * the physical side the operator chose), and the footer line (the name) with `show_footer`. A
 * server component: no code of its own in the browser.
 */
export function LinkerPage({ linker }: { linker: LinkerData }) {
  const socials = <LinkerSocials socials={linker.social_links} />
  const letter = linker.avatar_letter ?? Array.from(linker.name.trim())[0] ?? ''
  const bio = linker.bio.trim()
  return (
    <div data-linker="" style={linkerStyle(linker.theme, linker.rounded_edges)} className={ROOT}>
      <div className="mx-auto flex w-full max-w-xl flex-col items-center gap-6 px-4 py-10 sm:py-14">
        <header className="flex flex-col items-center gap-3 text-center">
          {linker.logo ? (
            <SmartImage
              src={linker.logo}
              alt=""
              width={96}
              height={96}
              priority
              className="size-24 rounded-full bg-white object-contain"
            />
          ) : (
            <span
              aria-hidden
              data-avatar-letter=""
              className="grid size-24 place-items-center rounded-full bg-[color-mix(in_srgb,var(--linker-text)_20%,transparent)] text-4xl font-bold"
            >
              {letter}
            </span>
          )}
          <h1 dir="auto" className="text-2xl leading-10 font-bold">
            {linker.name}
          </h1>
          {bio && (
            <p dir="auto" className="max-w-md text-base leading-8 whitespace-pre-line">
              {bio}
            </p>
          )}
        </header>
        {linker.social_links_position !== 'bottom' && socials}
        <LinkerLinks links={linker.links} side={linker.thumbnail_position} />
        {linker.social_links_position === 'bottom' && socials}
        {linker.show_footer && (
          <footer className="pt-2 text-center text-sm leading-6">{linker.name}</footer>
        )}
      </div>
    </div>
  )
}
