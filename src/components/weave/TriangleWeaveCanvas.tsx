import { useEffect, useMemo, useRef, useState } from 'react'
import type { ColorMap } from '@/engine/types'
import { buildTriangleWeaveOrder, triangleThreadPath } from '@/engine/triangleWeave'
import { triangleBeadPlacement, triangleBoundsUnits, triangleKey } from '@/engine/trianglePeyote'
import { beadMetrics, beadPath, MIN_BEAD_INSET_PX, MIN_BEAD_RADIUS_PX } from '@/lib/beadStyle'
import { weaveCellPx } from '@/lib/fitZoom'
import { t } from '@/i18n/es'

interface TriangleWeaveCanvasProps {
  rounds: number
  pointingUp: boolean
  cells: ColorMap
  /** Índice del último paso ya tejido; −1 cuando no se ha empezado. */
  currentIndex: number
  onTapNext: () => void
  tapAnywhere?: boolean
}

const DEFAULT_CELL_PX = 24
const MARGIN = 28
const CONTAINER_PADDING_PX = 16
/** Alto de la mostacilla, en anchos — el mismo del editor. */
const BEAD_HEIGHT = 0.92
/** Lo ya tejido se queda a la vista pero da un paso atrás; lo que viene va a todo color. */
const WOVEN_ALPHA = 0.4
/** El hilo, en el rosado con que lo dibujó la tejedora: no lo usa ninguna mostacilla ni el anillo. */
const THREAD_COLOR = '#e5579b'
const THREAD_WOVEN_ALPHA = 0.5
const RING_COLOR = '#c9a227'

/**
 * El peyote triangular en modo tejido.
 *
 * Vive aparte de `WeaveCanvas` porque acá no hay filas, columnas, flecos ni
 * argolla que dibujar —son vueltas desde el centro— pero habla el mismo
 * idioma: lo tejido más apagado, la vuelta que viene resaltada en dorado, el
 * anillo sobre lo que toca ahora, y el hilo rosado mostrando por dónde va la
 * aguja en vez de una flecha. Ver `engine/triangleWeave.ts`.
 */
