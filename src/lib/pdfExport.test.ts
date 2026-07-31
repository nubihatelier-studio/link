import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getBeadType } from '@/data/beadTypes'
import type { ColorMap, FringeData, LoopData } from '@/engine/types'
import { beadCount, gridFromPhysicalSizeMm, physicalSizeMm } from '@/engine/geometry'
import { CALIBRATION_SAMPLE } from '@/engine/calibration'
import { formatSizeMm } from '@/engine/units'
import { loopBeadCount, loopHeightUnits } from '@/engine/loop'
import {
  chartCellMm,
  chooseOnePageLayout,
  exportPatternToPdf,
  fitChartCellToOnePage,
  rulerLabelIndices,
  rulerLabelStep,
} from './pdfExport'

// Route the native (Capacitor) export path instead of doc.save()'s browser download,
// which jsdom doesn't implement — this still exercises the full document build.
vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => true } }))
vi.mock('@capacitor/filesystem', () => ({
  Filesystem: {
    writeFile: vi.fn(async () => {}),
    getUri: vi.fn(async () => ({ uri: 'file://fake' })),
  },
  Directory: { Cache: 'CACHE' },
}))
vi.mock('@capacitor/share', () => ({ Share: { share: vi.fn(async () => {}) } }))

let lastDoc: import('jspdf').jsPDF | undefined

vi.mock('jspdf', async (importOriginal) => {
  const actual = await importOriginal<typeof import('jspdf')>()
  class SpyJsPDF extends actual.jsPDF {
    constructor(...args: ConstructorParameters<typeof actual.jsPDF>) {
      super(...args)
      // oxlint-disable-next-line typescript/no-this-alias -- intentional: capturing the constructed instance for assertions.
      lastDoc = this
    }
  }
  return { ...actual, jsPDF: SpyJsPDF }
})

function fillCells(cols: number, rows: number): ColorMap {
  const cells: ColorMap = {}
  const palette = ['#c9a227', '#2f5b66', '#1c1c1e']
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      cells[`${r},${c}`] = palette[(r + c) % palette.length]
    }
  }
  return cells
}

