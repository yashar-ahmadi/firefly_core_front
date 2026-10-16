import { useEffect, useRef, useState, type RefObject } from 'react'

/**
 * Whether the element has come within `rootMargin` of the viewport yet; true from then on (the
 * observer stops). False on the server and during hydration. Where IntersectionObserver is
 * missing it is true straight after mount.
 */
export function useSeenOnce<T extends Element>(
  rootMargin = '300px 0px',
): [RefObject<T | null>, boolean] {
  const ref = useRef<T>(null)
  const [seen, setSeen] = useState(false)
  useEffect(() => {
    const node = ref.current
    if (seen || !node) return
    if (typeof IntersectionObserver === 'undefined') {
      const frame = requestAnimationFrame(() => setSeen(true))
      return () => cancelAnimationFrame(frame)
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return
        observer.disconnect()
        setSeen(true)
      },
      { rootMargin },
    )
    observer.observe(node)
    return () => observer.disconnect()
  }, [seen, rootMargin])
  return [ref, seen]
}
