import { describe, expect, it } from 'vitest'
import { NUBIH_TEMPLATES } from './nubihTemplates'
import { isPaintableCell, normalizeFringe } from '@/engine/fringe'
import { normalizeRowShape } from '@/engine/shape'
import { parseCellKey } from '@/engine/cellKey'
import { getBeadType } from './beadTypes'
import { patternFromTemplate } from '@/engine/template'

describe('Plantillas Nubih — las que vienen con la app', () => {
  it('trae las 15 plantillas de Nubih, en su orden', () => {
    expect(NUBIH_TEMPLATES.map((tpl) => tpl.name)).toEqual([
      'Flower Ring 39 x 10',
      'Pulsera Azur',
      'Aro',
      'Arito',
      'Tubitocollar',
      'Big Flowers',
      'Halloween',
      'Triángulos',
      'Zigzag',
      'Trenza',
      'Pentágonos',
      'Leopardo',
      '3 Estrellas',
      'Flechas',
      'Franja dorada',
    ])
  })

  it('cada una dice su dificultad, y las que tienen tipo usan uno de la lista', () => {
    const kinds = ['pulsera', 'aro', 'anillo', 'collar', 'tobillera', 'llavero', 'otro']
    for (const tpl of NUBIH_TEMPLATES) {
      expect(['facil', 'intermedio', 'avanzado']).toContain(tpl.difficulty)
      if (tpl.kind) expect(kinds).toContain(tpl.kind)
    }
  })

  it('no lleva notas personales del respaldo', () => {
    for (const tpl of NUBIH_TEMPLATES) expect(tpl.note).toBeUndefined()
  })

  it.each(NUBIH_TEMPLATES.map((tpl) => [tpl.name, tpl] as const))('%s está bien armada: plantilla, ids estables y cada mostacilla dentro de la pieza', (_name, tpl) => {
    expect(tpl.isTemplate).toBe(true)
    expect(tpl.id).toMatch(/^nubih_/)
    expect(tpl.letters).toBeUndefined()
    expect(getBeadType(tpl.config.beadTypeId).id).toBe(tpl.config.beadTypeId)
    const { cols, rows } = tpl.config
    const fringe = normalizeFringe(tpl.fringe, cols)
    const rowShape = normalizeRowShape(tpl.rowShape, cols, rows)
    const keys = Object.keys(tpl.cells)
    expect(keys.length).toBeGreaterThan(0)
    for (const key of keys) {
      const { row, col } = parseCellKey(key)
      expect(isPaintableCell(row, col, cols, rows, fringe, rowShape)).toBe(true)
    }
  })

  it('los ids no se repiten', () => {
    expect(new Set(NUBIH_TEMPLATES.map((tpl) => tpl.id)).size).toBe(NUBIH_TEMPLATES.length)
  })

  it('un patrón creado desde una plantilla Nubih ya no es plantilla', () => {
    const doc = patternFromTemplate(NUBIH_TEMPLATES[0], 'full', 'p_x', 'Flower Ring', 1)
    expect(doc.isTemplate).toBeUndefined()
    expect(Object.keys(doc.cells)).toHaveLength(Object.keys(NUBIH_TEMPLATES[0].cells).length)
  })
})