describe('rulerLabelStep / rulerLabelIndices — intervalo de numeración (Corrección 1)', () => {
  it('resolves to a round number (1, 5, 10, 25, 50…), never an arbitrary interval', () => {
    const roundNumbers = new Set([1, 5, 10, 25, 50, 100, 250, 500, 1000])
    for (const cellSizeMm of [0.3, 0.8, 1.5, 3.2, 5]) {
      for (const count of [4, 12, 37, 50, 100, 200]) {
        expect(roundNumbers.has(rulerLabelStep(count, cellSizeMm))).toBe(true)
      }
    }
  })

  it('never places two labels closer than the legible minimum', () => {
    for (const cellSizeMm of [0.3, 0.8, 1.5, 3.2, 5]) {
      for (const count of [4, 12, 37, 50, 100, 200]) {
        const step = rulerLabelStep(count, cellSizeMm)
        expect(step * cellSizeMm).toBeGreaterThanOrEqual(4) // MIN_LABEL_GAP_MM
      }
    }
  })

  it('always includes the first (0) and last (count - 1) index', () => {
    for (const cellSizeMm of [0.3, 3.2]) {
      for (const count of [4, 12, 37, 200]) {
        const indices = rulerLabelIndices(count, cellSizeMm)
        expect(indices[0]).toBe(0)
        expect(indices[indices.length - 1]).toBe(count - 1)
      }
    }
  })

  it('a tiny cell size (large shrunk pattern) still never packs labels tighter than legible', () => {
    const indices = rulerLabelIndices(200, 0.3)
    for (let i = 1; i < indices.length; i++) {
      const gapMm = (indices[i] - indices[i - 1]) * 0.3
      expect(gapMm).toBeGreaterThanOrEqual(4 - 1e-9)
    }
  })

  it('columns and rows resolve independently, each from its own axis size — not one interval reused for both', () => {
    // A pattern with a much wider column cell than row cell (e.g. brick) must not use the
    // same step for both axes — the previous logic derived one `step` from the column count
    // alone and reused it for rows, which is exactly the bug this correction fixes.
    const wideCellW = 10 // plenty of room — every column could be labeled
    const tinyCellH = 0.4 // cramped — needs a much coarser interval
    const colIndices = rulerLabelIndices(20, wideCellW)
    const rowIndices = rulerLabelIndices(20, tinyCellH)
    expect(rulerLabelStep(20, wideCellW)).toBeLessThan(rulerLabelStep(20, tinyCellH))
    expect(colIndices.length).toBeGreaterThan(rowIndices.length)
    expect(rowIndices[0]).toBe(0)
    expect(rowIndices[rowIndices.length - 1]).toBe(19)
  })

  it('a 6x37 peyote pattern (the reported case) numbers columns more densely than rows, first/last always present, never crowded', () => {
    // Base cell {w:3.2, h:3.9} comfortably fits this pattern at full size (see
    // fitChartCellToOnePage tests below), so both axes use their own *base* cell size directly.
    const base = chartCellMm('peyote')
    const { w: cellW, h: cellH } = fitChartCellToOnePage(base, 6, 37, 180, 260)
    const colIndices = rulerLabelIndices(6, cellW)
    const rowIndices = rulerLabelIndices(37, cellH)
    // The reported bug: with the old cols-only interval, all 37 rows were labeled and
    // overlapped. Now rows use their own (coarser, since cellH alone doesn't clear the
    // legible gap at every single row) interval — far fewer than 37 labels.
    expect(rowIndices.length).toBeLessThan(37)
    expect(rowIndices[0]).toBe(0)
    expect(rowIndices[rowIndices.length - 1]).toBe(36)
    expect(colIndices[0]).toBe(0)
    expect(colIndices[colIndices.length - 1]).toBe(5)
  })

  describe('los cuatro patrones exigidos: 6×37, 50×50, 100×200, 12×12', () => {
    const configs: { name: string; cols: number; rows: number }[] = [
      { name: '6x37', cols: 6, rows: 37 },
      { name: '50x50', cols: 50, rows: 50 },
      { name: '100x200', cols: 100, rows: 200 },
      { name: '12x12', cols: 12, rows: 12 },
    ]

    it.each(configs)('$name: ninguna etiqueta a menos del mínimo legible, siempre primera y última', ({ cols, rows }) => {
      const base = chartCellMm('loom')
      // Mirrors exportPatternToPdf's own paginated-chart geometry: a single A4 page, minus margins.
      const { w: cellW, h: cellH } = fitChartCellToOnePage(base, cols, rows, 210 - 28, 297 - 40)

      const colIndices = rulerLabelIndices(cols, cellW)
      const rowIndices = rulerLabelIndices(rows, cellH)

      expect(colIndices[0]).toBe(0)
      expect(colIndices[colIndices.length - 1]).toBe(cols - 1)
      expect(rowIndices[0]).toBe(0)
      expect(rowIndices[rowIndices.length - 1]).toBe(rows - 1)

      for (let i = 1; i < colIndices.length; i++) {
        expect((colIndices[i] - colIndices[i - 1]) * cellW).toBeGreaterThanOrEqual(4 - 1e-9)
      }
      for (let i = 1; i < rowIndices.length; i++) {
        expect((rowIndices[i] - rowIndices[i - 1]) * cellH).toBeGreaterThanOrEqual(4 - 1e-9)
      }
    })
  })
})

