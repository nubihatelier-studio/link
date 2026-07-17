import type { ColorMap, FringeData, Technique } from './types'
import { cellKey } from './cellKey'
import { buildWeaveOrder, unitIndexOf } from './weaveOrder'

/** Placeholder token for an empty (uncolored) bead slot in the word chart. */
const EMPTY_TOKEN = '–'

export interface WordChartLine {
  /**
   * 0-based row/column index (whichever this technique's weave unit is — see
   * weaveUnit) for a body line; the body column index for a fringe line
   * (`isFringe: true`) — fringes hang per column regardless of technique.
   */
  unitIndex: number
  /** Run-length-encoded sequence for this unit, e.g. "3A, 2B, 1A" (fringe lines add a trailing ", giro" when the deepest bead is a turn bead). */
  text: string
  /** Set only on the fringe section's lines, appended after every body line. */
  isFringe?: true
}

/** Run-length-encodes a sequence of letter tokens, e.g. ['A','A','B'] -> ['2A', '1B']. */
function runLengthEncode(tokens: string[]): string[] {
  const out: string[] = []
  let letter: string | null = null
  let count = 0
  for (const t of tokens) {
    if (t === letter) {
      count++
    } else {
      if (count > 0 && letter !== null) out.push(`${count}${letter}`)
      letter = t
      count = 1
    }
  }
  if (count > 0 && letter !== null) out.push(`${count}${letter}`)
  return out
}

/**
 * Textual "word chart": the same bead-by-bead sequence Weave Mode walks
 * (buildWeaveOrder is the single source of truth for that order — see
 * weaveOrder.ts), collapsed into one line per row/column and run-length
 * encoded ("3A" = three beads of letter A in a row) so it reads like a
 * knitting-style pattern instruction instead of a raw cell dump. Used by
 * the PDF export as a colorblind/black-and-white-print-safe fallback to the
 * visual chart.
 *
 * When `fringe` is given, a fringe section is appended after every body
 * line: one line per column with a fringe (`isFringe: true`), read
 * depth-ascending (closest to the body first) — fringes hang per column
 * regardless of technique, so they're never merged into the body's own
 * row/column lines (that would misgroup them for brick/loom, whose body
 * unit is the row, not the column).
 */
export function buildWordChart(
  technique: Technique,
  cols: number,
  rows: number,
  cells: ColorMap,
  letterForHex: (hex: string) => string,
  fringe?: FringeData,
): WordChartLine[] {
  const order = buildWeaveOrder(technique, cols, rows)
  const lines: WordChartLine[] = []

  let currentUnit = -1
  let tokens: string[] = []
  let runLetter: string | null = null
  let runCount = 0

  const flushRun = () => {
    if (runCount > 0 && runLetter !== null) tokens.push(`${runCount}${runLetter}`)
    runCount = 0
    runLetter = null
  }
  const flushLine = () => {
    flushRun()
    if (currentUnit >= 0) lines.push({ unitIndex: currentUnit, text: tokens.join(', ') })
    tokens = []
  }

  for (const cell of order) {
    const unitIndex = unitIndexOf(technique, cell)
    if (unitIndex !== currentUnit) {
      flushLine()
      currentUnit = unitIndex
    }
    const hex = cells[cellKey(cell.row, cell.col)]
    const letter = hex ? letterForHex(hex) : EMPTY_TOKEN
    if (letter === runLetter) {
      runCount++
    } else {
      flushRun()
      runLetter = letter
      runCount = 1
    }
  }
  flushLine()

  if (fringe) {
    for (let col = 0; col < cols; col++) {
      const length = fringe.lengths[col] ?? 0
      if (length === 0) continue
      const letters: string[] = []
      for (let depth = 0; depth < length; depth++) {
        const hex = cells[cellKey(rows + depth, col)]
        letters.push(hex ? letterForHex(hex) : EMPTY_TOKEN)
      }
      const fringeTokens = runLengthEncode(letters)
      if (fringe.turnBeads[col]) fringeTokens.push('giro')
      lines.push({ unitIndex: col, text: fringeTokens.join(', '), isFringe: true })
    }
  }

  return lines
}

/**
 * "3A, 2B" -> "3×A, 2×B" — the on-screen hands-busy reading view spells out
 * the multiplication sign for legibility at a glance/distance; the PDF word
 * chart keeps the terser "3A" form since it's already labeled and printed
 * small. Same underlying `WordChartLine.text`, just formatted per surface.
 */
export function formatWordChartLineForDisplay(text: string): string {
  if (!text) return text
  return text.replace(/(\d+)([^\d,]+)/g, '$1×$2')
}
