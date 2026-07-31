import { describe, expect, it } from 'vitest'
import { BEAD_TYPES, getBeadType } from '@/data/beadTypes'
import type { Technique } from './types'
import {
  CALIBRATION_SAMPLE,
  calibrationKeys,
  isCalibrated,
  THEORETICAL_FACTOR,
  weaveCalibration,
  weaveThreadFactor,
} from './calibration'
import { physicalSizeMm } from './geometry'

const TECHNIQUES: Technique[] = ['loom', 'peyote', 'brick']

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

  it('hoy la única combinación calibrada contra pieza real es la de la muestra', () => {
    const calibrated = calibrationKeys().filter((k) => {
      const [technique, beadTypeId] = k.split(':')
      return isCalibrated(technique as Technique, beadTypeId)
    })
    expect(calibrated).toEqual([`${CALIBRATION_SAMPLE.technique}:${CALIBRATION_SAMPLE.beadTypeId}`])
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
