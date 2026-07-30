import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Hand, Moon, RefreshCw, Sun } from 'lucide-react'
import { usePatternsStore } from '@/store/patternsStore'
import { useWeaveStore } from '@/store/weaveStore'
import { useWeavePrefsStore } from '@/store/weavePrefsStore'
import {
  buildWeaveOrder,
  firstIndexOfNextBodyRow,
  firstIndexOfNextFringeColumn,
  isFringeStep,
  jumpTargetToIndex,
  totalBeadCount,
  beadsThrough,
  WEAVE_ORDER_VERSION,
  type JumpTarget,
} from '@/engine/weaveOrder'
import { buildWordChart, formatWordChartLineForDisplay } from '@/engine/wordChart'
import { normalizeFringe } from '@/engine/fringe'
import { normalizeRowShape } from '@/engine/shape'
import { paletteFromCells, letterForIndex } from '@/lib/palette'
import { useWakeLock } from '@/hooks/useWakeLock'
import { t } from '@/i18n/es'
import { WeaveCanvas } from '@/components/weave/WeaveCanvas'
import { HandsBusyView } from '@/components/weave/HandsBusyView'
import { Button } from '@/components/shared/Button'
import { IconButton } from '@/components/shared/IconButton'
import { UndoToast } from '@/components/shared/UndoToast'
import { Toast } from '@/components/shared/Toast'
import { InfoScreen } from '@/components/shared/InfoScreen'

/** Serializes a JumpTarget as an <option value> for the "Ir a" selector — plain numeric values can't tell a body row, a fringe column, and the foundation pass apart. */
function encodeJumpValue(target: JumpTarget): string {
  return `${target.kind}:${target.index}`
}

/** Inverse of encodeJumpValue — parses the selector's raw string value back into a JumpTarget. */
function decodeJumpValue(value: string): JumpTarget {
  const [kind, index] = value.split(':')
  return { kind: kind === 'fringe' ? 'fringe' : kind === 'foundation' ? 'foundation' : 'body', index: Number(index) }
}

