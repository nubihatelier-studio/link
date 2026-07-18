import { useRef } from 'react'
import { TAP_SLOP_PX } from './tapGesture'

interface HandsBusyViewProps {
  unitLabel: string
  unitIndex: number
  unitCount: number
  lineText: string
  onAdvance: () => void
  tapAnywhere: boolean
  canAdvance: boolean
}

/**
 * "Columna/fila protagonista" — Weave Mode's hands-busy reading view: the
 * current unit huge, its word-chart sequence in generous type, nothing else
 * competing for attention. Meant to be read, not aimed at — the bead-precise
 * grid (WeaveCanvas) is the other view, for when you want to see the whole
 * picture instead.
 */
export function HandsBusyView({
  unitLabel,
  unitIndex,
  unitCount,
  lineText,
  onAdvance,
  tapAnywhere,
  canAdvance,
}: HandsBusyViewProps) {
  const active = tapAnywhere && canAdvance
  const pointerStart = useRef<{ x: number; y: number; pointerId: number } | null>(null)
  const pointerCancelled = useRef(false)

  // Pointer events instead of click: this view has nothing to scroll, so unlike WeaveCanvas there's
  // no native-scroll behavior to preserve — but we still gate on TAP_SLOP_PX (not fire straight off
  // pointerdown) so a finger that starts dragging here (e.g. an accidental pinch, or a swipe that
  // strays onto this area) doesn't register as an advance too.
  function handlePointerDown(e: React.PointerEvent) {
    if (!active) return
    if (pointerStart.current) {
      pointerCancelled.current = true
      return
    }
    pointerStart.current = { x: e.clientX, y: e.clientY, pointerId: e.pointerId }
    pointerCancelled.current = false
  }

  function handlePointerUp(e: React.PointerEvent) {
    const start = pointerStart.current
    pointerStart.current = null
    if (!active || !start || start.pointerId !== e.pointerId || pointerCancelled.current) return
    const moved = Math.hypot(e.clientX - start.x, e.clientY - start.y)
    if (moved > TAP_SLOP_PX) return
    onAdvance()
  }

  function handlePointerCancel() {
    pointerStart.current = null
  }

  return (
    <div
      className={`flex h-full flex-col items-center justify-center gap-6 px-6 text-center md:gap-10 ${active ? 'cursor-pointer' : ''}`}
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
      role={tapAnywhere ? 'button' : undefined}
      aria-label={tapAnywhere ? unitLabel : undefined}
    >
      <p className="text-lg font-semibold uppercase tracking-wide text-text-muted md:text-2xl lg:text-3xl">
        {unitLabel} {unitIndex + 1} <span className="text-text-muted">/ {unitCount}</span>
      </p>
      <p className="max-w-5xl text-4xl font-bold leading-snug tracking-wide sm:text-5xl md:text-7xl lg:text-8xl">
        {lineText}
      </p>
    </div>
  )
}
