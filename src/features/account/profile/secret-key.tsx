'use client'

import { Copy } from 'lucide-react'
import { useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { announce } from '@/components/ui/live-announcer'

const COPIED = 'کلید کپی شد.'
const SELECTED = 'کلید انتخاب شد؛ آن را کپی کنید.'

/** «JBSW Y3DP …»: groups of four, easier to read and type (authenticators ignore the spaces). */
function grouped(secret: string): string {
  return secret.match(/.{1,4}/g)?.join(' ') ?? secret
}

/**
 * The setup's key, for an authenticator that cannot scan: shown in groups, copied whole with
 * «کپی کلید». Without a clipboard (an insecure origin, a browser that refuses), the key is
 * selected for the visitor to copy. It is never logged or stored, only shown.
 */
export function SecretKey({ secret }: { secret: string }) {
  const key = useRef<HTMLElement>(null)
  const [result, setResult] = useState<string | null>(null)

  async function copy() {
    let message = COPIED
    try {
      if (!navigator.clipboard) throw new Error('no clipboard')
      await navigator.clipboard.writeText(secret)
    } catch {
      const selection = window.getSelection()
      if (key.current && selection) selection.selectAllChildren(key.current)
      message = SELECTED
    }
    setResult(message)
    announce(message)
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-3">
        <code
          ref={key}
          dir="ltr"
          className="rounded-control bg-ink-50 px-3 py-2 font-mono text-base leading-7 tracking-wider break-all text-ink-900 select-all"
        >
          {grouped(secret)}
        </code>
        <Button variant="outline" size="sm" iconStart={<Copy aria-hidden />} onClick={copy}>
          کپی کلید
        </Button>
      </div>
      {result && <p className="text-sm leading-6 text-ink-700">{result}</p>}
    </div>
  )
}
