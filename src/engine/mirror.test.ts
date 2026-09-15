import { describe, expect, it } from 'vitest'
import type { ColorMap } from './types'
import { reflectRegion } from './mirror'

describe('reflectRegion', () => {
  it('flips a 2x2 region horizontally (left-right) in place', () => {
    const cells: ColorMap = { '0,0': '#A', '0,1': '#B', '1,0': '#C', '1,1': '#D' }
    const next = reflectRegion(cells, { r0: 0, c0: 0, r1: 1, c1: 1 }, 'horizontal')
    expect(next).toEqual({ '0,0': '#B', '0,1': '#A', '1,0': '#D', '1,1': '#C' })
  })

  it('flips a 2x2 region vertically (top-bottom) in place', () => {
    const cells: ColorMap = { '0,0': '#A', '0,1': '#B', '1,0': '#C', '1,1': '#D' }
    const next = reflectRegion(cells, { r0: 0, c0: 0, r1: 1, c1: 1 }, 'vertical')
    expect(next).toEqual({ '0,0': '#C', '0,1': '#D', '1,0': '#A', '1,1': '#B' })
  })

  it('leaves cells outside the selected rect untouched', () => {
    const cells: ColorMap = { '0,0': '#A', '0,1': '#B', '5,5': '#Z' }
    const next = reflectRegion(cells, { r0: 0, c0: 0, r1: 0, c1: 1 }, 'horizontal')
    expect(next['5,5']).toBe('#Z')
  })

  it('preserves empty cells within the region instead of leaving stale hexes', () => {
    const cells: ColorMap = { '0,0': '#A' } // '0,1' is empty
    const next = reflectRegion(cells, { r0: 0, c0: 0, r1: 0, c1: 1 }, 'horizontal')
    expect(next).toEqual({ '0,1': '#A' })
  })

  it('a single-cell selection is unchanged by either flip', () => {
    const cells: ColorMap = { '2,2': '#A' }
    const rect = { r0: 2, c0: 2, r1: 2, c1: 2 }
    expect(reflectRegion(cells, rect, 'horizontal')).toEqual(cells)
    expect(reflectRegion(cells, rect, 'vertical')).toEqual(cells)
  })
})
