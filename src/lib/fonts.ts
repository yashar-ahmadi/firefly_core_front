import localFont from 'next/font/local'

/**
 * Vazirmatn variable font (wght 100-900), self-hosted: src/assets/fonts/vazirmatn.
 * Exposes the CSS variable --font-vazirmatn, which Tailwind's `font-sans` reads first.
 * Apply `vazirmatn.variable` on <html>.
 */
export const vazirmatn = localFont({
  src: '../assets/fonts/vazirmatn/Vazirmatn-wght.woff2',
  variable: '--font-vazirmatn',
  display: 'swap',
  weight: '100 900',
  preload: true,
})
