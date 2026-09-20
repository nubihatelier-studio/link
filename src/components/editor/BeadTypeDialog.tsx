import { useEffect, useState } from 'react'
import { useEditorStore } from '@/store/editorStore'
import { BEAD_TYPES, getBeadType } from '@/data/beadTypes'
import { physicalSizeMm } from '@/engine/geometry'
import { formatSizeMm } from '@/engine/units'
import { maxFringeLength } from '@/engine/fringe'
import { loopBeadCount } from '@/engine/loop'
import { SelectableCard } from '@/components/shared/SelectableCard'
import { t } from '@/i18n/es'

/**
 * "Cambiar la mostacilla": which bead an existing pattern is woven with.
 *
 * Unlike "Cambiar tamaño" this never touches the design — not one painted
 * bead moves, and the weave progress stays where it was. What changes is the
 * finished piece's millimetres (and, underneath, which calibration row
 * applies — see `engine/calibration.ts`), which is why the dialog's whole job
 * is to show that measurement before and after.
 */
export function BeadTypeDialog({ onClose }: { onClose: () => void }) {
  const { technique, cols, rows, beadTypeId, fringe, loop, pair, setBeadType } = useEditorStore()
  const [chosen, setChosen] = useState(beadTypeId)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const sizeOf = (id: string) => {
    const { widthMm, heightMm } = physicalSizeMm(technique, cols, rows, getBeadType(id), maxFringeLength(fringe), loopBeadCount(loop))
    return formatSizeMm(widthMm, heightMm)
  }
  const unchanged = chosen === beadTypeId
  const sizeLabel = pair ? t.editor.beadType.sizeLabelPair : t.editor.beadType.sizeLabel

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/40 md:items-center md:justify-center" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="bead-type-title"
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[90dvh] w-full flex-col rounded-t-2xl bg-surface pb-[env(safe-area-inset-bottom)] md:max-h-[88vh] md:max-w-lg md:rounded-2xl md:pb-0"
      >
        <div className="shrink-0 px-4 pb-3 pt-4">
          <h2 id="bead-type-title" className="text-base font-semibold">
            {t.editor.beadType.title}
          </h2>
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-4 pb-4">
          <p className="text-sm text-text-muted">{t.editor.beadType.intro}</p>

          <div className="grid grid-cols-2 gap-3">
            {BEAD_TYPES.map((b) => (
              <SelectableCard key={b.id} selected={chosen === b.id} onClick={() => setChosen(b.id)} className="flex flex-col gap-1">
                <p className="font-semibold">{b.label}</p>
                <p className="text-xs text-text-muted">{t.editor.beadType.beadSize(b.widthMm, b.heightMm)}</p>
              </SelectableCard>
            ))}
          </div>

          <section className="flex flex-col gap-1.5" aria-live="polite">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-text-muted">{sizeLabel}</span>
            <div className="grid grid-cols-2 gap-3">
              <Size label={t.editor.beadType.now} value={sizeOf(beadTypeId)} />
              <Size label={t.editor.beadType.after} value={sizeOf(chosen)} highlight={!unchanged} />
            </div>
          </section>

          <p className="text-xs text-text-muted">{t.editor.beadType.notes}</p>
        </div>

        <div className="flex shrink-0 gap-2 border-t border-border px-4 py-3">
          <button onClick={onClose} className="h-11 flex-1 rounded-full bg-surface-2 text-sm font-semibold">
            {t.editor.beadType.cancel}
          </button>
          <button
            disabled={unchanged}
            onClick={() => {
              setBeadType(chosen)
              onClose()
            }}
            className="h-11 flex-1 rounded-full bg-accent-500 text-sm font-semibold text-accent-ink disabled:opacity-40"
          >
            {t.editor.beadType.apply}
          </button>
        </div>
      </div>
    </div>
  )
}

function Size({ label, value, highlight = false }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className={`flex flex-col gap-0.5 rounded-2xl border p-3 ${highlight ? 'border-accent-500' : 'border-border'}`}>
      <span className="text-xs text-text-muted">{label}</span>
      <span className="text-sm font-semibold tabular-nums">{value}</span>
    </div>
  )
}
