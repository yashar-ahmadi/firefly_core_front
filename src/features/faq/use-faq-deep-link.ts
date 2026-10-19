'use client'

import { useEffect, useRef } from 'react'
import { questionAnchor } from './faq-question'

const QUESTION_HASH = /^#faq-(\d+)$/

/** The question a URL fragment names (`#faq-<id>`), or null (a category's anchor included). */
export function questionFromHash(hash: string): number | null {
  const match = QUESTION_HASH.exec(hash)
  return match ? Number(match[1]) : null
}

/** The question's disclosure, while it is on the page and not hidden by a search. */
function shownQuestion(id: number): HTMLDetailsElement | null {
  const target = document.getElementById(questionAnchor(id))
  return target instanceof HTMLDetailsElement && !target.closest('[hidden]') ? target : null
}

function reveal(target: HTMLDetailsElement): void {
  target.open = true
  target.scrollIntoView({ block: 'start' })
}

/**
 * A link to one question (`/faq/#faq-<id>`, on arrival or from a link on the page: `hashchange`)
 * opens it and brings it into view (under the sticky header: its scroll margin). The browser
 * scrolls to the anchor by itself, but would leave it closed. A search that hides the question
 * is cleared first (`clearSearch`), and the question opens on the render that shows it again.
 */
export function useFaqDeepLink(clearSearch: () => void): void {
  const pending = useRef<number | null>(null)

  useEffect(() => {
    const follow = () => {
      const id = questionFromHash(window.location.hash)
      if (id === null || !(document.getElementById(questionAnchor(id)) instanceof HTMLElement)) {
        return
      }
      const target = shownQuestion(id)
      if (target) return reveal(target)
      pending.current = id
      clearSearch()
    }
    follow()
    window.addEventListener('hashchange', follow)
    return () => window.removeEventListener('hashchange', follow)
  }, [clearSearch])

  // After each render: the question a cleared search has just shown again.
  useEffect(() => {
    if (pending.current === null) return
    const target = shownQuestion(pending.current)
    if (!target) return
    pending.current = null
    reveal(target)
  })
}
