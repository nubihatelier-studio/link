import { describe, expect, it } from 'vitest'
import { createRectangleRowShape } from '@/engine/shape'
import { siluetaCells, SILUETA } from './PiecePreview'

describe('Vista previa en "Crear patrón" — la silueta de la pieza', () => {
  it('una pieza recta son todas sus mostacillas', () => {
    const cells = siluetaCells(3, 2)
    expect(Object.keys(cells).sort()).toEqual(['0,0', '0,1', '0,2', '1,0', '1,1', '1,2'])
    expect(new Set(Object.values(cells))).toEqual(new Set([SILUETA]))
  })

  it('una forma recortada no dibuja las mostacillas que la pieza no tiene', () => {
    // Fila de arriba de 1 mostacilla al medio, fila de abajo completa: un triángulo.
    const cells = siluetaCells(3, 2, undefined, [
      { offset: 1, length: 1 },
      { offset: 0, length: 3 },
    ])
    expect(Object.keys(cells).sort()).toEqual(['0,1', '1,0', '1,1', '1,2'])
  })

  it('los flecos cuelgan de la última fila, cada uno bajo su columna', () => {
    const cells = siluetaCells(2, 1, { lengths: [2, 0], turnBeads: [true, false] }, createRectangleRowShape(2, 1))
    // El cuerpo, más dos mostacillas colgando de la columna 0 y ninguna de la 1.
    expect(Object.keys(cells).sort()).toEqual(['0,0', '0,1', '1,0', '2,0'])
  })
})