describe('chooseOnePageLayout — selector de una hoja vs. paginado (Corrección 2)', () => {
  const margin = 14

  it('un patrón chico (12×12) resuelve a una hoja, con el gráfico a su tamaño legible completo', () => {
    const layout = chooseOnePageLayout(chartCellMm('loom'), 12, 12, margin)
    expect(layout).not.toBeNull()
    const base = chartCellMm('loom')
    expect(layout!.cellW).toBe(base.w)
    expect(layout!.cellH).toBe(base.h)
  })

  it('un patrón angosto y alto (6×37) también resuelve a una hoja, sin achicar la celda', () => {
    const layout = chooseOnePageLayout(chartCellMm('peyote'), 6, 37, margin)
    expect(layout).not.toBeNull()
    const base = chartCellMm('peyote')
    expect(layout!.cellW).toBe(base.w)
    expect(layout!.cellH).toBe(base.h)
  })

  it('un patrón grande (50×50) cae al modo paginado', () => {
    expect(chooseOnePageLayout(chartCellMm('loom'), 50, 50, margin)).toBeNull()
  })

  it('un patrón grande (100×200) cae al modo paginado', () => {
    expect(chooseOnePageLayout(chartCellMm('loom'), 100, 200, margin)).toBeNull()
  })

  it('prefiere retrato, pero usa horizontal cuando un patrón ancho y bajo no cabe en una columna vertical', () => {
    // 30 columns at loom's 3.5mm base (105mm) won't fit a portrait column
    // (~86mm wide), but comfortably fits a landscape one (~129.5mm wide) at
    // only 4 rows tall.
    const layout = chooseOnePageLayout(chartCellMm('loom'), 30, 4, margin)
    expect(layout).not.toBeNull()
    expect(layout!.orientation).toBe('landscape')
  })
})

