import type { ColorMap, FringeData, LoopData, PairData, PatternDoc, RowShape, Technique } from './types'
import { cellKey, parseCellKey } from './cellKey'
import { isPaintableCell, normalizeFringe } from './fringe'
import { normalizeRowShape } from './shape'
import { normalizeLoop } from './loop'
import { effectiveStaggerPhase } from './geometry'

/**
 * Everything needed to draw, weave, count or export one physical piece. The
 * left earring of a pair is the pattern as stored; the right one is derived
 * from it with `rightEarring`.
 */
export interface Piece {
  technique: Technique
  cols: number
  rows: number
  cells: ColorMap
  fringe?: FringeData
  rowShape?: RowShape[]
  staggerPhase: 0 | 1
  loop?: LoopData
}

/** A saved pattern as a piece — which, for a pair, is its left earring. */
export function leftPieceOf(doc: PatternDoc): Piece {
  return {
    technique: doc.config.technique,
    cols: doc.config.cols,
    rows: doc.config.rows,
    cells: doc.cells,
    fringe: normalizeFringe(doc.fringe, doc.config.cols),
    rowShape: normalizeRowShape(doc.rowShape, doc.config.cols, doc.config.rows),
    staggerPhase: effectiveStaggerPhase(doc.config),
    loop: normalizeLoop(doc.loop),
  }
}

/**
 * Techniques whose chart can hold an exact mirror image.
 *
 * Loom mirrors trivially. Brick does too, once the half-bead row offset is
 * flipped along with the columns (see `mirrorGeometry`). Peyote can't yet:
 * its vertical half-bead offset is tied to column parity with no phase to
 * flip, so the mirror of an even-width piece would come out with every
 * column shifted half a bead — close, but a pair of earrings is exactly
 * where "close" shows. Earrings with fringe are brick or loom anyway.
 */
export function isPairCapable(technique: Technique): boolean {
  return technique === 'loom' || technique === 'brick'
}

/**
 * The same piece reflected left-to-right, geometry only.
 *
 * Column `c` becomes `cols - 1 - c`. On brick that alone isn't a mirror:
 * a row pushed half a bead to the right would stay pushed right, when its
 * reflection is pushed LEFT — i.e. it lines up with the rows that weren't
 * offset. So the stagger phase flips too, which moves the half-bead offset
 * to the other set of rows. A shaped row's span is reflected
 * (`offset → cols - offset - length`), and the fringe hangs from the mirrored
 * columns, so its lengths and turn beads read in reverse. The loop is centred
 * on the top row, so it needs nothing.
 */
export function mirrorGeometry<T extends Omit<Piece, 'cells'>>(piece: T): T {
  const { technique, cols, fringe, rowShape, staggerPhase } = piece
  return {
    ...piece,
    staggerPhase: technique === 'brick' ? ((1 - staggerPhase) as 0 | 1) : staggerPhase,
    rowShape: rowShape?.map((r) => ({ offset: cols - r.offset - r.length, length: r.length })),
    fringe: fringe && { lengths: [...fringe.lengths].reverse(), turnBeads: [...fringe.turnBeads].reverse() },
  }
}

/** Reflects every painted cell — body and fringe alike — onto the mirrored columns. */
export function mirrorCells(cells: ColorMap, cols: number): ColorMap {
  const next: ColorMap = {}
  for (const [key, hex] of Object.entries(cells)) {
    if (!hex) continue
    const { row, col } = parseCellKey(key)
    next[cellKey(row, cols - 1 - col)] = hex
  }
  return next
}

/** The whole piece mirrored — geometry and colours. Applying it twice gives back the original. */
export function mirrorPiece(piece: Piece): Piece {
  return { ...mirrorGeometry(piece), cells: mirrorCells(piece.cells, piece.cols) }
}

/**
 * The right earring of a pair whose left earring is `left`.
 *
 * Its shape is always the left's, mirrored. Its colours are the left's
 * mirrored too, unless the pair was split to edit them separately — then
 * they're `rightCells`, keeping only the beads that still exist: if the left
 * earring's fringe got shorter since, the right's (mirrored) fringe did too,
 * and a bead left painted past its end must not reach the chart or the count.
 */
export function rightEarring(left: Piece, pair: PairData): Piece {
  const geometry = mirrorGeometry(left)
  if (pair.mode === 'mirror') return { ...geometry, cells: mirrorCells(left.cells, left.cols) }
  return { ...geometry, cells: pruneToPiece(pair.rightCells, geometry) }
}

/** The pieces a pattern produces: one, or a left and a right earring. */
export function piecesOf(left: Piece, pair: PairData | undefined): Piece[] {
  return pair ? [left, rightEarring(left, pair)] : [left]
}

/**
 * What a split pair starts from: the right earring exactly as the mirror
 * showed it a moment ago, now as colours of its own. Splitting changes who
 * owns the colours, not what's on screen.
 */
export function splitPair(left: Piece): PairData {
  return { mode: 'independent', rightCells: mirrorCells(left.cells, left.cols) }
}

/** Drops painted cells that fall outside the piece's own body and fringe. */
export function pruneToPiece(cells: ColorMap, piece: Omit<Piece, 'cells'>): ColorMap {
  const next: ColorMap = {}
  for (const [key, hex] of Object.entries(cells)) {
    if (!hex) continue
    const { row, col } = parseCellKey(key)
    if (isPaintableCell(row, col, piece.cols, piece.rows, piece.fringe, piece.rowShape)) next[key] = hex
  }
  return next
}
