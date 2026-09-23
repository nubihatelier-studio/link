import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  beadsPerSide,
  ROUND_PITCH,
  triangleBeadCount,
  triangleBeadPlacement,
  triangleBeads,
  triangleBoundsUnits,
} from '@/engine/trianglePeyote'
import { beadMetrics } from '@/lib/beadStyle'
import { SliderField } from '@/components/shared/SliderField'
import { t } from '@/i18n/es'

/** Un color por lado, como los que usa ella para explicar la técnica. */
const COLORES = ['#2f6fd0', '#e2b93b', '#8050c0']
/** Las vueltas que ya no son la primera van en gris: lo que importa es la nueva. */
const YA_TEJIDO = '#c9c3ba'

/**
 * Prueba a la vista del triángulo de peyote, antes de construir nada
 * encima: sólo dibuja, no se puede pintar. Está para que la tejedora diga si
 * la geometría es la de su técnica — ver `engine/trianglePeyote.ts`.
 *
 * No hay link a esta pantalla en ninguna parte de la app: se llega
 * escribiendo la dirección.
 */
export function TrianglePreviewPage() {
  const navigate = useNavigate()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [rounds, setRounds] = useState(1)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const size = Math.min(canvas.parentElement?.clientWidth ?? 340, 520)
    const dpr = window.devicePixelRatio || 1
    canvas.width = size * dpr
    canvas.height = size * dpr
    canvas.style.width = `${size}px`
    canvas.style.height = `${size}px`
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, size, size)

    const bounds = triangleBoundsUnits(rounds)
    // Con pocas vueltas la pieza es chica: se dibuja grande igual, para poder
    // mirarla de cerca mientras se va armando paso a paso.
    const escala = Math.min((size * 0.94) / Math.max(bounds.width, bounds.height), size / 5)
    const cx = size / 2
    const cy = size / 2

    // Parada cruzada a su fila: angosta a lo largo de la fila y más alta
    // que el paso entre filas, que es lo que hace que una fila se encaje en
    // la de al lado, igual que en un gráfico de peyote.
    // Parada cruzada a su fila y más alta que el paso entre vueltas: así se
    // encaja en la vuelta de al lado, como en peyote.
    const m = beadMetrics(escala * 0.92, escala * ROUND_PITCH * 1.35, 0.5, 1.5)

    for (const bead of triangleBeads(rounds)) {
      const { x, y, angle, sector } = triangleBeadPlacement(bead)
      ctx.save()
      ctx.translate(cx + x * escala, cy + y * escala)
      ctx.rotate((angle * Math.PI) / 180)
      // La vuelta de más afuera va con un color por lado —azul, amarilla y
      // morada, como en sus diagramas—; lo ya tejido queda en gris.
      ctx.fillStyle = bead.round === rounds ? COLORES[sector] : YA_TEJIDO
      ctx.strokeStyle = 'rgba(0,0,0,0.25)'
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.roundRect(-m.width / 2, -m.height / 2, m.width, m.height, m.radius)
      ctx.fill()
      ctx.stroke()
      ctx.restore()
    }
  }, [rounds])

  return (
    <div className="mx-auto min-h-screen max-w-2xl px-4 pb-16 pt-[calc(2rem+env(safe-area-inset-top))] sm:px-8">
      <div className="mb-4 flex items-center gap-2">
        <button onClick={() => navigate('/')} aria-label={t.common.goHome} className="-ml-2 rounded-full p-2 text-lg hover:bg-surface-2">
          ←
        </button>
        <h1 className="text-xl font-bold">{t.trianglePreview.title}</h1>
      </div>

      <p className="mb-4 text-sm text-text-muted">{t.trianglePreview.intro}</p>

      <div className="mb-4 flex justify-center rounded-2xl border border-border bg-surface p-3">
        <canvas ref={canvasRef} />
      </div>

      <div className="mb-4 flex flex-col gap-3">
        <SliderField label={t.trianglePreview.rounds} value={rounds} min={1} max={20} onChange={setRounds} />
      </div>

      <dl className="flex flex-col gap-1.5 rounded-2xl bg-surface-2 px-3 py-2.5 text-sm">
        <div className="flex justify-between gap-3">
          <dt className="text-text-muted">{t.trianglePreview.perSide}</dt>
          <dd className="font-semibold tabular-nums">{beadsPerSide(rounds)}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-text-muted">{t.trianglePreview.total}</dt>
          <dd className="font-semibold tabular-nums">{triangleBeadCount(rounds).toLocaleString('es')}</dd>
        </div>
      </dl>

      <p className="mt-4 text-xs text-text-muted">{t.trianglePreview.note}</p>
    </div>
  )
}