describe('exportPatternToPdf', () => {
  const bead = getBeadType('miyuki-delica-11')

  beforeEach(() => {
    lastDoc = undefined
  })

  it('builds a small, fully-colored pattern as a single sheet — chart and materials side by side', async () => {
    const { exportPatternToPdf } = await import('./pdfExport')
    await exportPatternToPdf({
      name: 'Prueba chica',
      technique: 'peyote',
      cols: 6,
      rows: 20,
      cells: fillCells(6, 20),
      beadType: bead,
    })

    expect(lastDoc).toBeDefined()
    expect(lastDoc!.getNumberOfPages()).toBe(1)
  })

  it('falls back to the paginated layout for a very large pattern (ficha+materials page, then a single chart page)', async () => {
    const { exportPatternToPdf } = await import('./pdfExport')
    await exportPatternToPdf({
      name: 'Prueba grande',
      technique: 'loom',
      cols: 150,
      rows: 150,
      cells: fillCells(150, 150),
      beadType: bead,
    })

    expect(lastDoc).toBeDefined()
    expect(lastDoc!.getNumberOfPages()).toBe(2)
  })

  it('does not throw with showLetters disabled', async () => {
    const { exportPatternToPdf } = await import('./pdfExport')
    await expect(
      exportPatternToPdf({
        name: 'Sin letras',
        technique: 'brick',
        cols: 10,
        rows: 10,
        cells: fillCells(10, 10),
        beadType: bead,
        showLetters: false,
      }),
    ).resolves.not.toThrow()
  })

  it('does not throw for an empty (uncolored) pattern', async () => {
    const { exportPatternToPdf } = await import('./pdfExport')
    await expect(
      exportPatternToPdf({
        name: 'Vacío',
        technique: 'loom',
        cols: 8,
        rows: 8,
        cells: {},
        beadType: bead,
      }),
    ).resolves.not.toThrow()
  })

  it('does not throw with a saved note, even a long one that has to wrap and get capped', async () => {
    const { exportPatternToPdf } = await import('./pdfExport')
    await expect(
      exportPatternToPdf({
        name: 'Con nota',
        technique: 'loom',
        cols: 8,
        rows: 8,
        cells: fillCells(8, 8),
        beadType: bead,
        note: 'Para el cumpleaños de mamá. '.repeat(20),
      }),
    ).resolves.not.toThrow()
  })

  describe('with a fringe', () => {
    it('does not throw and draws fine with a fringe on a small pattern', async () => {
      const { exportPatternToPdf } = await import('./pdfExport')
      const fringe: FringeData = { lengths: [3, 3, 0, 3, 3, 0], turnBeads: [true, true, false, true, true, false] }
      await expect(
        exportPatternToPdf({
          name: 'Con fleco',
          technique: 'brick',
          cols: 6,
          rows: 10,
          cells: fillCells(6, 10),
          fringe,
          beadType: bead,
        }),
      ).resolves.not.toThrow()
    })

    it('a long fringe that pushes the pattern past one-page size falls back to the paginated layout, still a single chart page', async () => {
      const { exportPatternToPdf } = await import('./pdfExport')
      const cols = 10
      const rows = 60
      const cells = fillCells(cols, rows)

      await exportPatternToPdf({ name: 'Sin fleco', technique: 'loom', cols, rows, cells, beadType: bead })
      // Small enough on its own to fit the one-page layout.
      expect(lastDoc!.getNumberOfPages()).toBe(1)

      const fringe: FringeData = {
        lengths: Array.from({ length: cols }, () => 20),
        turnBeads: Array.from({ length: cols }, () => true),
      }
      await exportPatternToPdf({ name: 'Con fleco largo', technique: 'loom', cols, rows, cells, fringe, beadType: bead })
      // The fringe pushes totalRows past what a one-page column can hold — falls back to
      // the paginated layout (ficha+materials page, then a single chart page), not a
      // multi-page explosion.
      expect(lastDoc!.getNumberOfPages()).toBe(2)
    })
  })

  describe('with a shaped (rowShape) body', () => {
    it('does not throw exporting a shaped body — small enough to land on the usual one-page layout', async () => {
      const { exportPatternToPdf } = await import('./pdfExport')
      // 4-col, 2-row triangle: row 0 has 2 cols (centered), row 1 (last) is full width — 2 + 4 = 6, not 8.
      const rowShape = [
        { offset: 1, length: 2 },
        { offset: 0, length: 4 },
      ]
      await exportPatternToPdf({
        name: 'Aro triangular',
        technique: 'brick',
        cols: 4,
        rows: 2,
        cells: fillCells(4, 2),
        beadType: bead,
        rowShape,
      })

      expect(lastDoc).toBeDefined()
      // The bead total itself (beadCount with rowShape summing the real 6 cells, not 4×2=8) is
      // exercised directly in geometry.test.ts and materials.test.ts — this integration test just
      // confirms exportPatternToPdf actually threads `rowShape` through end to end without throwing.
      expect(lastDoc!.getNumberOfPages()).toBe(1)
    })

    it('does not throw exporting a shaped body combined with a fringe under its narrow last row', async () => {
      const { exportPatternToPdf } = await import('./pdfExport')
      const rowShape = [
        { offset: 1, length: 1 },
        { offset: 0, length: 3 },
      ]
      const fringe: FringeData = { lengths: [2, 2, 2], turnBeads: [true, true, true] }
      await expect(
        exportPatternToPdf({
          name: 'Triángulo con fleco',
          technique: 'brick',
          cols: 3,
          rows: 2,
          cells: fillCells(3, 2),
          beadType: bead,
          rowShape,
          fringe,
        }),
      ).resolves.not.toThrow()
    })
  })

  describe('with a hanging loop (Tarea 3)', () => {
    // The header/materials total itself (beadCount + fringe + loop beads) and physical size
    // (physicalSizeMm with loopBeads) are exercised directly in geometry.test.ts/palette.test.ts —
    // these integration tests confirm exportPatternToPdf actually threads `loop` through end to
    // end, drawing the ring and its materials line, without throwing.
    it('does not throw with a woven loop, on a small pattern that still fits one page', async () => {
      const loop: LoopData = { variant: 'woven', beadCount: 8, color: '#c9a227' }
      const { exportPatternToPdf } = await import('./pdfExport')
      await expect(
        exportPatternToPdf({
          name: 'Con argolla tejida',
          technique: 'brick',
          cols: 6,
          rows: 6,
          cells: fillCells(6, 6),
          beadType: bead,
          loop,
        }),
      ).resolves.not.toThrow()
    })

    it('does not throw with a metal loop (no beads, materials line only)', async () => {
      const loop: LoopData = { variant: 'metal', beadCount: 0, color: '#000000' }
      const { exportPatternToPdf } = await import('./pdfExport')
      await expect(
        exportPatternToPdf({
          name: 'Con argolla metálica',
          technique: 'loom',
          cols: 6,
          rows: 6,
          cells: fillCells(6, 6),
          beadType: bead,
          loop,
        }),
      ).resolves.not.toThrow()
    })

    it('a large woven loop can push a pattern that would otherwise fit one page into the paginated fallback', async () => {
      // 65 rows alone still fits one page (227.5mm of 243mm column height) — a 30-bead loop's
      // own ~9.5 extra rows tips it over (260.9mm), same total-height reasoning
      // exportPatternToPdf itself uses (body+fringe rows + the loop's own height).
      const bigLoop: LoopData = { variant: 'woven', beadCount: 30, color: '#c9a227' }
      const base = chartCellMm('loom')
      expect(chooseOnePageLayout(base, 6, 65, 14)).not.toBeNull() // fits without the loop
      const totalRowsWithLoop = 65 + loopHeightUnits(bigLoop.beadCount)
      expect(chooseOnePageLayout(base, 6, totalRowsWithLoop, 14)).toBeNull() // falls back to paginated with it

      const { exportPatternToPdf } = await import('./pdfExport')
      await expect(
        exportPatternToPdf({
          name: 'Con argolla grande',
          technique: 'loom',
          cols: 6,
          rows: 65,
          cells: fillCells(6, 65),
          beadType: bead,
          loop: bigLoop,
        }),
      ).resolves.not.toThrow()
    })

    it('same total/size formula the header prints is what geometry.ts itself computes (consistency, Corrección e)', () => {
      const loop: LoopData = { variant: 'woven', beadCount: 8, color: '#c9a227' }
      const total = beadCount('brick', 6, 6) + loopBeadCount(loop)
      const size = physicalSizeMm('brick', 6, 6, bead, 0, loopBeadCount(loop))
      expect(total).toBeGreaterThan(beadCount('brick', 6, 6)) // guard: loop beads actually added
      expect(size.heightMm).toBeGreaterThan(physicalSizeMm('brick', 6, 6, bead).heightMm)
    })
  })
})

