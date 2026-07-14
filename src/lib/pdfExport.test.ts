import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getBeadType } from '@/data/beadTypes'
import type { ColorMap } from '@/engine/types'

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

  it('splits a large pattern into many more pages than a small one (chart sections + word chart)', async () => {
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
})
