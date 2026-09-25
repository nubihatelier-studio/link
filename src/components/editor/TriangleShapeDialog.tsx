import { useEffect, useState } from 'react'
import { useEditorStore } from '@/store/editorStore'
import { beadsPerSide, MAX_TRIANGLE_ROUNDS, triangleBeadCount } from '@/engine/trianglePeyote'
import { SliderField } from '@/components/shared/SliderField'
import { SelectableCard } from '@/components/shared/SelectableCard'
import { Button } from '@/components/shared/Button'
import { t } from '@/i18n/es'

/**
 * "Forma del aro": de qué porte es y hacia dónde mira la punta. Ocupa el
 * lugar que en la grilla tienen "Cambiar tamaño" y la pestaña "Forma del
 * cuerpo", porque acá no hay filas ni columnas que cambiar — la pieza crece
 * de a una vuelta desde el centro.
 *
 * Ninguna de las dos cosas es un paso de deshacer y ninguna pierde nada: las
 * vueltas que se van al achicarlo guardan lo pintado y vuelve tal cual al
 * agrandarlo, y dar vuelta la punta gira la pieza entera sin mover una sola
 * mostacilla. El mismo control las devuelve como estaban.
 */
export function TriangleShapeDialog({ onClose }: { onClose: () => void }) {
  const rounds = useEditorStore((s) => s.rounds)
  const setRounds = useEditorStore((s) => s.setRounds)
  const triangleUp = useEditorStore((s) => s.triangleUp)
  const setTriangleUp = useEditorStore((s) => s.setTriangleUp)
  const [vueltas, setVueltas] = useState(rounds)
  const [puntaArriba, setPuntaArriba] = useState(triangleUp)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const sinCambios = vueltas === rounds && puntaArriba === triangleUp

  function aplicar() {
    setRounds(vueltas)
    setTriangleUp(puntaArriba)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/40 md:items-center md:justify-center" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="triangle-shape-title"
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[90dvh] w-full flex-col gap-4 overflow-y-auto rounded-t-2xl bg-surface p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] md:max-w-sm md:rounded-2xl md:pb-4"
      >
        <div>
          <h2 id="triangle-shape-title" className="text-base font-semibold">
            {t.editor.triangleShape.title}
          </h2>
          <p className="text-xs text-text-muted">{t.editor.triangleShape.hint}</p>
        </div>

        <SliderField label={t.editor.triangleShape.rounds} value={vueltas} min={1} max={MAX_TRIANGLE_ROUNDS} onChange={setVueltas} />

        <div>
          <p className="mb-2 text-sm font-semibold">{t.editor.triangleShape.tip}</p>
          <div className="grid grid-cols-2 gap-3">
            {([true, false] as const).map((arriba) => (
              <SelectableCard
                key={String(arriba)}
                selected={puntaArriba === arriba}
                onClick={() => setPuntaArriba(arriba)}
                className="flex flex-col items-center gap-2 py-4 text-center"
              >
                <span aria-hidden="true" className="text-2xl leading-none text-text-muted">
                  {arriba ? '▲' : '▼'}
                </span>
                <span className="text-sm font-semibold">
                  {arriba ? t.editor.triangleShape.tipUp : t.editor.triangleShape.tipDown}
                </span>
              </SelectableCard>
            ))}
          </div>
        </div>

        <dl className="flex flex-col gap-1.5 rounded-2xl bg-surface-2 px-3 py-2.5 text-sm">
          <div className="flex justify-between gap-3">
            <dt className="text-text-muted">{t.editor.triangleShape.perSide}</dt>
            <dd className="font-semibold tabular-nums">{beadsPerSide(vueltas)}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-text-muted">{t.editor.triangleShape.total}</dt>
            <dd className="font-semibold tabular-nums">{triangleBeadCount(vueltas)}</dd>
          </div>
        </dl>

        <div className="flex gap-2">
          <button onClick={onClose} className="h-11 flex-1 rounded-full bg-surface-2 text-sm font-semibold">
            {t.editor.chooser.cancel}
          </button>
          <Button onClick={aplicar} disabled={sinCambios} className="h-11 flex-1 text-sm">
            {t.editor.triangleShape.apply}
          </Button>
        </div>
      </div>
    </div>
  )
}
