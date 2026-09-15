import type { ColorMap, FringeData, LoopData, RowShape, Technique } from './types'
import { cellKey } from './cellKey'
import { buildWeaveOrder } from './weaveOrder'
import { loopBeadCount } from './loop'
import type { StaggerPhase } from './geometry'

/**
 * Letter code for the `i`-th used color (0-based), in bijective base-26:
 * A–Z for the first 26, then AA, AB, … AZ, BA, … from the 27th on.
 *
 * The two-character form is reachable ONLY from color 27 — with 26 or fewer
 * used colors every label is a single letter, always. (A palette showing
 * "AA" next to three or four colors used to be the visible symptom of the
 * old letter bookkeeping, which handed out codes on every color the picker
 * ever touched instead of on the colors actually painted; see
 * `assignLetters`.) Past 26 the sequence keeps going rather than running out
 * or repeating — a chart that big is barely readable, but a duplicate label
 * would make it *wrong*, which is worse.
 */
export function letterForIndex(i: number): string {
  let n = i
  let s = ''
  do {
    s = String.fromCharCode(65 + (n % 26)) + s
    n = Math.floor(n / 26) - 1
  } while (n >= 0)
  return s
}

/**
 * Which letter each colour holds, saved with the pattern. Without it letters
 * are re-derived on every edit, so erasing the colour that happened to be
 * woven first renamed every other colour — the weaver's "A" stopped being "A"
 * halfway through a piece, and the printed materials list stopped matching the
 * chart on screen.
 */
export type LetterAssignment = Record<string, string>

/** The index a letter stands for — the inverse of `letterForIndex`. */
export function letterIndex(letter: string): number {
  let n = 0
  for (const ch of letter) n = n * 26 + (ch.charCodeAt(0) - 64)
  return n - 1
}

/** A color that is actually painted somewhere in the pattern, with the label and bead count it earned. */
export interface LetterEntry {
  hex: string
  /** A, B, C… by order of first use — see `assignLetters`. */
  letter: string
  /** Beads of this color in the finished piece: body + fringe cells, plus a woven loop's ring if it uses this color. */
  count: number
}

/** Everything the letter assignment needs to walk a pattern in weaving order. */
export interface LetterPattern {
  technique: Technique
  cols: number
  rows: number
  cells: ColorMap
  fringe?: FringeData
  rowShape?: RowShape[]
  loop?: LoopData
  /** Brick 2-drop and 3-drop weave stitch by stitch, which changes which colour is reached first. */
  staggerPhase?: StaggerPhase
}

/**
 * THE source of truth for pattern letters — editor canvas, palette panel,
 * weave mode, word chart, PNG, Instagram card and PDF all read their labels
 * from here, so a color reads the same everywhere and a printed PDF still
 * matches the screen tomorrow.
 *
 * Letters go by **order of first use along `buildWeaveOrder`**: the first
 * color you meet while weaving is A, the next new one B, and so on. Using the
 * weave traversal (rather than, say, bead count or the palette's own order)
 * means the chart, the word chart and the materials list all read in the same
 * sequence the piece is actually worked in.
 *
 * Two consequences worth stating, both deliberate:
 *
 * - A color sitting in the palette that isn't painted anywhere gets NO letter
 *   and no entry here. Available-to-paint and used-in-the-design are
 *   different things; only the second one is part of the pattern's notation,
 *   so an unused color never consumes a letter, never reaches the materials
 *   list and never reaches the PDF.
 * - A colour keeps its letter for as long as the pattern remembers it. Pass
 *   the pattern's saved `LetterAssignment` and nothing is ever renamed behind
 *   the weaver's back: a new colour takes the lowest free letter, a colour
 *   that disappears keeps its letter reserved (so repainting it later gets the
 *   same one back), and closing up any gaps is a deliberate act — see
 *   `reletterConsecutively`, behind the palette's "Reordenar letras". Without
 *   a saved assignment this falls back to numbering by first use, which is
 *   what every pattern made before this did.
 *
 * A woven hanging loop weaves last, so its ring color (if the ring is the
 * only place that color appears) sorts last too — same rule, no special case.
 */
export function assignLetters(pattern: LetterPattern, saved?: LetterAssignment): LetterEntry[] {
  return assignLettersAcross([pattern], saved)
}

/**
 * `assignLetters` over several physical pieces at once — an earring pair's
 * left and right (see `engine/pair.ts`). One notation for the pair: a colour
 * reads the same letter on both earrings, a colour that only appears on the
 * right one still gets a letter, and counts add up across both, which is
 * what the materials list needs to buy beads for the whole pair. Pieces are
 * walked in order, each along its own weave order, so the left earring's
 * colours come first.
 */
