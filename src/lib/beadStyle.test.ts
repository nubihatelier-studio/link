import { describe, expect, it } from 'vitest'
import { rowPitch } from '@/engine/geometry'
import {
  BEAD_CORNER_RATIO,
  BEAD_GAP_RATIO,
  beadMetrics,
  beadMetricsPx,
  MIN_BEAD_INSET_PX,
  MIN_BEAD_RADIUS_PX,
} from './beadStyle'
import { chartCellMm } from './pdfExport'

describe('beadMetrics', () => {
  it('deja separación en los dos ejes, no sólo entre columnas', () => {
    const { inset, width, height } = beadMetrics(10, 10)
    expect(inset).toBeGreaterThan(0)
    expect(width).toBeLessThan(10)
    expect(height).toBeLessThan(10) // el que faltaba en el PDF
  })

  it('la esquina se redondea en proporción al tamaño de la mostacilla', () => {
    expect(beadMetrics(10, 10).radius).toBeCloseTo(10 * BEAD_CORNER_RATIO, 10)
    expect(beadMetrics(40, 40).radius).toBeCloseTo(40 * BEAD_CORNER_RATIO, 10)
  })

  it('en una celda no cuadrada el hueco es parejo, no se estira con el lado largo', () => {
    const square = beadMetrics(10, 10)
    const tall = beadMetrics(10, 30)
    expect(tall.inset).toBeCloseTo(square.inset, 10)
    expect(tall.radius).toBeCloseTo(square.radius, 10)
  })

  it('nunca produce una mostacilla de tamaño negativo', () => {
    const tiny = beadMetrics(0.01, 0.01, 5, 5)
    expect(tiny.width).toBeGreaterThanOrEqual(0)
    expect(tiny.height).toBeGreaterThanOrEqual(0)
  })

  it('en pantalla respeta los mínimos en px, para que una mostacilla siga leyéndose al alejar', () => {
    const zoomedOut = beadMetricsPx(4)
    expect(zoomedOut.inset).toBe(MIN_BEAD_INSET_PX)
    expect(zoomedOut.radius).toBe(MIN_BEAD_RADIUS_PX)
    // Con celdas grandes mandan las proporciones, no los mínimos.
    expect(beadMetricsPx(60).inset).toBeCloseTo(60 * BEAD_GAP_RATIO, 10)
  })
})

describe('el gráfico del PDF usa el mismo estilo que el editor', () => {
  it.each(['loom', 'peyote', 'brick'] as const)(
    'en %s las mostacillas no se tocan verticalmente: la altura dibujada cabe en el paso entre filas',
    (technique) => {
      const cell = chartCellMm(technique)
      const rowStep = rowPitch(technique) * cell.h
      const bead = beadMetrics(cell.w, rowStep)

      // Éste es el defecto reportado: con la altura nominal de celda, peyote y
      // brick se encimaban y cada columna se leía como una barra continua.
      expect(cell.h).toBeGreaterThanOrEqual(rowStep)
      expect(bead.height).toBeLessThan(rowStep)
      expect(bead.width).toBeLessThan(cell.w)
      expect(bead.inset).toBeGreaterThan(0)
      expect(bead.radius).toBeGreaterThan(0)
    },
  )

  it('el hueco entre dos mostacillas contiguas es el doble del inset, en ambos ejes', () => {
    const cell = chartCellMm('loom')
    const rowStep = rowPitch('loom') * cell.h
    const bead = beadMetrics(cell.w, rowStep)
    expect(cell.w - bead.width).toBeCloseTo(bead.inset * 2, 10)
    expect(rowStep - bead.height).toBeCloseTo(bead.inset * 2, 10)
  })
})
