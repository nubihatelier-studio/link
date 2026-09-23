import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  beadsPerSide,
  roundBeadCount,
  triangleBeadCount,
  triangleBeadPlacement,
  triangleBeads,
  triangleBoundsUnits,
  type TriangleGrowth,
} from '@/engine/triangleRound'
import { beadMetrics } from '@/lib/beadStyle'
import { SliderField } from '@/components/shared/SliderField'
import { SegmentedControl } from '@/components/shared/SegmentedControl'
import { t } from '@/i18n/es'

/** Tres colores para que se vea cuál mostacilla es de cuál lado. */
const COLORES = ['#8050c0', '#4ab3a5', '#c9a227']

/**
 * Prueba a la vista del triángulo tejido en vueltas, antes de construir
 * nada encima: sólo dibuja, no se puede pintar. Está para que la tejedora
 * diga si la geometría es la de su técnica — ver `engine/triangleRound.ts`.
 *
 * No hay link a esta pantalla en ninguna parte de la app: se llega
 * escribiendo la dirección. Se va a ir cuando la técnica esté hecha de
 * verdad (o antes, si resulta que la geometría no era ésta).
 */
export function TrianglePreviewPage() {
  const navigate = useNavigate()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [rounds, setRounds] = useState(8)
  const [porLado, setPorLado] = useState(true)
  const [growth, setGrowth] = useState<TriangleGrowth>('dibujo')

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
    const escala = (size * 0.92) / Math.max(bounds.width, bounds.height)
    const cx = size / 2
    const cy = size / 2

    // Una mostacilla ocupa una vuelta de alto y el tramo que le toca del lado.
    const alto = escala
    // Lo que le toca a cada mostacilla del lado de su vuelta.
    const ancho = (escala * 2 * Math.sqrt(3)) / (beadsPerSide(rounds, growth) / rounds)
    const m = beadMetrics(ancho, alto, 0.5, 1.5)

    for (const bead of triangleBeads(rounds, growth)) {
      const { x, y, angle } = triangleBeadPlacement(bead, growth)
      ctx.save()
      ctx.translate(cx + x * escala, cy + y * escala)
      ctx.rotate((angle * Math.PI) / 180)
      ctx.fillStyle = porLado ? COLORES[bead.side] : COLORES[(bead.round - 1) % COLORES.length]
      ctx.strokeStyle = 'rgba(0,0,0,0.25)'
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.roundRect(-m.width / 2, -m.height / 2, m.width, m.height, m.radius)
      ctx.fill()
      ctx.stroke()
      ctx.restore()
    }
  }, [rounds, porLado, growth])

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
        <div className="flex flex-col gap-1.5">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-text-muted">{t.trianglePreview.growthLabel}</span>
          <SegmentedControl<TriangleGrowth>
            ariaLabel={t.trianglePreview.growthLabel}
            size="sm"
            value={growth}
            onChange={setGrowth}
            options={[
              { value: 'dibujo', label: t.trianglePreview.growthDiagram },
              { value: 'plano', label: t.trianglePreview.growthFlat },
            ]}
          />
          <p className="text-[11px] text-text-muted">
            {growth === 'dibujo' ? t.trianglePreview.growthDiagramHint : t.trianglePreview.growthFlatHint}
          </p>
        </div>
        <button
          onClick={() => setPorLado((v) => !v)}
          aria-pressed={porLado}
          className="self-start rounded-full bg-surface-2 px-4 py-2 text-sm font-semibold"
        >
          {porLado ? t.trianglePreview.bySide : t.trianglePreview.byRound}
        </button>
      </div>

      <dl className="flex flex-col gap-1.5 rounded-2xl bg-surface-2 px-3 py-2.5 text-sm">
        <div className="flex justify-between gap-3">
          <dt className="text-text-muted">{t.trianglePreview.perSide}</dt>
          <dd className="font-semibold tabular-nums">{beadsPerSide(rounds, growth)}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-text-muted">{t.trianglePreview.lastRound}</dt>
          <dd className="font-semibold tabular-nums">{roundBeadCount(rounds, growth)}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-text-muted">{t.trianglePreview.total}</dt>
          <dd className="font-semibold tabular-nums">{triangleBeadCount(rounds, growth).toLocaleString('es')}</dd>
        </div>
      </dl>

      <p className="mt-4 text-xs text-text-muted">{t.trianglePreview.note}</p>
    </div>
  )
}