export function TriangleWeaveCanvas({
  rounds,
  pointingUp,
  cells,
  currentIndex,
  onTapNext,
  tapAnywhere = true,
}: TriangleWeaveCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [cellPx, setCellPx] = useState(DEFAULT_CELL_PX)

  const bounds = useMemo(() => triangleBoundsUnits(rounds, pointingUp), [rounds, pointingUp])
  const order = useMemo(() => buildTriangleWeaveOrder(rounds), [rounds])
  const nextStep = order[currentIndex + 1]
  /** El hilo hasta el paso que viene: lo que reemplaza a la flecha. */
  const stops = useMemo(
    () => (nextStep ? triangleThreadPath(order, currentIndex + 1) : triangleThreadPath(order, order.length - 1)),
    [order, currentIndex, nextStep],
  )
  /** Desde dónde se dibuja el hilo: el comienzo de la vuelta anterior a la que viene. */
  const primerPasoVisible = useMemo(() => {
    if (!nextStep) return 0
    const desde = Math.max(1, nextStep.round - 1)
    const i = order.findIndex((paso) => paso.round === desde)
    return i < 0 ? 0 : i
  }, [order, nextStep])

  /** En qué paso entra cada mostacilla, para saber qué está tejido. */
  const stepOfKey = useMemo(() => {
    const m = new Map<string, number>()
    order.forEach((paso, i) => paso.beads.forEach((b) => m.set(triangleKey(b), i)))
    return m
  }, [order])

  useEffect(() => {
    const container = containerRef.current
    // Sin `ResizeObserver` (jsdom) el lienzo se queda en su tamaño de partida,
    // que es justo lo que las pruebas necesitan — misma salida que `WeaveCanvas`.
    if (!container || typeof ResizeObserver === 'undefined') return
    const measure = () =>
      setCellPx(
        weaveCellPx({
          boundsWidth: bounds.width,
          boundsHeight: bounds.height,
          viewportWidth: container.clientWidth - CONTAINER_PADDING_PX * 2,
          viewportHeight: container.clientHeight - CONTAINER_PADDING_PX * 2,
          margin: MARGIN,
        }),
      )
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(container)
    return () => observer.disconnect()
  }, [bounds.width, bounds.height])

  const width = bounds.width * cellPx + MARGIN * 2
  const height = bounds.height * cellPx + MARGIN * 2

  /** Dónde cae una mostacilla en el lienzo. */
  const centerOf = useMemo(
    () => (bead: Parameters<typeof triangleKey>[0]) => {
      const p = triangleBeadPlacement(bead, pointingUp)
      return { x: MARGIN + (p.x - bounds.minX) * cellPx, y: MARGIN + (p.y - bounds.minY) * cellPx, angle: p.angle }
    },
    [bounds.minX, bounds.minY, cellPx, pointingUp],
  )

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const dpr = window.devicePixelRatio || 1
    canvas.width = width * dpr
    canvas.height = height * dpr
    canvas.style.width = `${width}px`
    canvas.style.height = `${height}px`
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, width, height)

    const styles = getComputedStyle(canvas)
    const emptyColor = styles.getPropertyValue('--nb-surface-3').trim() || '#2c2c2e'
    const outlineColor = styles.getPropertyValue('--nb-grid-line').trim() || '#3a3a3d'
    const m = beadMetrics(cellPx, cellPx * BEAD_HEIGHT, MIN_BEAD_INSET_PX, MIN_BEAD_RADIUS_PX)

    // La vuelta que viene, como un halo detrás de sus mostacillas: la
    // instrucción es "esta vuelta", no sólo la mostacilla bajo el anillo.
    if (nextStep) {
      ctx.globalAlpha = 0.18
      ctx.fillStyle = RING_COLOR
      for (const paso of order.filter((p) => p.round === nextStep.round)) {
        for (const bead of paso.beads) {
          const { x, y, angle } = centerOf(bead)
          ctx.save()
          ctx.translate(x, y)
          ctx.rotate((angle * Math.PI) / 180)
          ctx.beginPath()
          beadPath(ctx, -m.width / 2 - 2, -m.height / 2 - 2, m.width + 4, m.height + 4, m.radius + 2)
          ctx.fill()
          ctx.restore()
        }
      }
      ctx.globalAlpha = 1
    }

    for (const paso of order) {
      for (const bead of paso.beads) {
        const llave = triangleKey(bead)
        const { x, y, angle } = centerOf(bead)
        const hecha = (stepOfKey.get(llave) ?? -1) <= currentIndex
        ctx.save()
        ctx.translate(x, y)
        ctx.rotate((angle * Math.PI) / 180)
        ctx.globalAlpha = hecha ? WOVEN_ALPHA : 1
        ctx.beginPath()
        beadPath(ctx, -m.width / 2, -m.height / 2, m.width, m.height, m.radius)
        ctx.fillStyle = cells[llave] ?? emptyColor
        ctx.fill()
        ctx.strokeStyle = outlineColor
        ctx.lineWidth = 1
        ctx.stroke()
        ctx.restore()
        ctx.globalAlpha = 1
      }
    }

    // Sólo desde la vuelta anterior: dibujado desde el centro, el hilo de
    // diez vueltas se cruza consigo mismo hasta volverse un garabato. Con la
    // vuelta pasada basta para ver de dónde viene la aguja.
    //
    // Se corta por el **paso**, no por la vuelta de cada mostacilla: las que
    // la aguja sólo atraviesa son de la vuelta anterior, y cortando por ahí
    // se caían justo ellas — el hilo quedaba un triángulo liso en vez del
    // zigzag que es.
    drawThread(
      ctx,
      stops.filter((s) => s.step >= primerPasoVisible).map((s) => ({ ...centerOf(s.bead), kind: s.kind })),
      cellPx,
    )

    // Por dónde pasa la aguja antes de ensartar: contorno punteado, a
    // propósito distinto del anillo — ahí no se ensarta nada.
    const pasoPrevio = stops.filter((s) => s.step === currentIndex + 1 && s.kind === 'through')
    ctx.save()
    ctx.setLineDash([4, 3])
    ctx.strokeStyle = RING_COLOR
    ctx.lineWidth = 2
    for (const parada of pasoPrevio) {
      const { x, y, angle } = centerOf(parada.bead)
      ctx.save()
      ctx.translate(x, y)
      ctx.rotate((angle * Math.PI) / 180)
      ctx.beginPath()
      beadPath(ctx, -m.width / 2 - 1, -m.height / 2 - 1, m.width + 2, m.height + 2, m.radius + 1)
      ctx.stroke()
      ctx.restore()
    }
    ctx.restore()

    // El anillo sobre lo que toca ahora — dos mostacillas cuando es esquina.
    if (nextStep) {
      ctx.strokeStyle = RING_COLOR
      ctx.lineWidth = Math.max(2, cellPx * 0.1)
      for (const bead of nextStep.beads) {
        const { x, y, angle } = centerOf(bead)
        ctx.save()
        ctx.translate(x, y)
        ctx.rotate((angle * Math.PI) / 180)
        ctx.beginPath()
        beadPath(ctx, -m.width / 2 - 3, -m.height / 2 - 3, m.width + 6, m.height + 6, m.radius + 3)
        ctx.stroke()
        ctx.restore()
      }
    }
  }, [width, height, cellPx, cells, order, currentIndex, nextStep, stops, stepOfKey, centerOf, primerPasoVisible])

  return (
    <div ref={containerRef} className="h-full w-full overflow-auto p-4" onClick={tapAnywhere ? onTapNext : undefined}>
      <canvas
        ref={canvasRef}
        role="img"
        aria-label={t.weave.triangleCanvasLabel}
        className="mx-auto block"
        onClick={tapAnywhere ? undefined : onTapNext}
      />
    </div>
  )
}

