import { Minus, Plus } from 'lucide-react'
import { useEditorStore } from '@/store/editorStore'
import { t } from '@/i18n/es'
import { ShapeIcon } from '@/components/icons/ShapeIcon'
import { BrickDropPicker } from '@/components/shared/BrickDropPicker'
import { dropOf } from '@/engine/geometry'

/** `inSheet`: shown in the phone's bottom sheet, which already carries the title and does the scrolling. */
export function ShapePanel({ inSheet = false }: { inSheet?: boolean } = {}) {
  const { rows, cols, rowShape, staggerPhase, growRowEdge, shrinkRowEdge, addRowAtTop, removeRowAtTop, setBrickDrop } = useEditorStore()
  // 2-drop/3-drop: rows go in stacks woven as one, so they're listed and edited by stack.
  const drop = dropOf(staggerPhase)
  const stacks = Math.ceil(rows / drop)

  return (
    <div className={`flex flex-col gap-3 p-4 ${inSheet ? '' : 'h-full overflow-y-auto'}`}>
      {!inSheet && (
        <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-text-muted">
          <ShapeIcon />
          {t.editor.shape.title}
        </h3>
      )}
      <section className="flex flex-col gap-2">
        <h4 className="text-xs font-semibold text-text-muted">{t.brickDrop.title}</h4>
        <BrickDropPicker value={drop} onChange={setBrickDrop} compact />
        <p className="text-[11px] text-text-muted">{t.editor.shape.dropHint}</p>
      </section>
      <p className="text-xs text-text-muted">{t.editor.shape.hint}</p>
      <div className="flex gap-2">
        <button
          onClick={addRowAtTop}
          className="flex-1 rounded-lg border border-border px-2 py-1.5 text-xs font-semibold text-text transition-colors hover:bg-surface-2"
        >
          {drop === 1 ? t.editor.shape.addRowTop : t.editor.shape.addRowsTop(drop)}
        </button>
        <button
          onClick={removeRowAtTop}
          disabled={rows <= drop}
          className="flex-1 rounded-lg border border-border px-2 py-1.5 text-xs font-semibold text-text transition-colors hover:bg-surface-2 disabled:opacity-40"
        >
          {drop === 1 ? t.editor.shape.removeRowTop : t.editor.shape.removeRowsTop(drop)}
        </button>
      </div>
      <ul className="flex flex-col gap-1.5">
        {Array.from({ length: stacks }, (_, stack) => {
          const row = stack * drop
          const lastRow = Math.min(rows, row + drop)
          const shape = rowShape[row] ?? { offset: 0, length: cols }
          return (
            <li key={row} className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-surface-2">
              <span className="w-[4.5rem] shrink-0 whitespace-nowrap text-xs text-text-muted">{t.editor.shape.rows(row + 1, lastRow)}</span>
              <button
                aria-label={t.editor.shape.shrinkLeft}
                onClick={() => shrinkRowEdge(row, 'left')}
                disabled={shape.length <= 1}
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-border text-text-muted transition-colors hover:bg-surface-3 disabled:opacity-40"
              >
                <Minus size={13} />
              </button>
              <button
                aria-label={t.editor.shape.growLeft}
                onClick={() => growRowEdge(row, 'left')}
                disabled={shape.offset <= 0}
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-border text-text-muted transition-colors hover:bg-surface-3 disabled:opacity-40"
              >
                <Plus size={13} />
              </button>
              <span className="w-6 shrink-0 text-center text-sm font-semibold">{shape.length}</span>
              <button
                aria-label={t.editor.shape.growRight}
                onClick={() => growRowEdge(row, 'right')}
                disabled={shape.offset + shape.length >= cols}
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-border text-text-muted transition-colors hover:bg-surface-3 disabled:opacity-40"
              >
                <Plus size={13} />
              </button>
              <button
                aria-label={t.editor.shape.shrinkRight}
                onClick={() => shrinkRowEdge(row, 'right')}
                disabled={shape.length <= 1}
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-border text-text-muted transition-colors hover:bg-surface-3 disabled:opacity-40"
              >
                <Minus size={13} />
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
