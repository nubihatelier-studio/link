import { describe, expect, it } from 'vitest'
import type { PatternDoc } from './types'
import { patternFromTemplate, templateFromPattern, templateNamed, uniqueName } from './template'

const FLOWER: PatternDoc = {
  id: 'p_flower',
  name: 'Flower Ring',
  config: { technique: 'brick', cols: 7, rows: 7, beadTypeId: 'miyuki-delica-11' },
  cells: { '0,0': '#e58fb0', '3,3': '#c9a227' },
  fringe: { lengths: [1, 2, 3, 4, 3, 2, 1], turnBeads: [true, true, true, true, true, true, true] },
  rowShape: [{ offset: 3, length: 1 }] as never,
  loop: { variant: 'woven', color: '#c9a227', beads: 8 } as never,
  pair: { mode: 'independent', rightCells: { '0,0': '#2f5b66' } },
  note: 'Para Belle',
  letters: { '#e58fb0': 'A', '#c9a227': 'B' },
  palette: ['#e58fb0', '#c9a227', null, null, null, null],
  createdAt: 1,
  updatedAt: 2,
}

describe('plantillas', () => {
  it('guardar como plantilla copia el patrón tal cual, marcado como plantilla', () => {
    const tpl = templateFromPattern(FLOWER, 'Flower Ring', 't_1', 100)
    expect(tpl).toEqual({ ...FLOWER, id: 't_1', isTemplate: true, createdAt: 100, updatedAt: 100 })
  })

  it('"Con colores y dibujo" crea un patrón igual al guardado: dibujo, bandeja, letras, forma, flecos, argolla, par y nota', () => {
    const tpl = templateFromPattern(FLOWER, 'Flower Ring', 't_1', 100)
    const doc = patternFromTemplate(tpl, 'full', 'p_nuevo', 'Flower Ring 2', 200)
    expect(doc).toEqual({ ...FLOWER, id: 'p_nuevo', name: 'Flower Ring 2', createdAt: 200, updatedAt: 200 })
    expect(doc.isTemplate).toBeUndefined()
  })

  it('"Solo la forma" conserva la silueta y deja la bandeja vacía y nada pintado', () => {
    const tpl = templateFromPattern(FLOWER, 'Flower Ring', 't_1', 100)
    const doc = patternFromTemplate(tpl, 'shape', 'p_nuevo', 'Flower Ring', 200)
    expect(doc.cells).toEqual({})
    expect(doc.palette).toBeUndefined()
    expect(doc.letters).toBeUndefined()
    expect(doc.note).toBeUndefined()
    expect(doc.pair).toEqual({ mode: 'independent', rightCells: {} })
    expect(doc.config).toEqual(FLOWER.config)
    expect(doc.fringe).toEqual(FLOWER.fringe)
    expect(doc.rowShape).toEqual(FLOWER.rowShape)
    expect(doc.loop).toEqual(FLOWER.loop)
    expect(doc.isTemplate).toBeUndefined()
  })

  it('el patrón nuevo es una copia: cambiarlo no toca la plantilla', () => {
    const tpl = templateFromPattern(FLOWER, 'Flower Ring', 't_1', 100)
    const doc = patternFromTemplate(tpl, 'full', 'p_nuevo', 'Flower Ring', 200)
    doc.cells = { ...doc.cells, '6,6': '#000000' }
    expect(tpl.cells).toEqual(FLOWER.cells)
  })

  it('el nombre del patrón nuevo no repite uno que ya está en la biblioteca', () => {
    expect(uniqueName('Flower Ring', ['Pulsera'])).toBe('Flower Ring')
    expect(uniqueName('Flower Ring', ['flower ring ', 'Flower Ring 2'])).toBe('Flower Ring 3')
  })

  it('reconoce una plantilla con el mismo nombre sin importar mayúsculas ni espacios', () => {
    const tpl = templateFromPattern(FLOWER, 'Flower Ring', 't_1', 100)
    expect(templateNamed([tpl], '  flower ring')).toBe(tpl)
    expect(templateNamed([tpl], 'Flower')).toBeUndefined()
  })
})
