import { clsx, type ClassValue } from 'clsx'
import { extendTailwindMerge } from 'tailwind-merge'

// Teach tailwind-merge the theme's custom scales (src/styles/globals.css), so that for example
// `rounded-control` and `rounded-full` are known to conflict.
const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      radius: ['control', 'card', 'pill'],
      shadow: ['card', 'raised'],
      animate: [
        'shimmer',
        'pop',
        'fade-in',
        'fade-out',
        'dialog-in',
        'dialog-out',
        'drawer-in',
        'drawer-out',
        'menu-in',
        'menu-out',
        'accordion-down',
        'accordion-up',
      ],
    },
  },
})

/** Joins class names and resolves Tailwind conflicts: the last class of a group wins. */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}
