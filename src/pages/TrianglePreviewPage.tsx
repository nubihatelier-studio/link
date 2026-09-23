import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ROW_HEIGHT,
  triangleBeadCount,
  triangleBeadPlacement,
  triangleBeads,
  triangleBoundsUnits,
} from '@/engine/trianglePeyote'
import { beadMetrics } from '@/lib/beadStyle'
import { SliderField } from '@/components/shared/SliderField'
import { t } from '@/i18n/es'

/** Un color por sector, para que se vea cómo se reparte la pieza. */
const COLORES = ['#8050c0', '#4ab3a5', '#c9a227']

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
  const [side, setSide] = useState(13)
  const [porSector, setPorSector] = useState(true)

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

    const bounds = triangleBoundsUnits(side)
    const escala = (size * 0.94) / Math.max(bounds.width, bounds.height)
    const cx = size / 2
    const cy = size / 2 - ((side - 1) * ROW_HEIGHT * escala) / 2

    // Cuadrada, no rectangular: en esta retícula la mostacilla tiene
    // vecinas a la misma distancia en tres direcciones, así que una
    // rectangular se vería de un porte distinto en cada sector al girarla.
    const lado = escala * ROW_HEIGHT
    const m = beadMetrics(lado, lado, 0.5, 1.5)

    for (const bead of triangleBeads(side)) {
      const { x, y, angle, sector } = triangleBeadPlacement(bead, side)
      ctx.save()
      ctx.translate(cx + x * escala, cy + y * escala)
      ctx.rotate((angle * Math.PI) / 180)
      ctx.fillStyle = porSector ? COLORES[sector] : COLORES[bead.row % COLORES.length]
      ctx.strokeStyle = 'rgba(0,0,0,0.25)'
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.roundRect(-m.width / 2, -m.height / 2, m.width, m.height, m.radius)
      ctx.fill()
      ctx.stroke()
      ctx.restore()
    }
  }, [side, porSector])

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
        <SliderField label={t.trianglePreview.side} value={side} min={2} max={30} onChange={setSide} />
        <button
          onClick={() => setPorSector((v) => !v)}
          aria-pressed={porSector}
          className="self-start rounded-full bg-surface-2 px-4 py-2 text-sm font-semibold"
        >
          {porSector ? t.trianglePreview.bySector : t.trianglePreview.byRow}
        </button>
      </div>

      <dl className="flex flex-col gap-1.5 rounded-2xl bg-surface-2 px-3 py-2.5 text-sm">
        <div className="flex justify-between gap-3">
          <dt className="text-text-muted">{t.trianglePreview.perSide}</dt>
          <dd className="font-semibold tabular-nums">{side}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-text-muted">{t.trianglePreview.total}</dt>
          <dd className="font-semibold tabular-nums">{triangleBeadCount(side).toLocaleString('es')}</dd>
        </div>
      </dl>

      <p className="mt-4 text-xs text-text-muted">{t.trianglePreview.note}</p>
    </div>
  )
}
