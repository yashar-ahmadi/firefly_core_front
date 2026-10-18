'use client'

import dynamic from 'next/dynamic'
import { reloadPage } from '@/lib/navigation/hard-navigation'
import type { TrackPageProps } from './track-page'

// The tracking page's island (track-page.tsx) as its own chunk, rendered on the server as well
// (the form, with its button disabled until hydrated): the route's entry stays a thin wrapper, as
// the payment pages' do, so the new route moves the shop's shared chunks as little as possible
// (the JS budget). A chunk that cannot load says so with a reload.

function PageUnavailable() {
  return (
    <div
      role="alert"
      className="flex flex-wrap items-center gap-3 rounded-card bg-white p-5 text-base leading-7 text-ink-800 shadow-card"
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

export const TrackOrder = dynamic<TrackPageProps>(() =>
  import('./track-page').then((module) => module.TrackPage).catch(() => PageUnavailable),
)
