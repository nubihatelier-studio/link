import type { ColorMap, Technique } from './types'
import { cellKey } from './cellKey'
import { buildWeaveOrder, unitIndexOf } from './weaveOrder'

/** Placeholder token for an empty (uncolored) bead slot in the word chart. */
const EMPTY_TOKEN = '–'

export interface WordChartLine {
  /** 0-based row/column index (whichever this technique's weave unit is — see weaveUnit). */
  unitIndex: number
  /** Run-length-encoded sequence for this unit, e.g. "3A, 2B, 1A". */
  text: string
}

/**
 * Textual "word chart": the same bead-by-bead sequence Weave Mode walks
 * (buildWeaveOrder is the single source of truth for that order — see
 * weaveOrder.ts), collapsed into one line per row/column and run-length
 * encoded ("3A" = three beads of letter A in a row) so it reads like a
 * knitting-style pattern instruction instead of a raw cell dump. Used by
 * the PDF export as a colorblind/black-and-white-print-safe fallback to the
 * visual chart.
 */
export function buildWordChart(
  technique: Technique,
  cols: number,
  rows: number,
  cells: ColorMap,
  letterForHex: (hex: string) => string,
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

  return lines
}
