import { describe, expect, it } from 'vitest'
import { NUBIH_TEMPLATES } from './nubihTemplates'
import { isPaintableCell, normalizeFringe } from '@/engine/fringe'
import { normalizeRowShape } from '@/engine/shape'
import { parseCellKey } from '@/engine/cellKey'
import { getBeadType } from './beadTypes'
import { patternFromTemplate } from '@/engine/template'

describe('Plantillas Nubih — las que vienen con la app', () => {
  it('trae Flower Ring y Pulsera Azur', () => {
    expect(NUBIH_TEMPLATES.map((tpl) => tpl.name)).toEqual(['Flower Ring 39 x 10', 'Pulsera Azur'])
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
