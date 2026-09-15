import { Check } from 'lucide-react'
import { stitchLetters, WORD_CHART_EMPTY, type WordChartRun } from '@/engine/wordChart'
import { contrastTextColor } from '@/lib/beadStyle'
import { t } from '@/i18n/es'

interface WeaveSequenceProps {
  /** The runs of the pass/row/strand being worked, in weaving order — see `engine/wordChart.ts#wordChartRuns`. */
  runs: WordChartRun[]
  /** Letter → bead colour, from the same assignment the chart uses. */
  hexForLetter: Map<string, string>
  /** How many steps of this unit are done — beads, or whole stitches in brick 2-drop/3-drop. Marks which run is being worked. */
  stepsDone: number
  /** A fringe strand that ends on a turn bead. */
  turn?: boolean
}

/**
 * The colour sequence of the pass being worked, big enough to read at arm's
 * length with a needle in hand: one chip per run — "3 × (A)" with the bead's
 * own colour (a brick 2-drop stitch shows its stack, one chip per bead) — the run being strung ringed, the ones already done faded with
 * a tick. It's the same sequence the word chart writes as "3A, 2B", drawn
 * instead of printed.
 */
export function WeaveSequence({ runs, hexForLetter, stepsDone, turn }: WeaveSequenceProps) {
  if (runs.length === 0) return null
  let start = 0
  return (
    <ol aria-label={t.weave.sequenceLabel} className="flex flex-wrap items-center justify-center gap-2">
      {runs.map((run, i) => {
        const runStart = start
        start += run.count
        const done = start <= stepsDone
        const active = !done && runStart <= stepsDone
        return (
          <li
            key={i}
            aria-current={active ? 'step' : undefined}
            className={`flex items-center gap-2 rounded-3xl py-1 pl-3 pr-1 transition-opacity
              ${active ? 'bg-accent-500/15 ring-2 ring-accent-500' : 'bg-surface-2'} ${done ? 'opacity-45' : ''}`}
          >
            <span className="text-xl font-bold tabular-nums">{run.count}</span>
            <span className="text-sm text-text-muted">×</span>
            <span className="flex flex-col items-center gap-0.5">
              {stitchLetters(run.letter).map((letter, j) => {
                const hex = letter === WORD_CHART_EMPTY ? undefined : hexForLetter.get(letter)
                return (
                  <span
                    key={j}
                    className="flex h-9 min-w-9 items-center justify-center rounded-full border border-border px-1 text-sm font-bold"
                    style={hex ? { backgroundColor: hex, color: contrastTextColor(hex) } : undefined}
                  >
                    {done ? <Check size={16} /> : letter}
                  </span>
                )
              })}
            </span>
          </li>
        )
      })}
      {turn && (
        <li className="rounded-full bg-surface-2 px-3 py-2 text-sm font-semibold text-text-muted">{t.weave.turnBead}</li>
      )}
    </ol>
  )
}
