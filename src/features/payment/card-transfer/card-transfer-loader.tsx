'use client'

import dynamic from 'next/dynamic'
import { reloadPage } from '@/lib/navigation/hard-navigation'
import type { CardTransferPageProps } from './card-transfer-page'

// The card-transfer page's island (card-transfer-page.tsx) as its own chunk, rendered on the
// server as well (its first words and the cards' skeleton, with no flash): the route's entry
// stays a thin wrapper, as the payment link's and the result page's do, so the new route moves
// the shop's shared chunks as little as possible (the JS budget; see docs/ARCHITECTURE.md). A
// chunk that cannot load says so with a reload.

function PageUnavailable() {
  return (
    <div
      role="alert"
      className="flex flex-wrap items-center justify-center gap-3 text-base leading-7 text-ink-800"
    >
      <span>این صفحه بارگذاری نشد.</span>
      <button
        type="button"
        onClick={reloadPage}
        className="h-11 rounded-control border border-ink-300 bg-white px-4 font-medium text-ink-800 hover:bg-ink-50"
      >
        بارگذاری دوباره
      </button>
    </div>
  )
}

export const CardTransfer = dynamic<CardTransferPageProps>(() =>
  import('./card-transfer-page')
    .then((module) => module.CardTransferPage)
    .catch(() => PageUnavailable),
)
