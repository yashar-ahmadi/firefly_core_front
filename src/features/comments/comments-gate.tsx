'use client'

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { subjectRules, type CommentSubject } from '@/features/comments/subjects'
import { useFeature } from '@/features/settings/feature-context'

// Whether a subject's comment forms are open: every composer of the section (a root comment, a
// question, a reply) and every «پاسخ» asks here, so they open and close together.

interface Gate {
  /** The operator closed the forms of this subject: why (shown instead of the form); else null. */
  closed: string | null
  close: (reason: string) => void
  /**
   * True once, for the first sentence shown after a send closed the forms (the form that had the
   * focus is gone: the sentence takes it). Every later call, and without a refused send, false.
   */
  takeFocus: () => boolean
}

const GateContext = createContext<Gate | null>(null)

/**
 * A subject's own switch of its forms: a page's `enable_comments` (`open`), then a send refused
 * because the operator has closed them since (`403 page_comments_disabled`: `close(reason)`).
 * Without a gate (a blog post's section) the forms are open as far as the subject goes.
 */
export function CommentsGate({
  subject,
  open,
  children,
}: {
  subject: CommentSubject
  open: boolean
  children: ReactNode
}) {
  const [refused, setRefused] = useState<string | null>(null)
  const focusPending = useRef(false)
  const closedText = subjectRules(subject.kind).closed
  const close = useCallback(
    (reason: string) => {
      focusPending.current = true
      setRefused(reason.trim() || closedText)
    },
    [closedText],
  )
  const takeFocus = useCallback(() => {
    const pending = focusPending.current
    focusPending.current = false
    return pending
  }, [])
  const value = useMemo<Gate>(
    () => ({ closed: refused ?? (open ? null : closedText), close, takeFocus }),
    [refused, open, closedText, close, takeFocus],
  )
  return <GateContext value={value}>{children}</GateContext>
}

/**
 * Why `subject`'s forms are closed, or null while they are open: its feature switch first (a
 * post's `blog_comments`, with the operator's reason), then its gate (`CommentsGate`).
 */
export function useCommentsClosed(subject: CommentSubject): string | null {
  const rules = subjectRules(subject.kind)
  // Hooks run on every render: a page (no switch of its own) reads the blog's and ignores it.
  const feature = useFeature(rules.formSwitch ?? 'blog_comments')
  const gate = useContext(GateContext)
  if (rules.formSwitch !== null && !feature.enabled) return feature.reason ?? rules.closed
  return gate?.closed ?? null
}

/** Closes the forms of the nearest gate (a refused send's 403); nothing without one. Stable. */
export function useCloseComments(): (reason: string) => void {
  const gate = useContext(GateContext)
  return gate?.close ?? noop
}

/** The gate's one-shot focus (see `Gate.takeFocus`); always false without a gate. Stable. */
export function useTakeClosedFocus(): () => boolean {
  const gate = useContext(GateContext)
  return gate?.takeFocus ?? never
}

function noop() {}

function never() {
  return false
}