/**
 * El hilo: pasa por el centro de cada mostacilla en el orden en que la aguja
 * llega. Lo ya tejido queda más suave y el tramo que viene ahora va marcado,
 * terminando en la punta de flecha donde sale la aguja.
 */
function drawThread(
  ctx: CanvasRenderingContext2D,
  points: { x: number; y: number; kind: 'new' | 'through' }[],
  cellPx: number,
) {
  if (points.length < 2) return
  const corte = Math.max(0, points.length - 4)
  ctx.save()
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.strokeStyle = THREAD_COLOR

  ctx.globalAlpha = THREAD_WOVEN_ALPHA
  ctx.lineWidth = Math.max(1.5, cellPx * 0.08)
  ctx.beginPath()
  ctx.moveTo(points[0].x, points[0].y)
  for (let i = 1; i <= corte; i++) ctx.lineTo(points[i].x, points[i].y)
  ctx.stroke()

  ctx.globalAlpha = 1
  ctx.lineWidth = Math.max(2.5, cellPx * 0.12)
  ctx.beginPath()
  ctx.moveTo(points[corte].x, points[corte].y)
  for (let i = corte + 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y)
  ctx.stroke()

  const tip = points[points.length - 1]
  const before = points[points.length - 2]
  const angle = Math.atan2(tip.y - before.y, tip.x - before.x)
  const head = Math.max(7, cellPx * 0.32)
  ctx.fillStyle = THREAD_COLOR
  ctx.beginPath()
  ctx.moveTo(tip.x + Math.cos(angle) * head * 0.35, tip.y + Math.sin(angle) * head * 0.35)
  ctx.lineTo(tip.x - head * Math.cos(angle - Math.PI / 6), tip.y - head * Math.sin(angle - Math.PI / 6))
  ctx.lineTo(tip.x - head * Math.cos(angle + Math.PI / 6), tip.y - head * Math.sin(angle + Math.PI / 6))
  ctx.closePath()
  ctx.fill()
  ctx.restore()
}