export function assignLettersAcross(pieces: LetterPattern[], saved?: LetterAssignment): LetterEntry[] {
  const counts = new Map<string, number>()
  for (const piece of pieces) {
    for (const [hex, count] of countByHex(piece.cells, piece.loop)) counts.set(hex, (counts.get(hex) ?? 0) + count)
  }

  const seen: string[] = []
  const seenSet = new Set<string>()
  function see(hex: string | undefined) {
    if (!hex || seenSet.has(hex) || !counts.has(hex)) return
    seenSet.add(hex)
    seen.push(hex)
  }

  for (const { technique, cols, rows, cells, fringe, rowShape, loop, staggerPhase } of pieces) {
    const order = buildWeaveOrder(technique, cols, rows, fringe, rowShape, loopBeadCount(loop), staggerPhase)
    for (const step of order) {
      if (step.isLoop) {
        // A woven ring's beads aren't in `cells` (a ring isn't addressable by
        // row/col — see `weaveOrder.ts#WeaveStep.isLoop`); its color is uniform.
        see(loop?.variant === 'woven' ? loop.color : undefined)
        continue
      }
      for (const { row, col } of step.cells) see(cells[cellKey(row, col)])
    }
  }

  // Defensive, and normally a no-op: a painted cell the traversal doesn't
  // reach (body shape and cell data drifting apart, same case
  // `buildBrickOrder` guards against) would otherwise be counted in the
  // materials list with no letter to label it. Appended in cell-key order so
  // the result stays deterministic rather than depending on object insertion.
  if (seenSet.size < counts.size) {
    for (const piece of pieces) for (const key of Object.keys(piece.cells).sort()) see(piece.cells[key])
    for (const hex of counts.keys()) see(hex)
  }

  const letters = lettersFor(seen, saved)
  return seen
    .map((hex) => ({ hex, letter: letters[hex], count: counts.get(hex) ?? 0 }))
    .sort((a, b) => letterIndex(a.letter) - letterIndex(b.letter))
}

/**
 * The letter each of `used` holds: the one it already had, or the lowest one
 * free. Letters belonging to colours that are no longer painted stay taken, so
 * a colour that comes back finds its own letter waiting instead of wearing
 * someone else's.
 *
 * Two colours can remember the same letter — "Cambiar este color" hands the
 * old colour's letter to the new one and keeps it on the old one too, so an
 * undo brings the old colour back as itself. Should both ever be painted at
 * once, the one woven first keeps the letter and the other takes the lowest
 * free one: a letter never labels two colours.
 */
function lettersFor(used: string[], saved?: LetterAssignment): LetterAssignment {
  if (!saved) return Object.fromEntries(used.map((hex, i) => [hex, letterForIndex(i)]))
  const taken = new Set(Object.values(saved))
  const given = new Set<string>()
  const out: LetterAssignment = {}
  for (const hex of used) {
    const existing = saved[hex]
    if (existing && !given.has(existing)) {
      given.add(existing)
      out[hex] = existing
      continue
    }
    let i = 0
    while (taken.has(letterForIndex(i))) i++
    out[hex] = letterForIndex(i)
    taken.add(out[hex])
    given.add(out[hex])
  }
  return out
}

/**
 * The assignment to save after an edit: what the pattern already remembered,
 * plus a letter for every colour that has appeared since. Nothing is dropped —
 * a colour erased today keeps its letter for when it comes back.
 */
export function extendAssignment(pieces: LetterPattern[], saved?: LetterAssignment): LetterAssignment {
  const entries = assignLettersAcross(pieces, saved)
  return { ...saved, ...Object.fromEntries(entries.map((e) => [e.hex, e.letter])) }
}

/**
 * A fresh A, B, C… in weaving order, forgetting old reservations — what the
 * palette's "Reordenar letras" does. The one place letters are allowed to move,
 * because the weaver asked for it.
 */
export function reletterConsecutively(pieces: LetterPattern[]): LetterAssignment {
  const entries = assignLettersAcross(pieces)
  return Object.fromEntries(entries.map((e) => [e.hex, e.letter]))
}

/**
 * `assignLetters` as a hex → letter lookup, for the renderers that only need
 * the label. Pass every piece of an earring pair so both earrings share one
 * set of letters — see `assignLettersAcross`.
 */
export function letterMap(pattern: LetterPattern | LetterPattern[], saved?: LetterAssignment): Map<string, string> {
  const pieces = Array.isArray(pattern) ? pattern : [pattern]
  return new Map(assignLettersAcross(pieces, saved).map((e) => [e.hex, e.letter]))
}

/**
 * Beads per color: every painted cell, plus a woven loop's ring folded into
 * its own color (merged with an existing entry when the ring reuses one of
 * the pattern's colors). A metal loop contributes nothing — it's a bought
 * finding, not beads (see `engine/loop.ts#loopBeadCount`).
 */
function countByHex(cells: ColorMap, loop: LoopData | undefined): Map<string, number> {
  const counts = new Map<string, number>()
  for (const hex of Object.values(cells)) {
    if (!hex) continue
    counts.set(hex, (counts.get(hex) ?? 0) + 1)
  }
  const ringBeads = loopBeadCount(loop)
  if (loop && ringBeads > 0) {
    counts.set(loop.color, (counts.get(loop.color) ?? 0) + ringBeads)
  }
  return counts
}
