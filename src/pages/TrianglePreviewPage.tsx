import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Eraser, Undo2 } from 'lucide-react'
import {
  beadsPerSide,
  triangleBeadAt,
  triangleBeadCount,
  triangleBeadPlacement,
  triangleBeads,
  triangleBoundsUnits,
  triangleKey,
} from '@/engine/trianglePeyote'
import { beadMetrics, MIN_BEAD_INSET_PX, MIN_BEAD_RADIUS_PX } from '@/lib/beadStyle'
import { contrastTextColor } from '@/lib/color'
import { describeColor } from '@/lib/colorName'
import { SliderField } from '@/components/shared/SliderField'
import { IconButton } from '@/components/shared/IconButton'
import { usePatternsStore } from '@/store/patternsStore'
import { InfoScreen } from '@/components/shared/InfoScreen'
import { t } from '@/i18n/es'

/** Una mostacilla todavía sin pintar. */
const SIN_PINTAR = '#d7d2ca'
/** Alto de la mostacilla, en anchos: apenas menor que el ancho, como una Delica. */
const BEAD_HEIGHT = 0.92
/** Paleta provisoria: seis colores y la goma, hasta que el aro triangular use la bandeja libre. */
const PALETA = ['#2f6fd0', '#e2b93b', '#8050c0', '#4ab3a5', '#d94f4f', '#faf7f0']

/**
 * Editor del aro triangular de peyote, que se teje en vueltas desde el centro.
 *
 * Es un patrón de verdad: se crea desde "Crear patrón", lo pintado se guarda
 * en el patrón (`cells`, con la llave de `triangleKey`) y aparece en la
 * biblioteca con su miniatura. Todavía le faltan la paleta libre, el PDF y el
 * modo tejido, así que tiene su propia pantalla en vez del editor de grilla:
 * acá no hay filas ni columnas, sino tres sectores de 120° —ver
 * `engine/trianglePeyote.ts`.
 */
