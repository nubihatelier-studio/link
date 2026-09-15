import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { Moon, RefreshCw, Sun } from 'lucide-react'
import { usePatternsStore } from '@/store/patternsStore'
import { useWeaveStore, weaveProgressKey } from '@/store/weaveStore'
import { useWeavePrefsStore } from '@/store/weavePrefsStore'
import {
  buildWeaveOrder,
  firstIndexOfNextUnit,
  peyoteThreadThroughCells,
  isFringeStep,
  jumpTargetToIndex,
  totalBeadCount,
  beadsThrough,
  WEAVE_ORDER_VERSION,
  type JumpTarget,
} from '@/engine/weaveOrder'
import { loopBeadCount } from '@/engine/loop'
import { leftPieceOf, piecesOf, rightEarring } from '@/engine/pair'
import type { EarringSide } from '@/engine/types'
import { assignLettersAcross } from '@/engine/letters'
import { buildWordChart, wordChartRuns } from '@/engine/wordChart'
import { useWakeLock } from '@/hooks/useWakeLock'
import { t } from '@/i18n/es'
import { WeaveCanvas } from '@/components/weave/WeaveCanvas'
import { WeaveSequence } from '@/components/weave/WeaveSequence'
import { Button } from '@/components/shared/Button'
import { SegmentedControl } from '@/components/shared/SegmentedControl'
import { UndoToast } from '@/components/shared/UndoToast'
import { Toast } from '@/components/shared/Toast'
import { InfoScreen } from '@/components/shared/InfoScreen'

/** Serializes a JumpTarget as an <option value> for the "Ir a" selector — plain numeric values can't tell a body row and a fringe column apart. */
function encodeJumpValue(target: JumpTarget): string {
  return `${target.kind}:${target.index}`
}

/**
 * Sentinel selector value for the woven loop's step. It isn't a real JumpTarget
 * — the loop is always the last step, so there's nothing to jump *to*; this only
 * exists so the "Ir a" select has a matching option while the loop is current
 * instead of falsely showing whichever row shares its unit index.
 */
const LOOP_JUMP_VALUE = 'loop:0'

/** Inverse of encodeJumpValue — parses the selector's raw string value back into a JumpTarget. */
function decodeJumpValue(value: string): JumpTarget {
  const [kind, index] = value.split(':')
  return { kind: kind === 'fringe' ? 'fringe' : 'body', index: Number(index) }
}

