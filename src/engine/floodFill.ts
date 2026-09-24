import { cellKey } from './cellKey'
import { triangleNeighbourMap } from './trianglePeyote'
import { isPaintableCell } from './fringe'
import type { ColorMap, FringeData, RowShape } from './types'

/**
 * Classic 4-connected flood fill over the row/col grid — deliberately grid
 * topology, not the technique's visual stagger/offset (peyote/brick shift
 * cells sideways on screen but stay adjacent in row/col terms, which is what
 * "the same contiguous blob of color" means here). Matches by exact color
 * (including "empty", so an uncolored region can be flood-filled too).
 *
 * When `fringe` is given, the fill can spread into (and between, at the same
 * depth) each column's current fringe — still gated by `isPaintableCell`, so
 * it never touches a depth beyond a column's actual fringe length.
 */
export function floodFillCells(
  cells: ColorMap,
  cols: number,
  rows: number,
  startRow: number,
  startCol: number,
  newHex: string | null,
  fringe?: FringeData,
  rowShape?: RowShape[],
): ColorMap {
  if (!isPaintableCell(startRow, startCol, cols, rows, fringe, rowShape)) return cells

  const targetHex = cells[cellKey(startRow, startCol)] ?? null
  if (targetHex === newHex) return cells

  const next = { ...cells }
  const visited = new Set<string>()
  const stack: [number, number][] = [[startRow, startCol]]

  while (stack.length > 0) {
    const [row, col] = stack.pop()!
    if (!isPaintableCell(row, col, cols, rows, fringe, rowShape)) continue
    const key = cellKey(row, col)
    if (visited.has(key)) continue
    visited.add(key)
    if ((cells[key] ?? null) !== targetHex) continue

    if (newHex) next[key] = newHex
    else delete next[key]

    stack.push([row - 1, col], [row + 1, col], [row, col - 1], [row, col + 1])
  }

  return next
}

/**
 * El balde de pintura del aro triangular, que no tiene filas ni columnas: se
 * riega por las mostacillas que de verdad se tocan
 * (`trianglePeyote.ts#triangleNeighbourMap`), incluidas las de las costuras,
 * así que de un toque se pinta la pieza entera y no sólo un sub-triángulo.
 *
 * Como en la grilla, "vacío" también es un color: se puede rellenar lo que
 * todavía no está pintado.
 */
export function floodFillTriangleCells(
  cells: ColorMap,
  rounds: number,
  startKey: string,
  newHex: string | null,
): ColorMap {
  const vecinas = triangleNeighbourMap(rounds)
  if (!vecinas.has(startKey)) return cells

  const targetHex = cells[startKey] ?? null
  if (targetHex === newHex) return cells

  const next = { ...cells }
  const visitadas = new Set<string>()
  const pila = [startKey]

  while (pila.length > 0) {
    const key = pila.pop()!
    if (visitadas.has(key)) continue
    visitadas.add(key)
    if ((cells[key] ?? null) !== targetHex) continue

    if (newHex) next[key] = newHex
    else delete next[key]

    for (const vecina of vecinas.get(key) ?? []) pila.push(vecina)
  }

  return next
}
