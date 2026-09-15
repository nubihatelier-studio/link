import type { ColorMap, FringeData, LoopData, RowShape, Technique } from './types'
import { cellKey } from './cellKey'
import { loopBeadCount } from './loop'
import { buildWeaveOrder } from './weaveOrder'
import type { StaggerPhase } from './geometry'

/** Placeholder token for an empty (uncolored) bead slot in the word chart. */
const EMPTY_TOKEN = '–'

/**
 * Joins the beads of one brick 2-drop/3-drop stitch, top bead first: "A+B"
 * is one stitch picking up an A and a B, so "3A+B" is three such stitches.
 * Letters themselves can run to two characters (AA, AB… past 26 colours), so
 * the stitch needs a separator of its own.
 */
const STITCH_JOIN = '+'

export interface WordChartLine {
  /**
   * 0-based row index for a body line, the pass number for peyote
   * (`isPass: true` — see `weaveOrder.ts#buildPeyoteOrder`), or the fringe
   * column for a fringe line (`isFringe: true`) — fringes hang per column
   * regardless of technique.
   */
  unitIndex: number
  /** Run-length-encoded sequence for this unit, e.g. "3A, 2B, 1A" (fringe lines add a trailing ", giro" when the deepest bead is a turn bead). */
  text: string
  /** Set only on the fringe section's lines, appended after every body line. */
  isFringe?: true
  /**
   * Set on peyote's body lines: the line counts the beads strung in one PASS
   * (the alternating positions), not the cells of a drawn row — so
   * "Pasada 5: 3A, 2B" means five beads went on the needle. See
   * `weaveOrder.ts#buildPeyoteOrder`.
   */
  isPass?: true
  /** Set only on brick's very first line — the widest row the whole body is built up from, see `weaveOrder.ts#buildBrickOrder`. */
  isBaseRow?: true
  /** Set only on the final line — a woven hanging loop's ring, see `weaveOrder.ts#appendLoopStep`. */
  isLoop?: true
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
 * grouping key (body row or peyote pass, fringe column, or the loop) — since
 * `buildWeaveOrder` already walks brick bottom-up, reverses direction every
 * row, splits peyote into passes and orders fringe columns by the thread's
 * natural direction, this function doesn't need to know any of that: it
 * just groups whatever comes out contiguously.
 */
export function buildWordChart(
  technique: Technique,
  cols: number,
  rows: number,
  cells: ColorMap,
  letterForHex: (hex: string) => string,
  fringe?: FringeData,
  rowShape?: RowShape[],
  loop?: LoopData,
  staggerPhase?: StaggerPhase,
): WordChartLine[] {
  const order = buildWeaveOrder(technique, cols, rows, fringe, rowShape, loopBeadCount(loop), staggerPhase)
  const lines: WordChartLine[] = []

  let currentKey: string | null = null
  let lineMeta: {
    unitIndex: number
    isFringe?: true
    isPass?: true
    isBaseRow?: true
    isLoop?: true
  } | null = null
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
    const key = step.isLoop ? 'loop' : step.isFringe ? `fringe:${step.unit}` : `body:${step.unit}`
    if (key !== currentKey) {
      flushLine()
      currentKey = key
      const isPeyoteBody = technique === 'peyote' && !step.isFringe && !step.isLoop
      lineMeta = {
        unitIndex: step.unit,
        ...(step.isFringe ? { isFringe: true as const } : {}),
        ...(isPeyoteBody ? { isPass: true as const } : {}),
        ...(step.isBaseRow ? { isBaseRow: true as const } : {}),
        ...(step.isLoop ? { isLoop: true as const } : {}),
      }
    }
    endsOnTurnBead = step.isTurnBead === true
    const letterOf = (cell: { row: number; col: number }) => {
      // A loop bead isn't in the `cells` grid at all (see `weaveOrder.ts#appendLoopStep`) —
      // every bead in the ring shares the loop's own single color instead.
      const hex = step.isLoop ? loop?.color : cells[cellKey(cell.row, cell.col)]
      return hex ? letterForHex(hex) : EMPTY_TOKEN
    }
    // A brick 2-drop/3-drop stitch is one token for its whole stack; every
    // other step counts bead by bead.
    const stepTokens = step.grouped ? step.cells.map(letterOf) : [step.cells.map(letterOf).join(STITCH_JOIN)]
    for (const letter of stepTokens) {
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

/** One run of a word chart line: `count` beads of `letter` in a row (`letter` is `EMPTY_TOKEN` for unpainted beads). */
export interface WordChartRun {
  letter: string
  count: number
}

/**
 * A line's runs, in weaving order — "3A, 2B, giro" → [{A, 3}, {B, 2}] plus
 * `turn: true`. For views that draw the sequence (weave mode's big colour
 * chips) instead of printing the text, so they read the very same sequence
 * the text says rather than recounting it their own way.
 */
export function wordChartRuns(text: string): { runs: WordChartRun[]; turn: boolean } {
  const runs: WordChartRun[] = []
  let turn = false
  for (const token of text.split(', ')) {
    if (token === 'giro') {
      turn = true
      continue
    }
    const match = /^(\d+)(.+)$/.exec(token)
    if (match) runs.push({ count: Number(match[1]), letter: match[2] })
  }
  return { runs, turn }
}

/** The token a word chart uses for an unpainted bead. */
export const WORD_CHART_EMPTY = EMPTY_TOKEN

/** The letters of one run's stitch, top bead first — a single letter for everything but brick 2-drop and 3-drop. */
export function stitchLetters(letter: string): string[] {
  return letter.split(STITCH_JOIN)
}
