import { useEffect, useState } from 'react'
import { Copy, Check } from 'lucide-react'
import { useEditorStore } from '@/store/editorStore'
import { usePatternLetters } from '@/hooks/usePatternLetters'
import { getBeadType } from '@/data/beadTypes'
import { totalFringeBeadCount } from '@/engine/fringe'
import { estimateThreadMeters, gramsForBeads, suggestedNeedle } from '@/lib/materials'
import { contrastTextColor, nearestCatalogColors } from '@/lib/color'
import { describeColor } from '@/lib/colorName'
import { t } from '@/i18n/es'

/** Cuántos códigos parecidos caben por color sin que la lista deje de leerse. */
const CODIGOS_POR_COLOR = 2

/**
 * "Lista de compras": lo que hay que ir a comprar para tejer este patrón —
 * cada color con su cantidad y sus gramos, los códigos que se le parecen
 * para buscarlos en la tienda, el hilo y la aguja.
 *
 * Los gramos son una estimación por geometría (ver `materials.ts`), no una
 * medición, y lo dice. Se puede copiar como texto porque el pedido a la
 * tienda se hace por mensaje.
 */
export function ShoppingListDialog({ onClose }: { onClose: () => void }) {
  const { technique, cols, rows, rowShape, fringe, loop, pair, beadTypeId } = useEditorStore()
  const letters = usePatternLetters()
  const bead = getBeadType(beadTypeId)
  const [copiado, setCopiado] = useState(false)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const filas = letters.map((l) => ({
    ...l,
    nombre: describeColor(l.hex),
    gramos: gramsForBeads(l.count, bead),
    codigos: nearestCatalogColors(l.hex, CODIGOS_POR_COLOR).map((c) => c.code),
  }))
  const total = filas.reduce((n, f) => n + f.count, 0)
  const hilo = estimateThreadMeters(technique, cols, rows, bead.widthMm, totalFringeBeadCount(fringe), rowShape) * (pair ? 2 : 1)
  const argollaMetal = loop?.variant === 'metal'

  function copiar() {
    const lineas = [
      t.editor.shopping.title,
      ...filas.map((f) => `${f.letter} · ${f.nombre} · ${t.editor.shopping.beads(f.count)} · ${t.editor.shopping.grams(f.gramos)}${f.codigos.length ? ` · ${f.codigos.join(' o ')}` : ''}`),
      ...(argollaMetal ? [pair ? t.pdf.metalLoopMaterialPair : t.pdf.metalLoopMaterial] : []),
      `${t.editor.shopping.thread}: ${hilo.toFixed(1)} m`,
      `${t.editor.shopping.needle}: ${suggestedNeedle(bead)}`,
    ]
    navigator.clipboard?.writeText(lineas.join('\n')).then(
      () => {
        setCopiado(true)
        setTimeout(() => setCopiado(false), 2000)
      },
      () => setCopiado(false),
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/40 md:items-center md:justify-center" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="shopping-title"
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[90dvh] w-full flex-col rounded-t-2xl bg-surface pb-[env(safe-area-inset-bottom)] md:max-h-[88vh] md:max-w-lg md:rounded-2xl md:pb-0"
      >
        <div className="shrink-0 px-4 pb-2 pt-4">
          <h2 id="shopping-title" className="text-base font-semibold">
            {t.editor.shopping.title}
          </h2>
          <p className="text-xs text-text-muted">
            {pair ? t.editor.shopping.pairNote : t.editor.shopping.beads(total)}
          </p>
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 pb-4">
          {filas.length === 0 ? (
            <p className="py-6 text-center text-sm text-text-muted">{t.editor.shopping.empty}</p>
          ) : (
            <ul className="flex flex-col divide-y divide-border overflow-hidden rounded-2xl border border-border">
              {filas.map((f) => (
                <li key={f.hex} className="flex items-center gap-3 px-3 py-2.5">
                  <span
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-black/10 text-xs font-bold"
                    style={{ backgroundColor: f.hex, color: contrastTextColor(f.hex) }}
                  >
                    {f.letter}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">{f.nombre}</span>
                    {f.codigos.length > 0 && (
                      <span className="block truncate text-[11px] text-text-muted">{f.codigos.join(' · ')}</span>
                    )}
                  </span>
                  <span className="shrink-0 text-right">
                    <span className="block text-sm font-semibold tabular-nums">{t.editor.shopping.grams(f.gramos)}</span>
                    <span className="block text-[11px] tabular-nums text-text-muted">{t.editor.shopping.beads(f.count)}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}

          <dl className="flex flex-col gap-1.5 rounded-2xl bg-surface-2 px-3 py-2.5 text-sm">
            {argollaMetal && (
              <div className="flex justify-between gap-3">
                <dt className="text-text-muted">{t.editor.loop.shortTitle}</dt>
                <dd className="font-semibold">{pair ? t.pdf.metalLoopMaterialPair : t.pdf.metalLoopMaterial}</dd>
              </div>
            )}
            <div className="flex justify-between gap-3">
              <dt className="text-text-muted">{t.editor.shopping.thread}</dt>
              <dd className="font-semibold tabular-nums">{hilo.toFixed(1)} m</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-text-muted">{t.editor.shopping.needle}</dt>
              <dd className="text-right font-semibold">{suggestedNeedle(bead)}</dd>
            </div>
          </dl>

          <p className="text-[11px] text-text-muted">{t.editor.shopping.estimate}</p>
        </div>

        <div className="flex shrink-0 gap-2 border-t border-border px-4 py-3">
          <button onClick={onClose} className="h-11 flex-1 rounded-full bg-surface-2 text-sm font-semibold">
            {t.editor.shopping.close}
          </button>
          <button
            onClick={copiar}
            disabled={filas.length === 0}
            className="flex h-11 flex-1 items-center justify-center gap-2 rounded-full bg-accent-500 text-sm font-semibold text-accent-ink disabled:opacity-40"
          >
            {copiado ? <Check size={16} /> : <Copy size={16} />}
            {copiado ? t.editor.shopping.copied : t.editor.shopping.copy}
          </button>
        </div>
      </div>
    </div>
  )
}
