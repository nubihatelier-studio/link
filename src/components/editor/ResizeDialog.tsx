import { useEffect, useMemo, useState } from 'react'
import { useEditorStore } from '@/store/editorStore'
import type { PatternConfig, PatternDoc } from '@/engine/types'
import { dropOf, withStagger } from '@/engine/geometry'
import { resizePiece, type ColumnSide, type RowSide } from '@/engine/resize'
import { SliderField } from '@/components/shared/SliderField'
import { SegmentedControl } from '@/components/shared/SegmentedControl'
import { PatternThumb } from '@/components/shared/PatternThumb'
import { ColumnsIcon } from '@/components/icons/ColumnsIcon'
import { RowsIcon } from '@/components/icons/RowsIcon'
import { t } from '@/i18n/es'

/** Same bounds as "Crear patrón". */
const MIN_DIM = 1
const MAX_DIM = 200

/**
 * "Cambiar tamaño": the new number of columns and rows, where they go, and
 * — before anything happens — the pattern as it is next to the pattern as it
 * will be, plus how many painted beads would fall outside. Nothing changes
 * until "Cambiar tamaño" is pressed, and that is one undo step away from
 * being undone.
 */
export function ResizeDialog({ onClose }: { onClose: () => void }) {
  const { technique, cols, rows, cells, fringe, rowShape, staggerPhase, pair, loop, beadTypeId, resizePattern } = useEditorStore()
  const [newCols, setNewCols] = useState(cols)
  const [newRows, setNewRows] = useState(rows)
  const [colSide, setColSide] = useState<ColumnSide>('both')
  const [rowSide, setRowSide] = useState<RowSide>('bottom')
  // Brick 2-drop/3-drop rows go in stacks: step by a whole stack.
  const rowStep = technique === 'brick' ? dropOf(staggerPhase) : 1

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const result = useMemo(
    () => resizePiece({ technique, cols, rows, cells, fringe, rowShape, staggerPhase, pair }, { cols: newCols, rows: newRows, colSide, rowSide }),
    [technique, cols, rows, cells, fringe, rowShape, staggerPhase, pair, newCols, newRows, colSide, rowSide],
  )

  const asDoc = (d: { cols: number; rows: number; cells: PatternDoc['cells']; fringe: PatternDoc['fringe']; rowShape: PatternDoc['rowShape']; staggerPhase: typeof staggerPhase }): PatternDoc => ({
    id: 'preview',
    name: '',
    config: withStagger<PatternConfig>({ technique, cols: d.cols, rows: d.rows, beadTypeId }, d.staggerPhase),
    cells: d.cells,
    fringe: d.fringe,
    rowShape: d.rowShape,
    loop,
    createdAt: 0,
    updatedAt: 0,
  })
  const before = asDoc({ cols, rows, cells, fringe, rowShape, staggerPhase })
  const after = asDoc(result)
  const unchanged = newCols === cols && newRows === rows

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/40 md:items-center md:justify-center" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="resize-title"
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[90dvh] w-full flex-col rounded-t-2xl bg-surface pb-[env(safe-area-inset-bottom)] md:max-h-[88vh] md:max-w-lg md:rounded-2xl md:pb-0"
      >
        <div className="shrink-0 px-4 pb-3 pt-4">
          <h2 id="resize-title" className="text-base font-semibold">
            {t.editor.resize.title}
          </h2>
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-4 pb-4">
          <div className="grid grid-cols-2 gap-3">
            <Preview label={t.editor.resize.now} doc={before} />
            <Preview label={t.editor.resize.after} doc={after} highlight />
          </div>

          <p className={`text-sm ${result.lost > 0 ? 'font-semibold text-warning' : 'text-text-muted'}`} role="status">
            {result.lost > 0 ? t.editor.resize.lost(result.lost) : t.editor.resize.noLoss}
          </p>

          <section className="flex flex-col gap-3">
            <SliderField label={t.configurator.columns} icon={<ColumnsIcon />} value={newCols} min={MIN_DIM} max={MAX_DIM} onChange={setNewCols} />
            <div className="flex flex-col gap-1.5">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-text-muted">{t.editor.resize.colSideLabel}</span>
              <SegmentedControl<ColumnSide>
                ariaLabel={t.editor.resize.colSideLabel}
                size="sm"
                value={colSide}
                onChange={setColSide}
                options={[
                  { value: 'left', label: t.editor.resize.left },
                  { value: 'both', label: t.editor.resize.both },
                  { value: 'right', label: t.editor.resize.right },
                ]}
              />
            </div>
          </section>

          <section className="flex flex-col gap-3">
            <SliderField label={t.configurator.rows} icon={<RowsIcon />} value={newRows} min={MIN_DIM} max={MAX_DIM} step={rowStep} onChange={setNewRows} />
            <div className="flex flex-col gap-1.5">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-text-muted">{t.editor.resize.rowSideLabel}</span>
              <SegmentedControl<RowSide>
                ariaLabel={t.editor.resize.rowSideLabel}
                size="sm"
                value={rowSide}
                onChange={setRowSide}
                options={[
                  { value: 'top', label: t.editor.resize.top },
                  { value: 'bottom', label: t.editor.resize.bottom },
                ]}
              />
            </div>
          </section>

          <p className="text-xs text-text-muted">{t.editor.resize.notes}</p>
        </div>

        <div className="flex shrink-0 gap-2 border-t border-border px-4 py-3">
          <button onClick={onClose} className="h-11 flex-1 rounded-full bg-surface-2 text-sm font-semibold">
            {t.editor.resize.cancel}
          </button>
          <button
            disabled={unchanged}
            onClick={() => {
              resizePattern({ cols: newCols, rows: newRows, colSide, rowSide })
              onClose()
            }}
            className="h-11 flex-1 rounded-full bg-accent-500 text-sm font-semibold text-accent-ink disabled:opacity-40"
          >
            {t.editor.resize.apply}
          </button>
        </div>
      </div>
    </div>
  )
}

function Preview({ label, doc, highlight = false }: { label: string; doc: PatternDoc; highlight?: boolean }) {
  return (
    <figure className={`flex flex-col items-center gap-1.5 rounded-2xl border p-2 ${highlight ? 'border-accent-500' : 'border-border'}`}>
      <span className="flex aspect-square w-full items-center justify-center overflow-hidden rounded-xl bg-surface-2">
        <PatternThumb pattern={doc} size={140} />
      </span>
      <figcaption className="text-xs font-semibold">
        {label} · {doc.config.cols} × {doc.config.rows}
      </figcaption>
    </figure>
  )
}