export function WeavePage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const pattern = usePatternsStore((s) => (id ? s.patterns[id] : undefined))
  const { getIndex, getOrderVersion, setIndex, reset, loadProgress } = useWeaveStore()
  const { handsBusyMode, tapAnywhereToAdvance, setHandsBusyMode, setTapAnywhereToAdvance } = useWeavePrefsStore()
  const touchStartX = useRef<number | null>(null)
  // Captured index to restore if "Reiniciar" gets undone within the toast window.
  const [pendingReset, setPendingReset] = useState<number | null>(null)
  // Set once, the first time we notice a saved index was recorded under a since-corrected
  // traversal order — not undoable (the old index doesn't point at a meaningful bead any more).
  const [progressInvalidated, setProgressInvalidated] = useState(false)

  // The whole point of Weave Mode is a hands-busy session — keep the screen
  // on for as long as this page is mounted, not just in the hands-busy view.
  const wakeLock = useWakeLock(true)

  useEffect(() => {
    if (id) loadProgress(id)
  }, [id, loadProgress])

  const fringe = useMemo(
    () => normalizeFringe(pattern?.fringe, pattern?.config.cols ?? 0),
    [pattern?.fringe, pattern?.config.cols],
  )
  const rowShape = useMemo(
    () => (pattern?.rowShape ? normalizeRowShape(pattern.rowShape, pattern.config.cols, pattern.config.rows) : undefined),
    [pattern?.rowShape, pattern?.config.cols, pattern?.config.rows],
  )
  const order = useMemo(
    () =>
      pattern
        ? buildWeaveOrder(pattern.config.technique, pattern.config.cols, pattern.config.rows, fringe, rowShape)
        : [],
    [pattern, fringe, rowShape],
  )
  const technique = pattern?.config.technique ?? 'loom'
  const orderVersion = WEAVE_ORDER_VERSION[technique]
  const rows = pattern?.config.rows ?? 0
  const currentIndex = id ? getIndex(id) : -1
  const total = order.length
  const totalBeads = totalBeadCount(order)
  const beadsWoven = beadsThrough(order, currentIndex)
  const currentStep = order[currentIndex]
  const onFringe = currentStep ? isFringeStep(currentStep) : false
  const onFoundation = currentStep?.grouped ?? false
  const currentUnitIndex = currentStep ? currentStep.unit : 0
  const fringeColumns = useMemo(() => fringe.lengths.flatMap((len, col) => (len > 0 ? [col] : [])), [fringe])

  // A saved index from before this technique's traversal order was corrected points at a
  // completely different bead now — never silently misread it, reset and say so explicitly.
  useEffect(() => {
    if (!id || !pattern) return
    if (currentIndex < 0) return
    if (getOrderVersion(id) === orderVersion) return
    reset(id)
    setProgressInvalidated(true)
  }, [id, pattern, currentIndex, getOrderVersion, orderVersion, reset])

  const wordChartLines = useMemo(() => {
    if (!pattern) return []
    const palette = paletteFromCells(pattern.cells)
    const letterForHex = new Map(palette.map((p, i) => [p.hex, letterForIndex(i)]))
    return buildWordChart(
      technique,
      pattern.config.cols,
      pattern.config.rows,
      pattern.cells,
      (hex) => letterForHex.get(hex) ?? '?',
      fringe,
      rowShape,
    )
  }, [pattern, technique, fringe, rowShape])
  const currentLine = onFringe
    ? wordChartLines.find((l) => l.isFringe && l.unitIndex === currentStep.unit)
    : onFoundation
      ? wordChartLines.find((l) => l.grouped)
      : wordChartLines.find((l) => !l.isFringe && !l.grouped && l.unitIndex === currentUnitIndex)
  const currentLineText = formatWordChartLineForDisplay(currentLine?.text ?? '')

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!id) return
      if (e.key === 'ArrowRight' || e.key === ' ' || e.key === 'Enter') {
        e.preventDefault()
        setIndex(id, Math.min(total - 1, currentIndex + 1), orderVersion)
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault()
        setIndex(id, Math.max(-1, currentIndex - 1), orderVersion)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [id, currentIndex, total, orderVersion, setIndex])

  if (!pattern || !id) {
    return (
      <InfoScreen
        title={t.common.patternNotFound}
        message={t.common.patternNotFoundHint}
        action={{ label: t.common.goHome, onClick: () => navigate('/') }}
      />
    )
  }

  function advance() {
    setIndex(id!, Math.min(total - 1, currentIndex + 1), orderVersion)
  }
  function goBack() {
    setIndex(id!, Math.max(-1, currentIndex - 1), orderVersion)
  }
  function markUnitDone() {
    const nextStart = onFringe
      ? firstIndexOfNextFringeColumn(order, currentStep!.unit)
      : firstIndexOfNextBodyRow(order, currentIndex)
    setIndex(id!, nextStart === -1 ? total - 1 : nextStart - 1, orderVersion)
  }
  function jumpTo(target: JumpTarget) {
    const start = jumpTargetToIndex(order, target)
    if (start !== -1) setIndex(id!, start - 1, orderVersion)
  }
  function requestReset() {
    setPendingReset(currentIndex)
    reset(id!)
  }
  function undoReset() {
    if (pendingReset !== null) setIndex(id!, pendingReset, orderVersion)
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

  const currentRowLabel = onFringe
    ? t.weave.fringeColumnHeader(currentStep!.unit + 1)
    : onFoundation
      ? t.weave.foundationPass
      : currentStep?.isBaseRow
        ? t.weave.baseRow
        : `${t.weave.row} ${currentUnitIndex + 1}`
  // A discreet direction indicator — which way the needle moves along the current row (meaningless for fringe steps, which hang straight down).
  const directionArrow = !onFringe && currentStep ? (currentStep.direction === 'ltr' ? '→' : '←') : null
  const directionLabel = currentStep?.direction === 'ltr' ? t.weave.directionLtr : t.weave.directionRtl

  // "Ir a" selector: peyote's foundation pass collapses rows 1-2 into one option; brick's
  // widest row (the base row) keeps its numeric slot but reads "Fila base" instead of "Fila N".
  const rowJumpOptions: { target: JumpTarget; label: string }[] =
    technique === 'peyote' && rows >= 2
      ? [
          { target: { kind: 'foundation', index: 0 }, label: t.weave.foundationPass },
          ...Array.from({ length: rows - 2 }, (_, i) => ({
            target: { kind: 'body' as const, index: i + 2 },
            label: `${t.weave.row} ${i + 3}`,
          })),
        ]
      : Array.from({ length: rows }, (_, i) => ({
          target: { kind: 'body' as const, index: i },
          label: technique === 'brick' && i === rows - 1 ? t.weave.baseRow : `${t.weave.row} ${i + 1}`,
        }))

  const currentJumpValue = onFringe
    ? encodeJumpValue({ kind: 'fringe', index: currentStep!.unit })
    : onFoundation
      ? encodeJumpValue({ kind: 'foundation', index: 0 })
      : encodeJumpValue({ kind: 'body', index: currentUnitIndex })

  return (
    <div
      className="flex h-screen flex-col"
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
        <IconButton
          label={t.weave.handsBusyMode}
          active={handsBusyMode}
          onClick={() => setHandsBusyMode(!handsBusyMode)}
          className="h-9 w-9"
        >
          <Hand size={16} />
        </IconButton>
        <button onClick={requestReset} className="rounded-full px-3 py-1.5 text-xs text-text-muted hover:bg-surface-2">
          {t.weave.reset}
        </button>
      </header>

      <div className="relative min-h-0 flex-1">
        {handsBusyMode ? (
          <HandsBusyView
            unitLabel={onFringe ? t.weave.fringeUnitLabel : onFoundation ? t.weave.foundationPass : t.weave.row}
            unitIndex={onFringe ? currentStep!.unit : currentUnitIndex}
            unitCount={onFringe ? pattern.config.cols : rows}
            showCount={!onFoundation}
            hint={onFoundation ? t.weave.foundationPassHint(currentStep!.cells.length) : undefined}
            lineText={currentLineText}
            onAdvance={advance}
            tapAnywhere={tapAnywhereToAdvance}
            canAdvance={canAdvance}
          />
        ) : (
          <WeaveCanvas
            technique={pattern.config.technique}
            cols={pattern.config.cols}
            rows={pattern.config.rows}
            cells={pattern.cells}
            fringe={fringe}
            order={order}
            currentIndex={currentIndex}
            onTapNext={advance}
            staggerPhase={pattern.config.staggerPhase ?? 0}
          />
        )}
      </div>

      <footer className="flex flex-col gap-3 border-t border-border p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
        <div className="flex flex-wrap items-center justify-center gap-2">
          <label className="text-xs text-text-muted">{fringeColumns.length > 0 ? t.weave.jumpTo : t.weave.jumpToRow}</label>
          <select
            className="rounded-lg border border-border bg-surface-2 px-2 py-1 text-sm"
            value={currentJumpValue}
            onChange={(e) => jumpTo(decodeJumpValue(e.target.value))}
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
          </select>
          <button onClick={markUnitDone} className="rounded-full bg-surface-2 px-3 py-1.5 text-xs font-semibold hover:bg-surface-3">
            {onFringe ? t.weave.markFringeDone : onFoundation ? t.weave.markFoundationDone : t.weave.markRowDone}
          </button>
          {handsBusyMode && (
            <button
              onClick={() => setTapAnywhereToAdvance(!tapAnywhereToAdvance)}
              aria-pressed={tapAnywhereToAdvance}
              className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors
                ${tapAnywhereToAdvance ? 'bg-accent-500 text-accent-ink' : 'bg-surface-2 text-text-muted hover:bg-surface-3'}`}
            >
              {t.weave.tapToAdvance}
            </button>
          )}
        </div>
        <div className="flex items-center gap-3">
          <Button
            variant="secondary"
            fullWidth
            onClick={goBack}
            disabled={currentIndex < 0}
            className={handsBusyMode ? 'py-5 text-lg' : ''}
          >
            ← {t.weave.back}
          </Button>
          <Button fullWidth onClick={advance} disabled={!canAdvance} className={handsBusyMode ? 'py-5 text-lg' : ''}>
            {t.weave.next} →
          </Button>
        </div>
      </footer>

      {pendingReset !== null && (
        <UndoToast message={t.weave.resetDone} onUndo={undoReset} onExpire={() => setPendingReset(null)} />
      )}
      {progressInvalidated && pendingReset === null && (
        <Toast message={t.weave.progressInvalidated} actionLabel={t.common.close} onAction={() => setProgressInvalidated(false)} />
      )}
    </div>
  )
}
