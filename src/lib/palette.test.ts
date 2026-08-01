import { describe, expect, it } from 'vitest'
import type { ColorMap } from '@/engine/types'
import { paletteFromCells, replaceColorInCells, selectionForColor, swapColorsInCells } from './palette'

describe('paletteFromCells', () => {
  it('counts and sorts by descending frequency, ignoring empty cells', () => {
    const cells: ColorMap = { '0,0': '#111', '0,1': '#111', '0,2': '#222', '0,3': undefined }
    expect(paletteFromCells(cells)).toEqual([
      { hex: '#111', count: 2 },
      { hex: '#222', count: 1 },
    ])
  })

  describe('with a woven loop\'s beads (Tarea 3)', () => {
    it('adds a new entry when the loop uses a color not otherwise on the grid', () => {
      const cells: ColorMap = { '0,0': '#111', '0,1': '#111' }
      expect(paletteFromCells(cells, { color: '#333', count: 8 })).toEqual([
        { hex: '#333', count: 8 },
        { hex: '#111', count: 2 },
      ])
    })

    it('merges into the existing entry when the loop reuses a color already in the pattern', () => {
      const cells: ColorMap = { '0,0': '#111', '0,1': '#222' }
      expect(paletteFromCells(cells, { color: '#222', count: 5 })).toEqual([
        { hex: '#222', count: 6 },
        { hex: '#111', count: 1 },
      ])
    })

    it('a metal loop (count 0) or no loop at all leaves the palette identical', () => {
      const cells: ColorMap = { '0,0': '#111' }
      expect(paletteFromCells(cells, { color: '#222', count: 0 })).toEqual(paletteFromCells(cells))
      expect(paletteFromCells(cells, undefined)).toEqual(paletteFromCells(cells))
    })
  })
})

describe('replaceColorInCells', () => {
  it('repaints every cell matching fromHex, leaving other colors untouched', () => {
    const cells: ColorMap = { '0,0': '#111', '0,1': '#222', '0,2': '#111' }
    const next = replaceColorInCells(cells, '#111', '#333')
    expect(next).toEqual({ '0,0': '#333', '0,1': '#222', '0,2': '#333' })
  })

  it('is a no-op returning the same reference when fromHex equals toHex', () => {
    const cells: ColorMap = { '0,0': '#111' }
    expect(replaceColorInCells(cells, '#111', '#111')).toBe(cells)
  })

  it('preserves empty (uncolored) cells untouched', () => {
    const cells: ColorMap = { '0,0': '#111', '0,1': undefined }
    const next = replaceColorInCells(cells, '#111', '#222')
    expect(next).toEqual({ '0,0': '#222', '0,1': undefined })
  })

  it('does nothing when fromHex is not present in the cells', () => {
    const cells: ColorMap = { '0,0': '#111' }
    expect(replaceColorInCells(cells, '#999', '#222')).toEqual({ '0,0': '#111' })
  })
})

describe('swapColorsInCells', () => {
  it('swaps both colors in a single pass, leaving other colors untouched', () => {
    const cells: ColorMap = { '0,0': '#111', '0,1': '#222', '0,2': '#111', '0,3': '#333' }
    const next = swapColorsInCells(cells, '#111', '#222')
    expect(next).toEqual({ '0,0': '#222', '0,1': '#111', '0,2': '#222', '0,3': '#333' })
  })

  it('is a no-op returning the same reference when both hexes are equal', () => {
    const cells: ColorMap = { '0,0': '#111' }
    expect(swapColorsInCells(cells, '#111', '#111')).toBe(cells)
  })

  it('preserves empty (uncolored) cells untouched', () => {
    const cells: ColorMap = { '0,0': '#111', '0,1': undefined, '0,2': '#222' }
    const next = swapColorsInCells(cells, '#111', '#222')
    expect(next).toEqual({ '0,0': '#222', '0,1': undefined, '0,2': '#111' })
  })

  it('does nothing when neither hex is present in the cells', () => {
    const cells: ColorMap = { '0,0': '#111' }
    expect(swapColorsInCells(cells, '#888', '#999')).toEqual({ '0,0': '#111' })
  })
})

describe('selectionForColor', () => {
  it('returns the exact cell mask plus its bounding box for a scattered color', () => {
    // '#111' cells at (0,0) and (2,3) — not a rectangle, and (1,1)/(0,3) belong to other colors.
    const cells: ColorMap = { '0,0': '#111', '1,1': '#222', '2,3': '#111', '0,3': '#222' }
    const result = selectionForColor(cells, '#111')
    expect(result?.rect).toEqual({ r0: 0, c0: 0, r1: 2, c1: 3 })
    expect(result?.mask).toEqual(new Set(['0,0', '2,3']))
  })

  it('returns null when the color is not present', () => {
    const cells: ColorMap = { '0,0': '#111' }
    expect(selectionForColor(cells, '#999')).toBeNull()
  })

  it('ignores empty (uncolored) cells even when scattered among matches', () => {
    const cells: ColorMap = { '0,0': undefined, '0,1': '#111' }
    const result = selectionForColor(cells, '#111')
    expect(result?.mask).toEqual(new Set(['0,1']))
  })

  it('a single matching cell yields a 1x1 bounding box', () => {
    const cells: ColorMap = { '3,4': '#111' }
    const result = selectionForColor(cells, '#111')
    expect(result?.rect).toEqual({ r0: 3, c0: 4, r1: 3, c1: 4 })
    expect(result?.mask).toEqual(new Set(['3,4']))
  })
})
