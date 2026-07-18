import { useState } from 'react'
import { Minus, Plus } from 'lucide-react'
import { useEditorStore } from '@/store/editorStore'
import { createFringeLengthShape, maxFringeLength, MAX_FRINGE_LENGTH, type FringeSculptShape } from '@/engine/fringe'
import { t } from '@/i18n/es'

const QUICK_SHAPES: { shape: FringeSculptShape; label: string }[] = [
  { shape: 'v', label: t.editor.fringe.shapeV },
  { shape: 'vInverted', label: t.editor.fringe.shapeVInverted },
  { shape: 'diagonalLR', label: t.editor.fringe.shapeDiagonalLR },
  { shape: 'diagonalRL', label: t.editor.fringe.shapeDiagonalRL },
  { shape: 'curve', label: t.editor.fringe.shapeCurve },
]

export function FringePanel() {
  const {
    cols,
    fringe,
    setFringeLength,
    setFringeTurnBead,
    sculptFringeLengths,
    showFringeDivider,
    setShowFringeDivider,
    fringeSculptMode,
    setFringeSculptMode,
    fringeSymmetric,
    setFringeSymmetric,
  } = useEditorStore()
  const [shapeMin, setShapeMin] = useState(1)
  const [shapeMax, setShapeMax] = useState(() => Math.max(4, maxFringeLength(fringe)))

  function applyQuickShape(shape: FringeSculptShape) {
    sculptFringeLengths(createFringeLengthShape(shape, cols, shapeMin, shapeMax))
  }

  return (
    <div className="flex h-full flex-col gap-3 overflow-y-auto p-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-text-muted">{t.editor.fringe.title}</h3>
        <button
          aria-label={t.editor.fringe.showDivider}
          title={t.editor.fringe.showDividerHint}
          onClick={() => setShowFringeDivider(!showFringeDivider)}
          aria-pressed={showFringeDivider}
          className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold transition-colors
            ${showFringeDivider ? 'bg-accent-500 text-accent-ink' : 'bg-surface-2 text-text-muted hover:bg-surface-3'}`}
        >
          {t.editor.fringe.showDivider}
        </button>
      </div>

      <div className="flex flex-col gap-2 rounded-lg border border-border p-2.5">
        <h4 className="text-[11px] font-semibold uppercase tracking-wide text-text-muted">
          {t.editor.fringe.quickShapesTitle}
        </h4>
        <p className="text-[11px] text-text-muted">{t.editor.fringe.quickShapesHint}</p>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-1.5 text-xs text-text-muted">
            {t.editor.fringe.minLength}
            <input
              type="number"
              min={0}
              max={MAX_FRINGE_LENGTH}
              value={shapeMin}
              onChange={(e) => setShapeMin(Math.max(0, Math.min(MAX_FRINGE_LENGTH, Number(e.target.value) || 0)))}
              className="w-14 rounded-md border border-border bg-surface-1 px-1.5 py-1 text-center text-xs"
            />
          </label>
          <label className="flex items-center gap-1.5 text-xs text-text-muted">
            {t.editor.fringe.maxLength}
            <input
              type="number"
              min={0}
              max={MAX_FRINGE_LENGTH}
              value={shapeMax}
              onChange={(e) => setShapeMax(Math.max(0, Math.min(MAX_FRINGE_LENGTH, Number(e.target.value) || 0)))}
              className="w-14 rounded-md border border-border bg-surface-1 px-1.5 py-1 text-center text-xs"
            />
          </label>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {QUICK_SHAPES.map(({ shape, label }) => (
            <button
              key={shape}
              onClick={() => applyQuickShape(shape)}
              className="rounded-md border border-border px-2.5 py-1 text-xs font-medium text-text-primary transition-colors hover:bg-surface-3"
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-1.5 rounded-lg border border-border p-2.5">
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setFringeSculptMode(!fringeSculptMode)}
            aria-pressed={fringeSculptMode}
            className={`rounded-md px-2.5 py-1.5 text-xs font-semibold transition-colors
              ${fringeSculptMode ? 'bg-accent-500 text-accent-ink' : 'bg-surface-2 text-text-muted hover:bg-surface-3'}`}
          >
            {t.editor.fringe.sculptMode}
          </button>
          <button
            onClick={() => setFringeSymmetric(!fringeSymmetric)}
            aria-pressed={fringeSymmetric}
            title={t.editor.fringe.symmetricHint}
            className={`rounded-md px-2.5 py-1.5 text-xs font-semibold transition-colors
              ${fringeSymmetric ? 'bg-accent-500 text-accent-ink' : 'bg-surface-2 text-text-muted hover:bg-surface-3'}`}
          >
            {t.editor.fringe.symmetric}
          </button>
        </div>
        {fringeSculptMode && <p className="text-[11px] text-text-muted">{t.editor.fringe.sculptHint}</p>}
      </div>

      <ul className="flex flex-col gap-1.5">
        {Array.from({ length: cols }, (_, col) => {
          const length = fringe.lengths[col] ?? 0
          const isTurnBead = fringe.turnBeads[col] ?? false
          return (
            <li key={col} className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-surface-2">
              <span className="w-20 shrink-0 truncate text-xs text-text-muted">{t.editor.fringe.column(col + 1)}</span>
              <button
                aria-label={t.editor.fringe.decreaseLength}
                onClick={() => setFringeLength(col, length - 1)}
                disabled={length === 0}
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-border text-text-muted transition-colors hover:bg-surface-3 disabled:opacity-40"
              >
                <Minus size={13} />
              </button>
              <span className="w-6 shrink-0 text-center text-sm font-semibold">{length}</span>
              <button
                aria-label={t.editor.fringe.increaseLength}
                onClick={() => setFringeLength(col, length + 1)}
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-border text-text-muted transition-colors hover:bg-surface-3"
              >
                <Plus size={13} />
              </button>
              <button
                aria-label={t.editor.fringe.turnBead}
                title={t.editor.fringe.turnBeadHint}
                onClick={() => setFringeTurnBead(col, !isTurnBead)}
                disabled={length === 0}
                aria-pressed={isTurnBead}
                className={`ml-auto shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold transition-colors disabled:opacity-40
                  ${isTurnBead ? 'bg-accent-500 text-accent-ink' : 'bg-surface-2 text-text-muted hover:bg-surface-3'}`}
              >
                {t.editor.fringe.turnBead}
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
