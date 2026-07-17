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
  return (
    <div
      className={`flex h-full flex-col items-center justify-center gap-6 px-6 text-center md:gap-10 ${tapAnywhere && canAdvance ? 'cursor-pointer' : ''}`}
      onClick={tapAnywhere && canAdvance ? onAdvance : undefined}
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