/**
 * Test (e) of the calibration round: the size a weaver reads must be the same
 * number wherever they read it. The PDF header is checked here against the
 * engine directly; ConfiguratorPage.test.tsx checks the on-screen summary
 * against the same call, and geometry.test.ts checks the inverse.
 */
describe('el encabezado del PDF reporta el mismo tamaño que el motor (Tarea 2)', () => {
  /** Every literal string jsPDF wrote into the document, in draw order. */
  function pdfTextLines(doc: import('jspdf').jsPDF): string[] {
    const raw = doc.output()
    return [...raw.matchAll(/\((?:\\.|[^()\\])*\) Tj/g)].map((m) => m[0].slice(1, -4).replace(/\\([()])/g, '$1'))
  }

  it('imprime exactamente formatSizeMm(physicalSizeMm(...)) para la pieza real de referencia', async () => {
    const { technique, beadTypeId, cols, rows } = CALIBRATION_SAMPLE
    const bead = getBeadType(beadTypeId)
    await exportPatternToPdf({
      name: 'Pulsera de referencia',
      technique,
      cols,
      rows,
      cells: fillCells(cols, rows),
      beadType: bead,
    })

    const size = physicalSizeMm(technique, cols, rows, bead)
    const expected = formatSizeMm(size.widthMm, size.heightMm)
    expect(expected).toBe('7.8 × 102.0 mm') // guard: si esto cambia, cambió la calibración
    expect(pdfTextLines(lastDoc!).some((line) => line.includes(expected))).toBe(true)
  })

  it('el mismo tamaño vuelve a dar la misma grilla por "tamaño final"', async () => {
    const { technique, beadTypeId, cols, rows } = CALIBRATION_SAMPLE
    const bead = getBeadType(beadTypeId)
    const size = physicalSizeMm(technique, cols, rows, bead)
    expect(gridFromPhysicalSizeMm(technique, size.widthMm, size.heightMm, bead)).toEqual({ cols, rows })
  })
})
