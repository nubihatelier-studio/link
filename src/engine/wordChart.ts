import type { ColorMap, FringeData, RowShape, Technique } from './types'
import { cellKey } from './cellKey'
import { buildWeaveOrder } from './weaveOrder'

/** Placeholder token for an empty (uncolored) bead slot in the word chart. */
const EMPTY_TOKEN = '–'

export interface WordChartLine {
  /**
   * 0-based row index for a body line, or the fringe column for a fringe
   * line (`isFringe: true`) — fringes hang per column regardless of
   * technique. Meaningless (0) for a `grouped` line (peyote's foundation
   * pass), since that line doesn't belong to a single row.
   */
  unitIndex: number
  /** Run-length-encoded sequence for this unit, e.g. "3A, 2B, 1A" (fringe lines add a trailing ", giro" when the deepest bead is a turn bead). */
  text: string
  /** Set only on the fringe section's lines, appended after every body line. */
  isFringe?: true
  /** Set only on peyote's foundation pass — the first two rows strung together, see `weaveOrder.ts#buildPeyoteOrder`. */
  grouped?: true
  /** Set only on brick's very first line — the widest row the whole body is built up from, see `weaveOrder.ts#buildBrickOrder`. */
  isBaseRow?: true
}

/**
 * Textual "word chart": the same bead-by-bead sequence Weave Mode walks
 * (`buildWeaveOrder` is the single source of truth for that order — see
 * `weaveOrder.ts`), collapsed into one line per step-run and run-length
 * encoded ("3A" = three beads of letter A in a row) so it reads like a
 * knitting-style pattern instruction instead of a raw cell dump. Used by
 * the PDF export as a colorblind/black-and-white-print-safe fallback to the
 * visual chart.
 *
 * A "line" is a maximal run of consecutive steps that share the same
 * grouping key (body row, fringe column, or "the one grouped step") — since
 * `buildWeaveOrder` already walks brick bottom-up, reverses direction every
 * row, orders fringe columns by the thread's natural direction, and bundles
 * peyote's foundation pass into one step, this function doesn't need to
 * know any of that: it just groups whatever comes out contiguously.
 */
export function buildWordChart(
  technique: Technique,
  cols: number,
  rows: number,
  cells: ColorMap,
  letterForHex: (hex: string) => string,
  fringe?: FringeData,
  rowShape?: RowShape[],
): WordChartLine[] {
  const order = buildWeaveOrder(technique, cols, rows, fringe, rowShape)
  const lines: WordChartLine[] = []

  let currentKey: string | null = null
  let lineMeta: { unitIndex: number; isFringe?: true; grouped?: true; isBaseRow?: true } | null = null
  let endsOnTurnBead = false
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
    if (lineMeta) {
      if (endsOnTurnBead) tokens.push('giro')
      lines.push({ ...lineMeta, text: tokens.join(', ') })
    }
    tokens = []
    endsOnTurnBead = false
  }

  for (const step of order) {
    const key = step.isFringe ? `fringe:${step.unit}` : step.grouped ? 'grouped' : `body:${step.unit}`
    if (key !== currentKey) {
      flushLine()
      currentKey = key
      lineMeta = {
        unitIndex: step.unit,
        ...(step.isFringe ? { isFringe: true as const } : {}),
        ...(step.grouped ? { grouped: true as const } : {}),
        ...(step.isBaseRow ? { isBaseRow: true as const } : {}),
      }
    }
    endsOnTurnBead = step.isTurnBead === true
    for (const cell of step.cells) {
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
  }
  flushLine()

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
