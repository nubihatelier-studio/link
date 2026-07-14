import { describe, expect, it } from 'vitest'
import { planAxisSections, planChartSections } from './chartPagination'

describe('planAxisSections', () => {
  it('returns a single section when everything fits on one page', () => {
    expect(planAxisSections(10, 20, 1)).toEqual([{ start: 0, end: 10, index: 0, total: 1 }])
  })

  it('splits with the requested overlap, and the last section still ends exactly at the total', () => {
    const sections = planAxisSections(25, 10, 1)
    expect(sections).toEqual([
      { start: 0, end: 10, index: 0, total: 3 },
      { start: 9, end: 19, index: 1, total: 3 },
      { start: 18, end: 25, index: 2, total: 3 },
    ])
    // Every section after the first starts exactly one unit before the previous one ended.
    for (let i = 1; i < sections.length; i++) {
      expect(sections[i].start).toBe(sections[i - 1].end - 1)
    }
  })

  it('with zero overlap, sections are contiguous and non-overlapping', () => {
    const sections = planAxisSections(25, 10, 0)
    expect(sections).toEqual([
      { start: 0, end: 10, index: 0, total: 3 },
      { start: 10, end: 20, index: 1, total: 3 },
      { start: 20, end: 25, index: 2, total: 3 },
    ])
  })

  it('never produces an empty or out-of-range section, even for tiny perPage values', () => {
    const sections = planAxisSections(7, 1, 1)
    expect(sections.every((s) => s.end > s.start && s.end <= 7 && s.start >= 0)).toBe(true)
  })
})

describe('planChartSections', () => {
  it('is a single section when the whole grid fits', () => {
    const sections = planChartSections(10, 10, 20, 20)
    expect(sections).toEqual([{ colStart: 0, colEnd: 10, rowStart: 0, rowEnd: 10, colIndex: 0, colSectionCount: 1, rowIndex: 0, rowSectionCount: 1 }])
  })

  it('produces a row-major grid of sections covering the whole pattern with no gaps', () => {
    const sections = planChartSections(25, 15, 10, 10)
    // 3 column sections x 2 row sections = 6 pages, row-major order.
    expect(sections).toHaveLength(6)
    expect(sections.map((s) => [s.rowIndex, s.colIndex])).toEqual([
      [0, 0],
      [0, 1],
      [0, 2],
      [1, 0],
      [1, 1],
      [1, 2],
    ])
    // Every real column/row is covered by at least one section.
    const coveredCols = new Set<number>()
    const coveredRows = new Set<number>()
    for (const s of sections) {
      for (let c = s.colStart; c < s.colEnd; c++) coveredCols.add(c)
      for (let r = s.rowStart; r < s.rowEnd; r++) coveredRows.add(r)
    }
    expect(coveredCols.size).toBe(25)
    expect(coveredRows.size).toBe(15)
  })
})
