import { describe, expect, it } from 'vitest'
import { BEAD_TYPES, getBeadType } from '@/data/beadTypes'
import type { Technique } from './types'
import {
  CALIBRATION_SAMPLE,
  TRIANGLE_CALIBRATION_SAMPLE,
  calibrationKeys,
  isCalibrated,
  THEORETICAL_FACTOR,
  weaveCalibration,
  weaveThreadFactor,
} from './calibration'
import { physicalSizeMm } from './geometry'

const TECHNIQUES: Technique[] = ['loom', 'peyote', 'brick', 'triangle']

describe('tabla de calibración — cobertura y honestidad', () => {
  it('cubre las tres técnicas por cada tipo de mostacilla del catálogo', () => {
    // Si esto falla al agregar una mostacilla nueva, es a propósito: hay que
    // darle su propia fila en la tabla en vez de dejarla heredar otro factor.
    const missing: string[] = []
    for (const bead of BEAD_TYPES) {
      for (const technique of TECHNIQUES) {
        if (!calibrationKeys().includes(`${technique}:${bead.id}`)) missing.push(`${technique}:${bead.id}`)
      }
    }
    expect(missing).toEqual([])
  })

  it('no hay filas de sobra apuntando a mostacillas que ya no existen', () => {
    const known = new Set(BEAD_TYPES.map((b) => b.id))
    const orphans = calibrationKeys().filter((k) => !known.has(k.split(':')[1]))
    expect(orphans).toEqual([])
  })

  it('ninguna combinación sin medir inventa un factor: son exactamente 1', () => {
    for (const bead of BEAD_TYPES) {
      for (const technique of TECHNIQUES) {
        const entry = weaveCalibration(technique, bead.id)
        if (entry.source === 'theoretical') {
          expect(entry.factor, `${technique}:${bead.id}`).toBe(THEORETICAL_FACTOR)
        }
      }
    }
  })

  it('toda fila lleva una nota que dice de dónde sale (o qué falta medir)', () => {
    for (const key of calibrationKeys()) {
      const [technique, beadTypeId] = key.split(':')
      expect(weaveCalibration(technique as Technique, beadTypeId).note.length, key).toBeGreaterThan(10)
    }
  })

  it('las calibradas contra pieza real son exactamente las dos muestras que hay', () => {
    const calibrated = calibrationKeys().filter((k) => {
      const [technique, beadTypeId] = k.split(':')
      return isCalibrated(technique as Technique, beadTypeId)
    })
    expect(new Set(calibrated)).toEqual(
      new Set([
        `${CALIBRATION_SAMPLE.technique}:${CALIBRATION_SAMPLE.beadTypeId}`,
        `${TRIANGLE_CALIBRATION_SAMPLE.technique}:${TRIANGLE_CALIBRATION_SAMPLE.beadTypeId}`,
      ]),
    )
  })
})

describe('la muestra del peyote triangular', () => {
  it('el factor sale de la medida, no de un número elegido a mano', () => {
    const { measuredWidthMm, widthUnits, technique, beadTypeId } = TRIANGLE_CALIBRATION_SAMPLE
    expect(weaveThreadFactor(technique, beadTypeId)).toBeCloseTo(measuredWidthMm / (widthUnits * 1.3), 10)
  })

  it('el aro de la muestra sale con la medida que tiene de verdad, al décimo de milímetro', () => {
    const { rounds, measuredWidthMm } = TRIANGLE_CALIBRATION_SAMPLE
    const { widthMm } = physicalSizeMm('triangle', rounds, rounds, getBeadType('miyuki-delica-11'))
    expect(widthMm).toBeCloseTo(measuredWidthMm, 1)
  })

  it('el ancho crece parejo con las vueltas: el doble de vueltas, casi el doble de pieza', () => {
    const bead = getBeadType('miyuki-delica-11')
    const once = physicalSizeMm('triangle', 11, 11, bead).widthMm
    const veintidos = physicalSizeMm('triangle', 22, 22, bead).widthMm
    expect(veintidos / once).toBeGreaterThan(1.9)
    expect(veintidos / once).toBeLessThan(2.1)
  })
})

describe('weaveThreadFactor', () => {
  it('la muestra medida devuelve 102/96, no un número redondo inventado', () => {
    expect(weaveThreadFactor(CALIBRATION_SAMPLE.technique, CALIBRATION_SAMPLE.beadTypeId)).toBeCloseTo(102 / 96, 10)
  })

  it('una mostacilla desconocida cae en el teórico en vez de reventar', () => {
    expect(weaveThreadFactor('peyote', 'no-existe')).toBe(THEORETICAL_FACTOR)
  })

  it('el factor no se comparte entre tipos de mostacilla — misma técnica, distinta mostacilla, distinto trato', () => {
    expect(weaveThreadFactor('peyote', 'miyuki-delica-11')).not.toBe(weaveThreadFactor('peyote', 'rocalla-11'))
  })
})

describe('efecto en el tamaño reportado', () => {
  it('una combinación sin calibrar reporta geometría desnuda, sin corrección oculta', () => {
    const rocalla = getBeadType('rocalla-11')
    // Peyote: el ancho usa el lado corto y el alto el diámetro (BEAD_AXIS_MAP).
    const size = physicalSizeMm('peyote', 10, 20, rocalla)
    expect(size.widthMm).toBeCloseTo(10 * rocalla.heightMm, 10)
    expect(size.heightMm).toBeCloseTo(20 * rocalla.widthMm, 10)
  })

  it('la combinación calibrada sí lleva la corrección medida', () => {
    const delica = getBeadType('miyuki-delica-11')
    const size = physicalSizeMm('peyote', 6, 60, delica)
    expect(size.heightMm).toBeCloseTo(CALIBRATION_SAMPLE.measuredHeightMm, 6)
    expect(size.heightMm).toBeGreaterThan(60 * delica.widthMm) // estrictamente por encima del teórico
  })
})