export function WeavePage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const pattern = usePatternsStore((s) => (id ? s.patterns[id] : undefined))
  const { getIndex, getOrderVersion, setIndex, reset, loadProgress, finish, unfinish, isFinished } = useWeaveStore()
  /** The closing sheet "Terminar" opens. */
  const [finishSheetOpen, setFinishSheetOpen] = useState(false)
  const { tapAnywhereToAdvance, setTapAnywhereToAdvance } = useWeavePrefsStore()
  const touchStartX = useRef<number | null>(null)
  // Captured index to restore if "Reiniciar" gets undone within the toast window.
  const [pendingReset, setPendingReset] = useState<number | null>(null)
  // Set once, the first time we notice a saved index was recorded under a since-corrected
  // traversal order — not undoable (the old index doesn't point at a meaningful bead any more).
  const [progressInvalidated, setProgressInvalidated] = useState(false)

  // The whole point of Weave Mode is a hands-busy session — keep the screen
  // on for as long as this page is mounted, not just in the hands-busy view.
  const wakeLock = useWakeLock(true)

  /**
   * Which earring of a pair is being woven. Each keeps its own progress
   * (see `weaveProgressKey`), so weaving one, switching, and coming back
   * picks up exactly where each was left. The home screen's "continuar
   * tejiendo" opens straight on the right one with `?aro=derecho`.
   */
  const [searchParams] = useSearchParams()
  const [chosenSide, setSide] = useState<EarringSide>(searchParams.get('aro') === 'derecho' ? 'right' : 'left')
  const pair = pattern?.pair
  const side: EarringSide = pair ? chosenSide : 'left'
  const progressKey = id ? weaveProgressKey(id, side) : undefined

  useEffect(() => {
    if (progressKey) loadProgress(progressKey)
  }, [progressKey, loadProgress])

  // The piece on the needle: the pattern itself, or the right earring of its pair.
  const left = useMemo(() => (pattern ? leftPieceOf(pattern) : undefined), [pattern])
  const piece = useMemo(
    () => (left && pair && side === 'right' ? rightEarring(left, pair) : left),
    [left, pair, side],
  )
  const fringe = useMemo(() => piece?.fringe ?? { lengths: [], turnBeads: [] }, [piece])
  const rowShape = piece?.rowShape
  const loop = piece?.loop
  const order = useMemo(
    () =>
      piece
        ? buildWeaveOrder(piece.technique, piece.cols, piece.rows, piece.fringe, piece.rowShape, loopBeadCount(piece.loop))
        : [],
    [piece],
  )
  const technique = pattern?.config.technique ?? 'loom'
  const orderVersion = WEAVE_ORDER_VERSION[technique]
  const rows = pattern?.config.rows ?? 0
  const currentIndex = progressKey ? getIndex(progressKey) : -1
  const total = order.length
  const totalBeads = totalBeadCount(order)
  const beadsWoven = beadsThrough(order, currentIndex)
  const finished = total > 0 && currentIndex >= total - 1
  /**
   * Everything the screen says — the label, the direction, the colour
   * sequence, "Marcar pasada hecha", the "Ir a" selector — is about the bead
   * to string NEXT, the same one the canvas rings. It used to describe the
   * step just finished, so right after closing a pass the header still named
   * it while the canvas already highlighted the next one.
   */
  const workingIndex = finished ? total - 1 : currentIndex + 1
  const workingStep = order[workingIndex]
  const onFringe = workingStep ? isFringeStep(workingStep) : false
  const onLoop = workingStep?.isLoop === true
  const workingUnit = workingStep ? workingStep.unit : 0
  const fringeColumns = useMemo(() => fringe.lengths.flatMap((len, col) => (len > 0 ? [col] : [])), [fringe])
  /**
   * The written sequence for the unit being worked — "3A, 2B" — read off the
   * same `engine/wordChart.ts` the app has always built. This is where a word
   * chart earns its keep: one pass at a time, next to the pattern, instead of
   * as pages of a printout nobody follows bead by bead. Letters come from both
   * earrings of a pair, so they match the PDF and the editor.
   */
  const letterEntries = useMemo(
    () => (left ? assignLettersAcross(piecesOf(left, pair), pattern?.letters) : []),
    [left, pair, pattern?.letters],
  )
  const hexForLetter = useMemo(() => new Map(letterEntries.map((e) => [e.letter, e.hex])), [letterEntries])
  const wordChartLines = useMemo(() => {
    if (!left || !piece) return []
    const letterForHex = new Map(letterEntries.map((e) => [e.hex, e.letter]))
    return buildWordChart(
      piece.technique,
      piece.cols,
      piece.rows,
      piece.cells,
      (hex) => letterForHex.get(hex) ?? '?',
      piece.fringe,
      piece.rowShape,
      piece.loop,
    )
  }, [left, piece, letterEntries])

  /**
   * Peyote only: the previous pass's beads, which this pass threads *through*
   * rather than adding to. Outlined on the canvas because they're the landmark
   * a weaver hunts for — see `weaveOrder.ts#peyoteThreadThroughCells`.
   */
  const threadThroughCells = useMemo(
    () => (technique === 'peyote' && piece ? peyoteThreadThroughCells(order, currentIndex + 1, piece.cols) : []),
    [technique, order, currentIndex, piece],
  )

  // A saved index from before this technique's traversal order was corrected points at a
  // completely different bead now — never silently misread it, reset and say so explicitly.
  useEffect(() => {
    if (!progressKey || !pattern) return
    if (currentIndex < 0) return
    if (getOrderVersion(progressKey) === orderVersion) return
    reset(progressKey)
    setProgressInvalidated(true)
  }, [progressKey, pattern, currentIndex, getOrderVersion, orderVersion, reset])


  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!progressKey) return
      if (e.key === 'ArrowRight' || e.key === ' ' || e.key === 'Enter') {
        e.preventDefault()
        setIndex(progressKey, Math.min(total - 1, currentIndex + 1), orderVersion)
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault()
        setIndex(progressKey, Math.max(-1, currentIndex - 1), orderVersion)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [progressKey, currentIndex, total, orderVersion, setIndex])

  if (!pattern || !id || !piece || !progressKey) {
    return (
      <InfoScreen
        title={t.common.patternNotFound}
        message={t.common.patternNotFoundHint}
        action={{ label: t.common.goHome, onClick: () => navigate('/') }}
      />
    )
  }

  const markedFinished = isFinished(progressKey)

  function finishWeaving() {
    finish(progressKey!)
    setFinishSheetOpen(true)
  }
  function keepWeaving() {
    unfinish(progressKey!)
    setFinishSheetOpen(false)
  }
  function weaveAgain() {
    setFinishSheetOpen(false)
    requestReset()
  }

  function chooseSide(next: EarringSide) {
    setFinishSheetOpen(false)
    // A pending "Reiniciar" undo belongs to the earring it was made on.
    setPendingReset(null)
    setProgressInvalidated(false)
    setSide(next)
  }
  function advance() {
    setIndex(progressKey!, Math.min(total - 1, currentIndex + 1), orderVersion)
  }
  function goBack() {
    setIndex(progressKey!, Math.max(-1, currentIndex - 1), orderVersion)
  }
  function markUnitDone() {
    // The loop is the very last step — "done" can only mean the end of the piece.
    if (onLoop) {
      setIndex(progressKey!, total - 1, orderVersion)
      return
    }
    const nextStart = firstIndexOfNextUnit(order, workingIndex)
    setIndex(progressKey!, nextStart === -1 ? total - 1 : nextStart - 1, orderVersion)
  }
  function jumpTo(target: JumpTarget) {
    const start = jumpTargetToIndex(order, target)
    if (start !== -1) setIndex(progressKey!, start - 1, orderVersion)
  }
  function requestReset() {
    setPendingReset(currentIndex)
    reset(progressKey!)
  }
  function undoReset() {
    if (pendingReset !== null) setIndex(progressKey!, pendingReset, orderVersion)
    setPendingReset(null)
  }

  const canAdvance = currentIndex < total - 1

  // Weave Mode always keeps this on (see the useWakeLock(true) call above), so "supported but not
  // active" only ever means "hasn't acquired yet" or "lost it and is re-acquiring" (e.g. right
  // after returning from background) — both read the same to the weaver: it's trying.
  const wakeLockLabel = !wakeLock.isSupported
    ? t.weave.wakeLockUnsupported
    : wakeLock.isActive
      ? t.weave.wakeLockActive
      : t.weave.wakeLockRetrying
  const WakeLockIcon = !wakeLock.isSupported ? Moon : wakeLock.isActive ? Sun : RefreshCw

  // Peyote counts passes, but the ruler beside the chart counts drawn rows —
  // so the label names both, and the canvas lights up that row's number.
  const workingRow = workingStep && !workingStep.isLoop ? workingStep.cells[0].row : null
  const currentRowLabel = finished
    ? t.weave.finished
    : onLoop
      ? t.weave.loopStepLabel
      : onFringe
        ? t.weave.fringeColumnHeader(workingStep!.unit + 1)
        : workingStep?.isBaseRow
          ? t.weave.baseRow
          : technique === 'peyote' && workingRow !== null
            ? `${t.weave.pass} ${workingUnit + 1} · ${t.weave.chartRow(workingRow + 1)}`
            : `${t.weave.row} ${workingUnit + 1}`
  // A discreet direction indicator — which way the needle moves along the row being worked (meaningless for fringe steps, which hang straight down).
  const directionArrow = !finished && !onFringe && !onLoop && workingStep ? (workingStep.direction === 'ltr' ? '→' : '←') : null
  const directionLabel = workingStep?.direction === 'ltr' ? t.weave.directionLtr : t.weave.directionRtl
  const currentLine = onLoop
    ? wordChartLines.find((l) => l.isLoop)
    : onFringe
      ? wordChartLines.find((l) => l.isFringe && l.unitIndex === workingStep!.unit)
      : wordChartLines.find((l) => !l.isFringe && !l.isLoop && l.unitIndex === workingUnit)
  const sequence = wordChartRuns(currentLine?.text ?? '')
  // Beads of this unit already on the thread — which chip of the sequence is being worked.
  const unitStart = workingStep
    ? order.findIndex((s) => s.unit === workingStep.unit && !!s.isFringe === !!workingStep.isFringe && !!s.isLoop === !!workingStep.isLoop)
    : 0
  const beadsDoneInUnit = finished
    ? Infinity
    : beadsThrough(order, workingIndex - 1) - beadsThrough(order, unitStart - 1)

  // "Ir a" selector. Peyote lists PASSES, not grid rows — the foundation is
  // pass 1 and every row after it contributes two, so they're read straight
  // off the order rather than counted from `rows`. Brick's widest row keeps
  // its numeric slot but reads "Fila base".
  const peyotePassCount =
    technique === 'peyote' ? new Set(order.filter((s) => !s.isFringe && !s.isLoop).map((s) => s.unit)).size : 0
  const rowJumpOptions: { target: JumpTarget; label: string }[] =
    technique === 'peyote'
      ? Array.from({ length: peyotePassCount }, (_, i) => ({
          target: { kind: 'body' as const, index: i },
          label: `${t.weave.pass} ${i + 1}`,
        }))
      : Array.from({ length: rows }, (_, i) => ({
          target: { kind: 'body' as const, index: i },
          label: technique === 'brick' && i === rows - 1 ? t.weave.baseRow : `${t.weave.row} ${i + 1}`,
        }))

  // The loop has no "Ir a" entry of its own (it's always the last step, one tap
  // from the end) — while it's current the selector just shows the loop option.
  const currentJumpValue = onLoop
    ? LOOP_JUMP_VALUE
    : onFringe
      ? encodeJumpValue({ kind: 'fringe', index: workingStep!.unit })
      : encodeJumpValue({ kind: 'body', index: workingUnit })

  return (
    <div
      className="flex h-dvh flex-col"
      onTouchStart={(e) => (touchStartX.current = e.touches[0].clientX)}
      onTouchEnd={(e) => {
        if (touchStartX.current == null) return
        const dx = e.changedTouches[0].clientX - touchStartX.current
        if (Math.abs(dx) > 50) {
          if (dx < 0) advance()
          else goBack()
        }
        touchStartX.current = null
      }}
    >
      <header className="flex items-center gap-3 border-b border-border px-4 pb-3 pt-[calc(0.75rem+env(safe-area-inset-top))]">
        <button onClick={() => navigate(`/editor/${id}`)} className="rounded-full p-2 hover:bg-surface-2">
          ←
        </button>
        <div className="min-w-0 flex-1">
          <p className="truncate text-lg font-bold">{pattern.name}</p>
          <p className="text-xs text-text-muted">
            {markedFinished && (
              <span className="mr-1.5 rounded-full bg-accent-500/15 px-1.5 py-0.5 font-semibold text-accent-600">
                {t.weave.finishedLabel}
              </span>
            )}
            {currentRowLabel}
            {directionArrow && (
              <span className="ml-1" role="img" aria-label={directionLabel} title={directionLabel}>
                {directionArrow}
              </span>
            )}{' '}
            · {Math.max(0, beadsWoven)} / {totalBeads} {t.weave.beadsWoven}
          </p>
        </div>
        <span
          role="img"
          aria-label={wakeLockLabel}
          title={wakeLockLabel}
          className={`flex h-8 w-8 items-center justify-center rounded-full ${wakeLock.isActive ? 'text-accent-500' : 'text-text-muted'}`}
        >
          <WakeLockIcon size={16} className={!wakeLock.isSupported ? '' : wakeLock.isActive ? '' : 'animate-spin'} />
        </span>
        <button onClick={requestReset} className="rounded-full px-2.5 py-1.5 text-xs text-text-muted hover:bg-surface-2">
          {t.weave.reset}
        </button>
        {/* Terminar antes del final: discreto, junto a Reiniciar, para no tocarlo sin querer. Al final está grande abajo. */}
        {!markedFinished && !finished && (
          <button
            onClick={finishWeaving}
            title={t.weave.finishEarlyHint}
            className="rounded-full px-2.5 py-1.5 text-xs text-text-muted hover:bg-surface-2"
          >
            {t.weave.finish}
          </button>
        )}
      </header>

      {pair && (
        <div className="flex justify-center border-b border-border px-4 py-2">
          <SegmentedControl<EarringSide>
            ariaLabel={t.weave.earring}
            size="sm"
            value={side}
            onChange={chooseSide}
            options={[
              { value: 'left', label: t.weave.leftEarring },
              { value: 'right', label: t.weave.rightEarring },
            ]}
          />
        </div>
      )}

      {!finished && sequence.runs.length > 0 && (
        <div className="border-b border-border px-4 py-3" title={currentLine?.text}>
          <WeaveSequence runs={sequence.runs} turn={sequence.turn} hexForLetter={hexForLetter} beadsDone={beadsDoneInUnit} />
        </div>
      )}

      <div className="relative min-h-0 flex-1">
        <WeaveCanvas
          technique={piece.technique}
          cols={piece.cols}
          rows={piece.rows}
          cells={piece.cells}
          fringe={fringe}
          order={order}
          currentIndex={currentIndex}
          onTapNext={advance}
          tapAnywhere={tapAnywhereToAdvance}
          threadThroughCells={threadThroughCells}
          staggerPhase={piece.staggerPhase}
          rowShape={rowShape}
          loop={loop}
          activeRow={finished ? null : workingRow}
        />
      </div>

      <footer className="flex flex-col gap-3 border-t border-border p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
        <div className="flex flex-wrap items-center justify-center gap-2">
          <label className="text-xs text-text-muted">
            {fringeColumns.length > 0 ? t.weave.jumpTo : technique === 'peyote' ? t.weave.jumpToPass : t.weave.jumpToRow}
          </label>
          <select
            className="rounded-lg border border-border bg-surface-2 px-2 py-1 text-sm"
            value={currentJumpValue}
            onChange={(e) => e.target.value !== LOOP_JUMP_VALUE && jumpTo(decodeJumpValue(e.target.value))}
          >
            {rowJumpOptions.map(({ target, label }) => (
              <option key={encodeJumpValue(target)} value={encodeJumpValue(target)}>
                {label}
              </option>
            ))}
            {fringeColumns.map((col) => (
              <option key={`fringe-${col}`} value={encodeJumpValue({ kind: 'fringe', index: col })}>
                {t.weave.fringeColumnHeader(col + 1)}
              </option>
            ))}
            {onLoop && <option value={LOOP_JUMP_VALUE}>{t.weave.loopStepLabel}</option>}
          </select>
          <button onClick={markUnitDone} className="rounded-full bg-surface-2 px-3 py-1.5 text-xs font-semibold hover:bg-surface-3">
            {onLoop
              ? t.weave.markLoopDone
              : onFringe
                ? t.weave.markFringeDone
                : technique === 'peyote'
                  ? t.weave.markPassDone
                  : t.weave.markRowDone}
          </button>
          <button
            onClick={() => setTapAnywhereToAdvance(!tapAnywhereToAdvance)}
            aria-pressed={tapAnywhereToAdvance}
            className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors
              ${tapAnywhereToAdvance ? 'bg-accent-500 text-accent-ink' : 'bg-surface-2 text-text-muted hover:bg-surface-3'}`}
          >
            {t.weave.tapToAdvance}
          </button>
        </div>
        {loop?.variant === 'metal' && (
          // A metal loop is a bought finding, so it produces no weave step at
          // all — just this closing reminder, visible for the whole session.
          <p className="text-center text-xs text-text-muted">{t.weave.metalLoopNote}</p>
        )}
        <div className="flex items-center gap-3">
          <Button
            variant="secondary"
            fullWidth
            onClick={goBack}
            disabled={currentIndex < 0}
          >
            ← {t.weave.back}
          </Button>
          {finished ? (
            <Button fullWidth onClick={finishWeaving}>
              {t.weave.finish} ✓
            </Button>
          ) : (
            <Button fullWidth onClick={advance} disabled={!canAdvance}>
              {t.weave.next} →
            </Button>
          )}
        </div>
      </footer>

      {finishSheetOpen && (
        <div className="fixed inset-0 z-50 flex items-end bg-black/40 md:items-center md:justify-center" onClick={() => setFinishSheetOpen(false)}>
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="finish-sheet-title"
            onClick={(e) => e.stopPropagation()}
            className="flex w-full flex-col gap-4 rounded-t-2xl bg-surface p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] md:max-w-sm md:rounded-2xl md:pb-5"
          >
            <div className="flex flex-col gap-1 text-center">
              <p className="text-3xl" aria-hidden="true">
                ✓
              </p>
              <h2 id="finish-sheet-title" className="text-lg font-bold">
                {t.weave.finishedSheet.title(pattern.name)}
                {pair && <span className="font-normal text-text-muted"> · {side === 'right' ? t.weave.rightEarring : t.weave.leftEarring}</span>}
              </h2>
              <p className="text-sm text-text-muted">
                {finished
                  ? t.weave.finishedSheet.beads(totalBeads)
                  : t.weave.finishedSheet.beadsEarly(Math.max(0, beadsWoven), totalBeads)}
              </p>
              {!finished && <p className="text-xs text-text-muted">{t.weave.finishedSheet.earlyHint}</p>}
            </div>
            <div className="flex flex-col gap-2">
              <Button fullWidth onClick={() => navigate('/')}>
                {t.weave.finishedSheet.library}
              </Button>
              <Button variant="secondary" fullWidth onClick={() => navigate(`/editor/${id}`)}>
                {t.weave.finishedSheet.editor}
              </Button>
              <Button variant="secondary" fullWidth onClick={weaveAgain}>
                {t.weave.finishedSheet.again}
              </Button>
              <button
                onClick={finished ? () => setFinishSheetOpen(false) : keepWeaving}
                className="py-2 text-sm font-semibold text-text-muted hover:text-text"
              >
                {finished ? t.weave.finishedSheet.close : t.weave.finishedSheet.keepWeaving}
              </button>
            </div>
          </div>
        </div>
      )}

      {pendingReset !== null && (
        <UndoToast message={t.weave.resetDone} onUndo={undoReset} onExpire={() => setPendingReset(null)} />
      )}
      {progressInvalidated && pendingReset === null && (
        <Toast message={t.weave.progressInvalidated} actionLabel={t.common.close} onAction={() => setProgressInvalidated(false)} />
      )}
    </div>
  )
}
