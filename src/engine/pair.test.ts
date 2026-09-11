import { describe, expect, it } from 'vitest'
import type { ColorMap } from './types'
import { cellPosition, gridBoundsUnits, loopAnchorX } from './geometry'
import { isPaintableCell, maxFringeLength } from './fringe'
import { createShapedRowShape } from './shape'
import { cellKey, parseCellKey } from './cellKey'
import { isPairCapable, mirrorPiece, piecesOf, pruneToPiece, rightEarring, splitPair, type Piece } from './pair'

/** El aro de la plantilla, con una cascada DIAGONAL: no simétrico, justo el caso del par. */
function diagonalAro(staggerPhase: 0 | 1 = 0): Piece {
  const cols = 7
  const rows = 7
  const rowShape = createShapedRowShape('triangle', cols, rows)
  const fringe = { lengths: [2, 3, 4, 5, 6, 7, 8], turnBeads: [true, true, true, true, true, true, true] }
  const cells: ColorMap = {}
  for (let r = 0; r < rows + 8; r++) {
    for (let c = 0; c < cols; c++) {
      if (!isPaintableCell(r, c, cols, rows, fringe, rowShape)) continue
      cells[cellKey(r, c)] = c < 2 ? '#1c1c1e' : c < 5 ? '#c9a227' : '#8da2b0' // motivo corrido a la izquierda
    }
  }
  return { technique: 'brick', cols, rows, cells, fringe, rowShape, staggerPhase }
}

/**
 * La prueba de fondo: el aro derecho tiene que ser el reflejo GEOMÉTRICO del
 * izquierdo, mostacilla por mostacilla, tal como se dibuja. Para cada
 * mostacilla pintada del izquierdo, su pareja en el derecho está a la misma
 * altura, a la misma distancia del borde opuesto, y es del mismo color.
 */
function expectExactMirror(left: Piece, right: Piece) {
  const width = gridBoundsUnits(left.technique, left.cols, left.rows, maxFringeLength(left.fringe)).width
  const drawn = (p: Piece) =>
    Object.entries(p.cells).map(([key, hex]) => {
      const { row, col } = parseCellKey(key)
      const pos = cellPosition(p.technique, row, col, p.rows, p.staggerPhase)
      return { x: pos.x, y: pos.y, hex, row, col }
    })

  const rightByPosition = new Map(drawn(right).map((b) => [`${b.x.toFixed(4)},${b.y.toFixed(4)}`, b]))
  const leftBeads = drawn(left)
  expect(leftBeads.length).toBeGreaterThan(0)
  expect(Object.keys(right.cells)).toHaveLength(leftBeads.length)

  for (const bead of leftBeads) {
    // Una mostacilla ocupa [x, x + 1]: su reflejo empieza en ancho - 1 - x.
    const mirroredX = width - 1 - bead.x
    const twin = rightByPosition.get(`${mirroredX.toFixed(4)},${bead.y.toFixed(4)}`)
    expect(twin, `falta el reflejo de la mostacilla (${bead.row},${bead.col})`).toBeDefined()
    expect(twin!.hex).toBe(bead.hex)
    // Y existe en el aro derecho: está dentro de su cuerpo o de su fleco.
    expect(isPaintableCell(twin!.row, twin!.col, right.cols, right.rows, right.fringe, right.rowShape)).toBe(true)
  }
}

describe('isPairCapable', () => {
  it('loom y brick pueden hacer el par; peyote todavía no', () => {
    expect(isPairCapable('loom')).toBe(true)
    expect(isPairCapable('brick')).toBe(true)
    expect(isPairCapable('peyote')).toBe(false)
  })
})

