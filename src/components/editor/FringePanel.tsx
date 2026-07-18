import { Minus, Plus } from 'lucide-react'
import { useEditorStore } from '@/store/editorStore'
import { t } from '@/i18n/es'

export function FringePanel() {
  const { cols, fringe, setFringeLength, setFringeTurnBead, showFringeDivider, setShowFringeDivider } =
    useEditorStore()

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
