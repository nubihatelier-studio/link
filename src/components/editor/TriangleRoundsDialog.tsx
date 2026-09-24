import { useEffect, useState } from 'react'
import { useEditorStore } from '@/store/editorStore'
import { beadsPerSide, triangleBeadCount } from '@/engine/trianglePeyote'
import { SliderField } from '@/components/shared/SliderField'
import { Button } from '@/components/shared/Button'
import { t } from '@/i18n/es'

/** Hasta dónde llega el deslizador — más allá de esto ya no es un aro. */
const MAX_ROUNDS = 30

/**
 * "Vueltas": de qué porte es el aro triangular. Ocupa el lugar que en la
 * grilla tiene "Cambiar tamaño", porque acá no hay filas ni columnas que
 * cambiar — la pieza crece de a una vuelta desde el centro.
 *
 * No se pierde nada al achicarla: lo pintado en las vueltas que se van queda
 * guardado y vuelve tal cual al agrandarla, así que tampoco es un paso de
 * deshacer.
 */
export function TriangleRoundsDialog({ onClose }: { onClose: () => void }) {
  const rounds = useEditorStore((s) => s.rounds)
  const setRounds = useEditorStore((s) => s.setRounds)
  const [vueltas, setVueltas] = useState(rounds)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  function aplicar() {
    setRounds(vueltas)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/40 md:items-center md:justify-center" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="triangle-rounds-title"
        onClick={(e) => e.stopPropagation()}
        className="flex w-full flex-col gap-4 rounded-t-2xl bg-surface p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] md:max-w-sm md:rounded-2xl md:pb-4"
      >
        <div>
          <h2 id="triangle-rounds-title" className="text-base font-semibold">
            {t.editor.triangleRounds.title}
          </h2>
          <p className="text-xs text-text-muted">{t.editor.triangleRounds.hint}</p>
        </div>

        <SliderField label={t.editor.triangleRounds.label} value={vueltas} min={1} max={MAX_ROUNDS} onChange={setVueltas} />

        <dl className="flex flex-col gap-1.5 rounded-2xl bg-surface-2 px-3 py-2.5 text-sm">
          <div className="flex justify-between gap-3">
            <dt className="text-text-muted">{t.editor.triangleRounds.perSide}</dt>
            <dd className="font-semibold tabular-nums">{beadsPerSide(vueltas)}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-text-muted">{t.editor.triangleRounds.total}</dt>
            <dd className="font-semibold tabular-nums">{triangleBeadCount(vueltas)}</dd>
          </div>
        </dl>

        <div className="flex gap-2">
          <button onClick={onClose} className="h-11 flex-1 rounded-full bg-surface-2 text-sm font-semibold">
            {t.editor.chooser.cancel}
          </button>
          <Button onClick={aplicar} disabled={vueltas === rounds} className="h-11 flex-1 text-sm">
            {t.editor.triangleRounds.apply}
          </Button>
        </div>
      </div>
    </div>
  )
}
