import { describe, expect, it } from 'vitest'
import { nextScrollState, type ScrollState } from '@/components/layout/scroll-state'

const START: ScrollState = { anchorY: 0, compact: false }

/** Feed scroll positions one by one and return the states. */
function run(positions: number[], from: ScrollState = START): ScrollState[] {
  const states: ScrollState[] = []
  let state = from
  for (const y of positions) {
    state = nextScrollState(state, y)
    states.push(state)
  }
  return states
}

describe('nextScrollState', () => {
  it('stays expanded near the top of the page', () => {
    expect(run([40, 120, 160]).map((state) => state.compact)).toEqual([false, false, false])
  })

  it('compacts when scrolling down past the header and expands when scrolling up', () => {
    const states = run([200, 260, 300, 295, 280])
    expect(states.map((state) => state.compact)).toEqual([true, true, true, true, false])
  })

  it('ignores jitter smaller than the threshold but adds slow movements up', () => {
    const states = run([300, 304, 307, 310], { anchorY: 300, compact: false })
    expect(states.map((state) => state.compact)).toEqual([false, false, false, true])
  })

  it('treats negative (rubber-band) positions as the top', () => {
    expect(nextScrollState({ anchorY: 500, compact: true }, -30)).toEqual({
      anchorY: 0,
      compact: false,
    })
  })
})
