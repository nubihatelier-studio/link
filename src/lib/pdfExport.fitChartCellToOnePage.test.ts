import { describe, expect, it } from 'vitest'
import { fitChartCellToOnePage } from './pdfExport'

const BASE = { w: 3.5, h: 3.5 }

describe('fitChartCellToOnePage', () => {
  it('keeps the base size when the grid already fits within the available space', () => {
    const result = fitChartCellToOnePage(BASE, 10, 10, 200, 200)
    expect(result).toEqual(BASE)
  })

  it('shrinks proportionally when the grid is too wide for the available width', () => {
    const availW = 100
    const result = fitChartCellToOnePage(BASE, 50, 10, availW, 200)
    expect(result.w * 50).toBeCloseTo(availW, 5)
    expect(result.w / result.h).toBeCloseTo(BASE.w / BASE.h, 5)
  })

  it('shrinks proportionally when the grid is too tall for the available height', () => {
    const availH = 100
    const result = fitChartCellToOnePage(BASE, 10, 80, 200, availH)
    expect(result.h * 80).toBeCloseTo(availH, 5)
    expect(result.w / result.h).toBeCloseTo(BASE.w / BASE.h, 5)
  })

  it('produces a small but positive cell size for a very large pattern, always fitting one page', () => {
    const availW = 180
    const availH = 250
    const cols = 300
    const totalRows = 300
    const result = fitChartCellToOnePage(BASE, cols, totalRows, availW, availH)
    expect(result.w).toBeGreaterThan(0)
    expect(result.h).toBeGreaterThan(0)
    expect(result.w * cols).toBeLessThanOrEqual(availW + 1e-6)
    expect(result.h * totalRows).toBeLessThanOrEqual(availH + 1e-6)
  })

  it('shrinks based on whichever dimension is the tighter constraint', () => {
    // Width is the binding constraint here (needs 0.5x), height only needs ~0.9x.
    const result = fitChartCellToOnePage(BASE, 100, 10, 175, 31.5)
    expect(result.w).toBeCloseTo(1.75, 5)
    expect(result.h).toBeCloseTo(1.75, 5)
  })
})
