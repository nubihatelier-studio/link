import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Hand, Sun } from 'lucide-react'
import { usePatternsStore } from '@/store/patternsStore'
import { useWeaveStore } from '@/store/weaveStore'
import { useWeavePrefsStore } from '@/store/weavePrefsStore'
import { buildWeaveOrder, firstIndexOfUnit, unitIndexOf, weaveUnit } from '@/engine/weaveOrder'
import { buildWordChart, formatWordChartLineForDisplay } from '@/engine/wordChart'
import { paletteFromCells, letterForIndex } from '@/lib/palette'
import { useWakeLock } from '@/hooks/useWakeLock'
import { t } from '@/i18n/es'
import { WeaveCanvas } from '@/components/weave/WeaveCanvas'
import { HandsBusyView } from '@/components/weave/HandsBusyView'
import { Button } from '@/components/shared/Button'
import { IconButton } from '@/components/shared/IconButton'
import { UndoToast } from '@/components/shared/UndoToast'

export function WeavePage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const pattern = usePatternsStore((s) => (id ? s.patterns[id] : undefined))
  const { getIndex, setIndex, reset, loadProgress } = useWeaveStore()
  const { handsBusyMode, tapAnywhereToAdvance, setHandsBusyMode, setTapAnywhereToAdvance } = useWeavePrefsStore()
  const touchStartX = useRef<number | null>(null)
  // Captured index to restore if "Reiniciar" gets undone within the toast window.
  const [pendingReset, setPendingReset] = useState<number | null>(null)

  // The whole point of Weave Mode is a hands-busy session — keep the screen
  // on for as long as this page is mounted, not just in the hands-busy view.
  const wakeLock = useWakeLock(true)

  useEffect(() => {
    if (id) loadProgress(id)
  }, [id, loadProgress])

  const order = useMemo(
    () => (pattern ? buildWeaveOrder(pattern.config.technique, pattern.config.cols, pattern.config.rows) : []),
    [pattern],
  )
  const technique = pattern?.config.technique ?? 'loom'
  const unit = weaveUnit(technique)
  const unitLabel = unit === 'column' ? t.weave.column : t.weave.row
  const currentIndex = id ? getIndex(id) : -1
  const total = order.length
  const currentUnitIndex = order[currentIndex] ? unitIndexOf(technique, order[currentIndex]) : 0
  const unitCount = unit === 'column' ? (pattern?.config.cols ?? 0) : (pattern?.config.rows ?? 0)

  const wordChartLines = useMemo(() => {
    if (!pattern) return []
    const palette = paletteFromCells(pattern.cells)
    const letterForHex = new Map(palette.map((p, i) => [p.hex, letterForIndex(i)]))
    return buildWordChart(technique, pattern.config.cols, pattern.config.rows, pattern.cells, (hex) => letterForHex.get(hex) ?? '?')
  }, [pattern, technique])
  const currentLineText = formatWordChartLineForDisplay(wordChartLines[currentUnitIndex]?.text ?? '')

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!id) return
      if (e.key === 'ArrowRight' || e.key === ' ' || e.key === 'Enter') {
        e.preventDefault()
        setIndex(id, Math.min(total - 1, currentIndex + 1))
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault()
        setIndex(id, Math.max(-1, currentIndex - 1))
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [id, currentIndex, total, setIndex])

  if (!pattern || !id) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4">
        <p className="text-text-muted">{t.common.patternNotFound}</p>
        <Button onClick={() => navigate('/')}>{t.common.goHome}</Button>
      </div>
    )
  }

  function advance() {
    setIndex(id!, Math.min(total - 1, currentIndex + 1))
  }
  function goBack() {
    setIndex(id!, Math.max(-1, currentIndex - 1))
  }
  function markUnitDone() {
    const nextStart = firstIndexOfUnit(technique, order, currentUnitIndex + 1)
    setIndex(id!, nextStart === -1 ? total - 1 : nextStart - 1)
  }
  function jumpToUnit(unitIdx: number) {
    const start = firstIndexOfUnit(technique, order, unitIdx)
    if (start !== -1) setIndex(id!, start - 1)
  }
  function requestReset() {
    setPendingReset(currentIndex)
    reset(id!)
  }
  function undoReset() {
    if (pendingReset !== null) setIndex(id!, pendingReset)
    setPendingReset(null)
  }

  const canAdvance = currentIndex < total - 1

  return (
    <div
      className="flex h-screen flex-col"
      onTouchStart={(e) => (touchStartX.current = e.touches[0].clientX)}
      onTouchEnd={(e) => {
        if (touchStartX.current == null) return
        const dx = e.changedTouches[0].clientX - touchStartX.current
        if (Math.abs(dx) > 50) (dx < 0 ? advance() : goBack())
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
            {unitLabel} {currentUnitIndex + 1} · {Math.max(0, currentIndex + 1)} / {total} {t.weave.beadsWoven}
          </p>
        </div>
        {wakeLock.isSupported && (
          <span
            title={wakeLock.isActive ? t.weave.wakeLockActive : t.weave.wakeLockInactive}
            className={`flex h-8 w-8 items-center justify-center rounded-full ${wakeLock.isActive ? 'text-accent-500' : 'text-text-soft'}`}
          >
            <Sun size={16} />
          </span>
        )}
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
            unitLabel={unitLabel}
            unitIndex={currentUnitIndex}
            unitCount={unitCount}
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
            order={order}
            currentIndex={currentIndex}
            onTapNext={advance}
          />
        )}
      </div>

      <footer className="flex flex-col gap-3 border-t border-border p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
        <div className="flex flex-wrap items-center justify-center gap-2">
          <label className="text-xs text-text-muted">
            {unit === 'column' ? t.weave.jumpToColumn : t.weave.jumpToRow}
          </label>
          <select
            className="rounded-lg border border-border bg-surface-2 px-2 py-1 text-sm"
            value={currentUnitIndex}
            onChange={(e) => jumpToUnit(Number(e.target.value))}
          >
            {Array.from({ length: unitCount }, (_, i) => (
              <option key={i} value={i}>
                {unitLabel} {i + 1}
              </option>
            ))}
          </select>
          <button onClick={markUnitDone} className="rounded-full bg-surface-2 px-3 py-1.5 text-xs font-semibold hover:bg-surface-3">
            {unit === 'column' ? t.weave.markColumnDone : t.weave.markRowDone}
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
    </div>
  )
}
