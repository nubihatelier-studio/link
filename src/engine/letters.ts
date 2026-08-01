import type { ColorMap, FringeData, LoopData, RowShape, Technique } from './types'
import { cellKey } from './cellKey'
import { buildWeaveOrder } from './weaveOrder'
import { loopBeadCount } from './loop'

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
 * - Letters are stable while a color stays used: they're derived from the
 *   cells, so adding, removing or reordering *other* palette colors can't
 *   shift them. If a color stops being used entirely, it releases its letter
 *   and the ones after it close the gap — the alternative is a chart whose
 *   labels skip letters with nothing to explain the holes.
 *
 * A woven hanging loop weaves last, so its ring color (if the ring is the
 * only place that color appears) sorts last too — same rule, no special case.
 */
export function assignLetters(pattern: LetterPattern): LetterEntry[] {
  const { technique, cols, rows, cells, fringe, rowShape, loop } = pattern
  const counts = countByHex(cells, loop)

  const order = buildWeaveOrder(technique, cols, rows, fringe, rowShape, loopBeadCount(loop))
  const seen: string[] = []
  const seenSet = new Set<string>()

  function see(hex: string | undefined) {
    if (!hex || seenSet.has(hex) || !counts.has(hex)) return
    seenSet.add(hex)
    seen.push(hex)
  }

  for (const step of order) {
    if (step.isLoop) {
      // A woven ring's beads aren't in `cells` (a ring isn't addressable by
      // row/col — see `weaveOrder.ts#WeaveStep.isLoop`); its color is uniform.
      see(loop?.variant === 'woven' ? loop.color : undefined)
      continue
    }
    for (const { row, col } of step.cells) see(cells[cellKey(row, col)])
  }

  // Defensive, and normally a no-op: a painted cell the traversal doesn't
  // reach (body shape and cell data drifting apart, same case
  // `buildBrickOrder` guards against) would otherwise be counted in the
  // materials list with no letter to label it. Appended in cell-key order so
  // the result stays deterministic rather than depending on object insertion.
  if (seenSet.size < counts.size) {
    for (const key of Object.keys(cells).sort()) see(cells[key])
    for (const hex of counts.keys()) see(hex)
  }

  return seen.map((hex, i) => ({ hex, letter: letterForIndex(i), count: counts.get(hex) ?? 0 }))
}

/** `assignLetters` as a hex → letter lookup, for the renderers that only need the label. */
export function letterMap(pattern: LetterPattern): Map<string, string> {
  return new Map(assignLetters(pattern).map((e) => [e.hex, e.letter]))
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
