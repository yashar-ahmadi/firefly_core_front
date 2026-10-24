import localFont from 'next/font/local'

/**
 * Vazirmatn variable font (wght 100-900), self-hosted: src/assets/fonts/vazirmatn.
 * Exposes the CSS variable --font-vazirmatn, which Tailwind's `font-sans` reads first.
 * Apply `vazirmatn.variable` on <html>.
 *
 * The file is a subset of Vazirmatn 33.0.3 (85 KB instead of 111 KB, preloaded on every first
 * visit; Plan 5 Task 8): every glyph a Persian shop's text uses, and Latin-1. A letter outside it
 * (Latin Extended, IPA) shows in the fallback face. Made with fontTools, layout features and the
 * weight axis kept:
 *   pyftsubset Vazirmatn-wght.woff2 --flavor=woff2 --layout-features='*' --unicodes="U+0000-00FF,
 *   U+0600-06FF,U+0750-077F,U+2000-206F,U+2100-21FF,U+2212,U+25CC,U+FB50-FDFF,U+FE70-FEFF"
 */
export const vazirmatn = localFont({
  src: '../assets/fonts/vazirmatn/Vazirmatn-wght.woff2',
  variable: '--font-vazirmatn',
  display: 'swap',
  weight: '100 900',
  preload: true,
  // Persian-tuned stand-ins (src/styles/font-fallbacks.css), after next/font's own Arial-based
  // «vazirmatn Fallback»: text keeps Vazirmatn's width until it arrives, so nothing re-wraps.
  fallback: [
    'vazirmatn Fallback Noto Sans',
    'vazirmatn Fallback Noto Naskh',
    'vazirmatn Fallback DejaVu',
  ],
})
