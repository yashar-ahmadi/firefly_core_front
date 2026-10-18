// A short, light burst of confetti over the page for a payment that went through: about sixty
// small pieces in the shop's colours, falling for under two seconds on one canvas that never
// takes a click and is gone afterwards. Loaded only then (a lazy chunk), and never under
// reduced motion (the caller checks before loading it; checked again here).

const DURATION_MS = 1_800
const PIECES = 60

interface Piece {
  x: number
  y: number
  vx: number
  vy: number
  size: number
  turn: number
  spin: number
  color: string
}

function colours(): string[] {
  const style = getComputedStyle(document.documentElement)
  const read = (name: string, fallback: string) => style.getPropertyValue(name).trim() || fallback
  return [read('--brand', '#0f766e'), read('--accent', '#f59e0b'), '#117a37', '#0369a1', '#c01048']
}

export function burstConfetti(): void {
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return
  const canvas = document.createElement('canvas')
  const context = canvas.getContext('2d')
  if (!context) return
  canvas.setAttribute('aria-hidden', 'true')
  canvas.setAttribute('data-confetti', '')
  canvas.style.cssText =
    'position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:60'
  const ratio = Math.min(window.devicePixelRatio || 1, 2)
  const width = window.innerWidth
  const height = window.innerHeight
  canvas.width = width * ratio
  canvas.height = height * ratio
  context.scale(ratio, ratio)
  document.body.append(canvas)

  const palette = colours()
  const pieces: Piece[] = Array.from({ length: PIECES }, (_, index) => ({
    x: width / 2 + (Math.random() - 0.5) * width * 0.3,
    y: height * 0.25,
    vx: (Math.random() - 0.5) * 9,
    vy: -6 - Math.random() * 6,
    size: 5 + Math.random() * 5,
    turn: Math.random() * Math.PI,
    spin: (Math.random() - 0.5) * 0.3,
    color: palette[index % palette.length]!,
  }))
  const start = performance.now()
  const frame = (now: number) => {
    const elapsed = now - start
    context.clearRect(0, 0, width, height)
    context.globalAlpha = Math.max(
      0,
      1 - Math.max(0, elapsed - DURATION_MS * 0.6) / (DURATION_MS * 0.4),
    )
    for (const piece of pieces) {
      piece.vy += 0.25
      piece.vx *= 0.99
      piece.x += piece.vx
      piece.y += piece.vy
      piece.turn += piece.spin
      context.save()
      context.translate(piece.x, piece.y)
      context.rotate(piece.turn)
      context.fillStyle = piece.color
      context.fillRect(-piece.size / 2, -piece.size / 4, piece.size, piece.size / 2)
      context.restore()
    }
    if (elapsed < DURATION_MS) requestAnimationFrame(frame)
    else canvas.remove()
  }
  requestAnimationFrame(frame)
}