describe('mirrorPiece — reflejo exacto, mostacilla por mostacilla', () => {
  it.each([0, 1] as const)('un aro brick con cascada diagonal (fase %s) se refleja exacto', (phase) => {
    const left = diagonalAro(phase)
    expectExactMirror(left, mirrorPiece(left))
  })

  it('brick: el escalonado se da vuelta — si no, las filas corridas quedarían corridas hacia el lado equivocado', () => {
    expect(mirrorPiece(diagonalAro(0)).staggerPhase).toBe(1)
    expect(mirrorPiece(diagonalAro(1)).staggerPhase).toBe(0)
  })

  it('loom se refleja exacto y no tiene escalonado que dar vuelta', () => {
    const cells: ColorMap = { '0,0': '#111111', '1,0': '#111111', '1,1': '#222222', '4,0': '#333333' }
    const left: Piece = {
      technique: 'loom', cols: 3, rows: 3, cells, staggerPhase: 0,
      fringe: { lengths: [2, 0, 0], turnBeads: [true, false, false] },
    }
    const right = mirrorPiece(left)
    expect(right.staggerPhase).toBe(0)
    expectExactMirror(left, right)
  })

  it('la forma del cuerpo y los flecos quedan del otro lado', () => {
    const left: Piece = {
      technique: 'brick', cols: 5, rows: 2, cells: {}, staggerPhase: 0,
      rowShape: [{ offset: 0, length: 2 }, { offset: 0, length: 5 }],
      fringe: { lengths: [1, 2, 3, 4, 5], turnBeads: [false, false, false, false, true] },
    }
    const right = mirrorPiece(left)
    expect(right.rowShape).toEqual([{ offset: 3, length: 2 }, { offset: 0, length: 5 }])
    expect(right.fringe).toEqual({ lengths: [5, 4, 3, 2, 1], turnBeads: [true, false, false, false, false] })
  })

  it('la argolla sigue centrada en la punta del aro reflejado', () => {
    const left = diagonalAro(0)
    const right = mirrorPiece(left)
    const width = gridBoundsUnits('brick', left.cols, left.rows, maxFringeLength(left.fringe)).width
    expect(loopAnchorX('brick', right.cols, right.rowShape, right.staggerPhase)).toBeCloseTo(
      width - loopAnchorX('brick', left.cols, left.rowShape, left.staggerPhase),
      10,
    )
  })

  it('reflejar dos veces devuelve el aro original', () => {
    const left = diagonalAro(1)
    expect(mirrorPiece(mirrorPiece(left))).toEqual(left)
  })

  it('un diseño simétrico da dos aros iguales, que es lo que corresponde', () => {
    const symmetric: Piece = {
      technique: 'loom', cols: 3, rows: 1, staggerPhase: 0,
      cells: { '0,0': '#111111', '0,1': '#222222', '0,2': '#111111' },
    }
    expect(mirrorPiece(symmetric).cells).toEqual(symmetric.cells)
  })
})

describe('rightEarring', () => {
  it('en modo espejo, el derecho es el reflejo vivo del izquierdo', () => {
    const left = diagonalAro()
    expect(rightEarring(left, { mode: 'mirror' })).toEqual(mirrorPiece(left))
  })

  it('al separar el par, el derecho arranca siendo exactamente lo que se veía', () => {
    const left = diagonalAro()
    expect(rightEarring(left, splitPair(left))).toEqual(mirrorPiece(left))
  })

  it('separado, el derecho tiene sus propios colores (unas iniciales, por ejemplo)', () => {
    const left = diagonalAro()
    const pair = splitPair(left)
    if (pair.mode !== 'independent') throw new Error('esperaba un par separado')
    const firstKey = Object.keys(pair.rightCells)[0]
    const repainted = { mode: 'independent' as const, rightCells: { ...pair.rightCells, [firstKey]: '#ff0000' } }

    expect(rightEarring(left, repainted).cells[firstKey]).toBe('#ff0000')
    // El izquierdo no se toca.
    expect(Object.values(left.cells)).not.toContain('#ff0000')
  })

  it('separado, la forma sigue al izquierdo: si su fleco se acorta, las mostacillas sobrantes del derecho no cuentan', () => {
    const left = diagonalAro()
    const pair = splitPair(left)
    const shorter: Piece = {
      ...left,
      fringe: { lengths: left.fringe!.lengths.map(() => 1), turnBeads: left.fringe!.turnBeads },
    }
    const right = rightEarring(shorter, pair)
    for (const key of Object.keys(right.cells)) {
      const { row, col } = parseCellKey(key)
      expect(isPaintableCell(row, col, right.cols, right.rows, right.fringe, right.rowShape)).toBe(true)
    }
  })
})

describe('piecesOf y pruneToPiece', () => {
  it('un patrón sin par es una sola pieza; con par, izquierdo y derecho', () => {
    const left = diagonalAro()
    expect(piecesOf(left, undefined)).toHaveLength(1)
    expect(piecesOf(left, { mode: 'mirror' })).toHaveLength(2)
  })

  it('pruneToPiece conserva lo que existe y descarta lo que quedó fuera', () => {
    const piece = { technique: 'loom' as const, cols: 2, rows: 1, staggerPhase: 0 as const }
    expect(pruneToPiece({ '0,0': '#111111', '0,5': '#222222', '3,0': '#333333' }, piece)).toEqual({ '0,0': '#111111' })
  })
})