export function TrianglePreviewPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const pattern = usePatternsStore((s) => (id ? s.patterns[id] : undefined))
  const setCell = usePatternsStore((s) => s.setCell)
  const setCells = usePatternsStore((s) => s.setCells)
  const setTriangleRounds = usePatternsStore((s) => s.setTriangleRounds)
  const [color, setColor] = useState(PALETA[0])
  const [borrando, setBorrando] = useState(false)
  /** Lo pintado antes de cada trazo, para poder deshacerlo entero. */
  const historia = useRef<Record<string, string | undefined>[]>([])
  const pintando = useRef(false)
  const rounds = pattern?.config.rounds ?? pattern?.config.cols ?? 10
  const pintado = pattern?.cells ?? {}
  /** Escala y centro del último dibujo: para saber qué mostacilla se tocó. */
  const vista = useRef({ escala: 1, cx: 0, cy: 0 })

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
    const escala = Math.min((size * 0.92) / Math.max(bounds.width, bounds.height), size / 4.5)
    const cx = size / 2
    const cy = size / 2
    vista.current = { escala, cx, cy }

    const m = beadMetrics(escala, escala * BEAD_HEIGHT, MIN_BEAD_INSET_PX, MIN_BEAD_RADIUS_PX)
    for (const bead of triangleBeads(rounds)) {
      const { x, y, angle } = triangleBeadPlacement(bead)
      ctx.save()
      ctx.translate(cx + x * escala, cy + y * escala)
      ctx.rotate((angle * Math.PI) / 180)
      ctx.fillStyle = pintado[triangleKey(bead)] ?? SIN_PINTAR
      ctx.strokeStyle = 'rgba(0,0,0,0.18)'
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.roundRect(-m.width / 2, -m.height / 2, m.width, m.height, m.radius)
      ctx.fill()
      ctx.stroke()
      ctx.restore()
    }
  }, [rounds, pintado])

  const pintarEn = useCallback(
    (clientX: number, clientY: number) => {
      const canvas = canvasRef.current
      if (!canvas) return
      const rect = canvas.getBoundingClientRect()
      const { escala, cx, cy } = vista.current
      const bead = triangleBeadAt((clientX - rect.left - cx) / escala, (clientY - rect.top - cy) / escala, rounds)
      if (!bead) return
      if (!id) return
      setCell(id, triangleKey(bead), borrando ? null : color)
    },
    [borrando, color, id, rounds, setCell],
  )

  function empezarTrazo(e: React.PointerEvent) {
    historia.current = [...historia.current, { ...pintado }].slice(-30)
    pintando.current = true
    try {
      ;(e.target as Element).setPointerCapture(e.pointerId)
    } catch {
      // da lo mismo: sin captura igual se pinta, sólo se corta al salir del canvas
    }
    pintarEn(e.clientX, e.clientY)
  }

  function deshacer() {
    const previo = historia.current.pop()
    if (previo && id) setCells(id, previo)
  }

  const pintadas = Object.values(pintado).filter(Boolean).length

  if (!id || !pattern || pattern.config.technique !== 'triangle') {
    return (
      <InfoScreen
        title={t.common.patternNotFound}
        message={t.common.patternNotFoundHint}
        action={{ label: t.common.goHome, onClick: () => navigate('/') }}
      />
    )
  }

  return (
    <div className="mx-auto min-h-screen max-w-2xl px-4 pb-16 pt-[calc(2rem+env(safe-area-inset-top))] sm:px-8">
      <div className="mb-4 flex items-center gap-2">
        <button onClick={() => navigate('/')} aria-label={t.editor.back} className="-ml-2 rounded-full p-2 text-lg hover:bg-surface-2">
          ←
        </button>
        <div className="min-w-0">
          <h1 className="truncate text-xl font-bold">{pattern.name}</h1>
          <p className="text-xs text-text-muted">{t.trianglePreview.subtitle}</p>
        </div>
      </div>

      <p className="mb-4 text-sm text-text-muted">{t.trianglePreview.intro}</p>

      <div className="mb-4 flex justify-center rounded-2xl border border-border bg-surface p-3">
        <canvas
          ref={canvasRef}
          className="cursor-crosshair touch-none"
          role="grid"
          aria-label={t.trianglePreview.canvasLabel}
          onPointerDown={empezarTrazo}
          onPointerMove={(e) => pintando.current && pintarEn(e.clientX, e.clientY)}
          onPointerUp={() => (pintando.current = false)}
          onPointerCancel={() => (pintando.current = false)}
        />
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {PALETA.map((hex) => (
          <button
            key={hex}
            onClick={() => {
              setColor(hex)
              setBorrando(false)
            }}
            aria-label={describeColor(hex)}
            aria-pressed={!borrando && color === hex}
            className={`h-10 w-10 rounded-full border transition-transform ${
              !borrando && color === hex ? 'scale-110 border-accent-500 ring-2 ring-accent-500' : 'border-black/10'
            }`}
            style={{ backgroundColor: hex, color: contrastTextColor(hex) }}
          />
        ))}
        <IconButton label={t.trianglePreview.erase} active={borrando} onClick={() => setBorrando((v) => !v)}>
          <Eraser size={18} />
        </IconButton>
        <IconButton label={t.trianglePreview.undo} disabled={historia.current.length === 0} onClick={deshacer}>
          <Undo2 size={18} />
        </IconButton>
      </div>

      <div className="mb-4">
        <SliderField
          label={t.trianglePreview.rounds}
          value={rounds}
          min={1}
          max={20}
          onChange={(v) => setTriangleRounds(id, v)}
        />
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
        <div className="flex justify-between gap-3">
          <dt className="text-text-muted">{t.trianglePreview.painted}</dt>
          <dd className="font-semibold tabular-nums">{pintadas.toLocaleString('es')}</dd>
        </div>
      </dl>

      <p className="mt-4 text-xs text-text-muted">{t.trianglePreview.note}</p>
    </div>
  )
}
