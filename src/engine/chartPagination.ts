/** One axis-range [start, end) of a chart section, plus its 0-based position among that axis's sections. */
export interface AxisSection {
  start: number
  end: number
  index: number
  total: number
}

/**
 * Splits a `total`-length axis into consecutive sections of at most
 * `perPage` units, so each section still fits within the printable page
 * area at a legible bead size. `overlap` units are shared between adjacent
 * sections (repeated on both pages) so a weaver can align the seam when
 * taping sections together — used for columns (1-column overlap keeps the
 * thread's vertical continuity visible), not for rows.
 */
export function planAxisSections(total: number, perPage: number, overlap: number): AxisSection[] {
  if (total <= perPage) return [{ start: 0, end: total, index: 0, total: 1 }]

  const stride = Math.max(1, perPage - overlap)
  const starts: number[] = []
  let start = 0
  while (true) {
    starts.push(start)
    if (start + perPage >= total) break
    start += stride
  }

  return starts.map((s, i) => ({ start: s, end: Math.min(total, s + perPage), index: i, total: starts.length }))
}

/** A single chart-section page: a sub-rectangle of the full cols x rows grid. */
export interface ChartSection {
  colStart: number
  colEnd: number
  rowStart: number
  rowEnd: number
  colIndex: number
  colSectionCount: number
  rowIndex: number
  rowSectionCount: number
}

/**
 * Full page plan for a chart that doesn't fit legibly on one page: a grid of
 * sections, columns overlapping by one bead, rows not overlapping (see
 * `planAxisSections`). Order is row-major (all column-sections of row-section
 * 0, then row-section 1, ...), matching natural top-to-bottom reading order.
 */
export function planChartSections(cols: number, rows: number, colsPerPage: number, rowsPerPage: number): ChartSection[] {
  const colSections = planAxisSections(cols, colsPerPage, 1)
  const rowSections = planAxisSections(rows, rowsPerPage, 0)

  const sections: ChartSection[] = []
  for (const r of rowSections) {
    for (const c of colSections) {
      sections.push({
        colStart: c.start,
        colEnd: c.end,
        rowStart: r.start,
        rowEnd: r.end,
        colIndex: c.index,
        colSectionCount: c.total,
        rowIndex: r.index,
        rowSectionCount: r.total,
      })
    }
  }
  return sections
}
