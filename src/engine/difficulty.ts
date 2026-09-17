import type { Difficulty, PatternDoc } from './types'
import { beadCount } from './geometry'
import { maxRowWidth } from './shape'
import { totalFringeBeadCount } from './fringe'

/**
 * A difficulty PROPOSAL for a piece, never the last word: whoever saves the
 * template can change it, because how hard something is to weave is a
 * weaver's judgement and this is arithmetic.
 *
 * What it counts is what actually makes a piece harder at the needle:
 *
 * - **Size**: more beads is more chances to lose the count.
 * - **Colours**: a two-colour band is followed by feel; eight colours are
 *   read bead by bead off the chart.
 * - **Increases and decreases** (a shaped brick body): worth double, because
 *   the row's own width changes — the first thing that trips a beginner, and
 *   the reason a small tapered earring is harder than a long plain band.
 * - **Fringe** and a **woven loop**: each is its own technique on top.
 * - **A pair of earrings**: the same piece twice, and they have to match.
 */
export function suggestDifficulty(doc: PatternDoc): Difficulty {
  const { technique, cols, rows } = doc.config
  const beads = beadCount(technique, cols, rows, doc.rowShape) + totalFringeBeadCount(doc.fringe)
  const colors = new Set(Object.values(doc.cells).filter(Boolean)).size
  const shaped = Boolean(doc.rowShape && maxRowWidth(doc.rowShape) !== Math.min(...doc.rowShape.map((r) => r.length)))

  let points = 0
  if (beads > 250) points++
  if (beads > 700) points++
  if (colors > 3) points++
  if (colors > 6) points++
  if (shaped) points += 2
  if (totalFringeBeadCount(doc.fringe) > 0) points++
  if (doc.loop?.variant === 'woven') points++
  if (doc.pair) points++

  if (points >= 4) return 'avanzado'
  if (points >= 1) return 'intermedio'
  return 'facil'
}
