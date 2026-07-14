import { describe, expect, it } from 'vitest'
import type { ColorMap } from '@/engine/types'
import { letterForIndex, paletteFromCells, replaceColorInCells } from './palette'

describe('letterForIndex', () => {
  it('cycles A-Z then rolls over to AA, AB, ...', () => {
    expect(letterForIndex(0)).toBe('A')
    expect(letterForIndex(25)).toBe('Z')
    expect(letterForIndex(26)).toBe('AA')
    expect(letterForIndex(27)).toBe('AB')
    expect(letterForIndex(51)).toBe('AZ')
    expect(letterForIndex(52)).toBe('BA')
  })
})

describe('paletteFromCells', () => {
  it('counts and sorts by descending frequency, ignoring empty cells', () => {
    const cells: ColorMap = { '0,0': '#111', '0,1': '#111', '0,2': '#222', '0,3': undefined }
    expect(paletteFromCells(cells)).toEqual([
      { hex: '#111', count: 2 },
      { hex: '#222', count: 1 },
    ])
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
