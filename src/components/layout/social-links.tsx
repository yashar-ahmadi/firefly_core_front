'use client'

import Image from 'next/image'
import { useState } from 'react'
import { isOptimizable } from '@/components/ui/smart-image'
import type { Social } from '@/lib/api/types/settings'
import { useOptionalStoreConfig } from '@/lib/config-context'
import { httpUrl } from '@/lib/html/safe-url'
import { FOOTER_HEADING } from './footer-styles'

/** What a social account is called: its name, else the handle, else the link's host. */
function socialName(social: Social): string {
  const name = social.name.trim() || social.username_or_id.trim()
  if (name) return name
  try {
    return new URL(social.link).hostname
  } catch {
    return social.link
  }
}

function SocialLink({ social, href }: { social: Social; href: string }) {
  const config = useOptionalStoreConfig()
  const [failed, setFailed] = useState(false)
  const name = socialName(social)
  const logo = !failed && social.logo ? social.logo : null
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={name}
      title={name}
      className="grid size-12 place-items-center rounded-control border border-ink-200 bg-white text-lg font-bold text-brand-700 transition-colors hover:border-brand-300 hover:bg-brand-50"
    >
      {logo ? (
        <Image
          src={logo}
          alt=""
          width={32}
          height={32}
          unoptimized={!isOptimizable(logo, config?.mediaOrigin)}
          onError={() => setFailed(true)}
          className="size-8 object-contain"
        />
      ) : (
        // Without a usable logo: the first letter of the name, never an icon guessed from it.
        <span aria-hidden>{Array.from(name)[0]}</span>
      )}
    </a>
  )
}

/**
 * The shop's social accounts (`global/socials/`, API order) as 48px tiles with their logos,
 * opening in a new tab. Each tile is named after the account; rows without an http(s) link are
 * left out.
 */
export function SocialLinks({ socials, title }: { socials: readonly Social[]; title: string }) {
  const links = socials.flatMap((social) => {
    const href = httpUrl(social.link)
    return href ? [{ social, href }] : []
  })
  if (links.length === 0) return null
  return (
    <section aria-labelledby="footer-socials">
      <h2 id="footer-socials" className={FOOTER_HEADING}>
        {title}
      </h2>
      <ul className="mt-4 flex flex-wrap gap-2">
        {links.map(({ social, href }) => (
          <li key={social.id}>
            <SocialLink social={social} href={href} />
          </li>
        ))}
      </ul>
    </section>
  )
}
