import type { CSSProperties } from 'react'

// Grids whose rows come out even: seven tiles in rows of four make 4 + 3, not a row of five and
// one of two. Pure.

/** Tiles per row for `count` tiles in rows of at most `capacity`, as even as wrapping allows. */
export function balancedColumns(count: number, capacity: number): number {
  const rows = Math.max(1, Math.ceil(count / capacity))
  return Math.ceil(count / rows)
}

/** The most tiles a row may hold from each breakpoint. */
export interface RowCapacity {
  md: number
  lg: number
  xl: number
}

/** The `--grid-*` variables `BALANCED_GRID` reads, for `count` tiles. */
export function balancedGridVars(count: number, capacity: RowCapacity): CSSProperties {
  return {
    '--grid-md': balancedColumns(count, capacity.md),
    '--grid-lg': balancedColumns(count, capacity.lg),
    '--grid-xl': balancedColumns(count, capacity.xl),
  } as CSSProperties
}

/** Columns from md up taken from `balancedGridVars` (give the phone columns yourself). */
export const BALANCED_GRID =
  'md:grid-cols-[repeat(var(--grid-md),minmax(0,1fr))] lg:grid-cols-[repeat(var(--grid-lg),minmax(0,1fr))] xl:grid-cols-[repeat(var(--grid-xl),minmax(0,1fr))]'
