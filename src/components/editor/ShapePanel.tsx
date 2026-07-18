import { Minus, Plus } from 'lucide-react'
import { useEditorStore } from '@/store/editorStore'
import { t } from '@/i18n/es'

export function ShapePanel() {
  const { rows, cols, rowShape, growRowEdge, shrinkRowEdge } = useEditorStore()

  return (
    <div className="flex h-full flex-col gap-3 overflow-y-auto p-4">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-text-muted">{t.editor.shape.title}</h3>
      <p className="text-xs text-text-muted">{t.editor.shape.hint}</p>
      <ul className="flex flex-col gap-1.5">
        {Array.from({ length: rows }, (_, row) => {
          const shape = rowShape[row] ?? { offset: 0, length: cols }
          return (
            <li key={row} className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-surface-2">
              <span className="w-14 shrink-0 truncate text-xs text-text-muted">{t.editor.shape.row(row + 1)}</span>
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
