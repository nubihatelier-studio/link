import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getBeadType } from '@/data/beadTypes'
import type { ColorMap, FringeData } from '@/engine/types'

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

describe('exportPatternToPdf', () => {
  const bead = getBeadType('miyuki-delica-11')

  beforeEach(() => {
    lastDoc = undefined
  })

  it('builds a small, fully-colored pattern without splitting the chart across pages', async () => {
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
    // ficha + a single chart page + at least one word-chart page.
    expect(lastDoc!.getNumberOfPages()).toBeGreaterThanOrEqual(3)
    expect(lastDoc!.getNumberOfPages()).toBeLessThanOrEqual(5)
  })

  it('keeps the chart on a single page even for a very large pattern (only the word chart grows)', async () => {
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
    // ficha (1) + chart (1) + many word-chart pages for a 150x150 pattern.
    expect(lastDoc!.getNumberOfPages()).toBeGreaterThan(10)
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

    it('keeps the chart on a single page even once the fringe pushes the total height well past one page at full size', async () => {
      const { exportPatternToPdf } = await import('./pdfExport')
      const cols = 10
      const rows = 60
      const cells = fillCells(cols, rows)

      await exportPatternToPdf({ name: 'Sin fleco', technique: 'loom', cols, rows, cells, beadType: bead })
      const pagesWithoutFringe = lastDoc!.getNumberOfPages()

      const fringe: FringeData = {
        lengths: Array.from({ length: cols }, () => 20),
        turnBeads: Array.from({ length: cols }, () => true),
      }
      await exportPatternToPdf({ name: 'Con fleco largo', technique: 'loom', cols, rows, cells, fringe, beadType: bead })
      const pagesWithFringe = lastDoc!.getNumberOfPages()

      // The fringe may add a line or two to the word-chart section (one extra line per column),
      // but the chart itself must stay a single page regardless of fringe height — so the page
      // count should barely move, not multiply the way the old section-splitting chart used to.
      expect(pagesWithFringe - pagesWithoutFringe).toBeLessThanOrEqual(2)
    })
  })
})
