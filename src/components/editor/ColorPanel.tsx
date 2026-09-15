import { useMemo, useState } from 'react'
import {
  ArrowDown,
  ArrowDownLeft,
  ArrowDownRight,
  ArrowRight,
  ArrowUpDown,
  ChevronRight,
  FlipHorizontal2,
  FlipVertical2,
  ImagePlus,
} from 'lucide-react'
import { useEditorStore } from '@/store/editorStore'
import { usePatternsStore } from '@/store/patternsStore'
import type { GradientDirection } from '@/engine/gradient'
import { contrastTextColor } from '@/lib/color'
import { describeColor } from '@/lib/colorName'
import { ColorTray } from './ColorTray'
import { usePatternLetters } from '@/hooks/usePatternLetters'
import { slotOf } from '@/engine/tray'
import { t } from '@/i18n/es'

const CLONE_REPEATS = [2, 3, 5]

export function ColorPanel({
  onColorChosen,
}: {
  /** Called after a tap picks a color to paint with — the phone's sheet closes itself on it. */
  onColorChosen?: () => void
} = {}) {
  const {
    patternId,
    selection,
    cloneDirection,
    setCloneDirection,
    cloneSelection,
    reflectSelection,
    applyGradient,
  } = useEditorStore()
  /** The gradient's colors in order, once the weaver has changed them; null follows the pattern's colors in letter order. */
  const [gradientStops, setGradientStops] = useState<string[] | null>(null)
  const [gradientDirection, setGradientDirection] = useState<GradientDirection>('vertical')

  const palette = usePatternLetters()
  const slots = useEditorStore((st) => st.slots)
  const chooseColor = useEditorStore((st) => st.chooseColor)
  const openColorCard = useEditorStore((st) => st.openColorCard)
  const setPhotoPaletteOpen = useEditorStore((st) => st.setPhotoPaletteOpen)

  /** A painted color no slot holds (an undo brought it back) is loaded first, so its card has a slot to act on. */
  function openCardFor(hex: string) {
    if (slotOf(slots, hex) < 0) chooseColor(hex)
    const slot = slotOf(useEditorStore.getState().slots, hex)
    if (slot >= 0) openColorCard(slot)
  }
  const reletterPattern = usePatternsStore((s) => s.reletterPattern)
  const colorLetters = useMemo(
    () => Object.fromEntries(palette.map((p) => [p.hex, p.letter])),
    [palette],
  )
  /**
   * Colors a gradient can use: the pattern's, in letter order, then the ones
   * loaded in the tray and not painted yet.
   */
  const gradientChoices = useMemo(() => {
    const painted = palette.map((p) => p.hex)
    const loaded = slots.filter((hex): hex is string => Boolean(hex) && !painted.includes(hex!))
    return [...painted, ...loaded]
  }, [palette, slots])
  // A color taken out of the pattern and the tray since drops out of a customized order.
  const stops = (gradientStops ?? palette.map((p) => p.hex)).filter((hex) => gradientChoices.includes(hex))

  const cloneWidth = selection ? selection.c1 - selection.c0 + 1 : 0
  const cloneHeight = selection ? selection.r1 - selection.r0 + 1 : 0

  return (
    <div className="flex h-full flex-col gap-5 overflow-y-auto p-4">
      {selection && (
        <section>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-muted">{t.editor.clone}</h3>
          <p className="mb-3 text-sm text-text-muted">
            {cloneWidth} × {cloneHeight}
          </p>

          <div className="flex flex-col gap-2">
            <CloneDirectionButton
              icon={ArrowDown}
              label={t.editor.cloneVertical}
              active={cloneDirection === 'vertical'}
              onClick={() => setCloneDirection('vertical')}
            />
            <CloneDirectionButton
              icon={ArrowRight}
              label={t.editor.cloneHorizontal}
              active={cloneDirection === 'horizontal'}
              onClick={() => setCloneDirection('horizontal')}
            />
          </div>

          <h3 className="mb-2 mt-4 text-xs font-semibold uppercase tracking-wide text-text-muted">{t.editor.repeat}</h3>
          <div className="grid grid-cols-3 gap-2">
            {CLONE_REPEATS.map((n) => (
              <button
                key={n}
                onClick={() => cloneSelection(cloneDirection, n)}
                className="rounded-xl border border-border bg-surface-2 py-2 text-sm font-semibold text-text transition-colors hover:bg-surface-3"
              >
                ×{n}
              </button>
            ))}
          </div>

          <h3 className="mb-2 mt-4 text-xs font-semibold uppercase tracking-wide text-text-muted">
            {t.editor.mirror.reflect}
          </h3>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => reflectSelection('horizontal')}
              title={t.editor.mirror.horizontal}
              className="flex items-center justify-center gap-2 rounded-xl border border-border bg-surface-2 py-2 text-sm font-semibold text-text transition-colors hover:bg-surface-3"
            >
              <FlipHorizontal2 size={16} />
            </button>
            <button
              onClick={() => reflectSelection('vertical')}
              title={t.editor.mirror.vertical}
              className="flex items-center justify-center gap-2 rounded-xl border border-border bg-surface-2 py-2 text-sm font-semibold text-text transition-colors hover:bg-surface-3"
            >
              <FlipVertical2 size={16} />
            </button>
          </div>
        </section>
      )}

      <section>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-muted">{t.editor.tray.label}</h3>
        <ColorTray layout="wrap" onChosen={onColorChosen} />
        <button
          onClick={() => setPhotoPaletteOpen(true)}
          className="mt-3 flex items-center gap-1.5 rounded-full bg-surface-2 px-3 py-1.5 text-xs font-semibold text-text-muted hover:text-text"
        >
          <ImagePlus size={14} />
          {t.editor.photoPalette.open}
        </button>
      </section>

      <section>
        <div className="mb-2 flex items-center justify-between gap-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-text-muted">
            {t.editor.palette} ({palette.length})
          </h3>
          {/* Las letras no se mueven solas nunca; cerrarles los huecos es una
              decisión de quien teje, no un efecto secundario de borrar un color. */}
          {patternId && palette.length > 0 && (
            <button
              onClick={() => reletterPattern(patternId)}
              title={t.editor.reletterHint}
              className="shrink-0 rounded-full bg-surface-2 px-3 py-1 text-[11px] font-semibold text-text-muted transition-colors hover:text-text"
            >
              {t.editor.reletter}
            </button>
          )}
        </div>
        {/* Una fila por color pintado: tocarla abre su ficha, donde están cambiarlo,
            intercambiarlo, fusionarlo y seleccionar sus mostacillas. */}
        <ul className="flex flex-col gap-1">
          {palette.map((p) => (
            <li key={p.hex}>
              <button
                onClick={() => openCardFor(p.hex)}
                aria-label={t.editor.usedColorHint(p.letter, p.count)}
                className="flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left hover:bg-surface-2"
              >
                <span
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-border text-[11px] font-bold"
                  style={{ backgroundColor: p.hex, color: contrastTextColor(p.hex) }}
                >
                  {p.letter}
                </span>
                <span className="flex-1 truncate text-sm text-text-muted">{describeColor(p.hex)}</span>
                <span className="text-sm font-semibold tabular-nums">{p.count}</span>
                <ChevronRight size={14} className="text-text-soft" />
              </button>
            </li>
          ))}
          {palette.length === 0 && <p className="text-xs text-text-muted">{t.editor.paletteEmpty}</p>}
        </ul>
      </section>

      {gradientChoices.length >= 2 && (
        <GradientSection
          choices={gradientChoices}
          stops={stops}
          colorLetters={colorLetters}
          direction={gradientDirection}
          onSetStops={setGradientStops}
          onSetDirection={setGradientDirection}
          onApply={() => applyGradient(stops, gradientDirection)}
        />
      )}
    </div>
  )
}

/**
 * The gradient runs through the chosen colors in order, one band each. It
 * starts with every color of the pattern in letter order: tapping a chosen
 * color takes it out, tapping one below adds it at the end, and "Invertir"
 * flips the order.
 */
function GradientSection({
  choices,
  stops,
  colorLetters,
  direction,
  onSetStops,
  onSetDirection,
  onApply,
}: {
  choices: string[]
  stops: string[]
  colorLetters: Record<string, string>
  direction: GradientDirection
  onSetStops: (stops: string[]) => void
  onSetDirection: (direction: GradientDirection) => void
  onApply: () => void
}) {
  const directions: { value: GradientDirection; icon: typeof ArrowDown; label: string }[] = [
    { value: 'vertical', icon: ArrowDown, label: t.gradient.directionVertical },
    { value: 'diagonalDR', icon: ArrowDownRight, label: t.gradient.directionDiagonalDR },
    { value: 'diagonalDL', icon: ArrowDownLeft, label: t.gradient.directionDiagonalDL },
  ]
  const remaining = choices.filter((hex) => !stops.includes(hex))

  function chip(hex: string, onClick: () => void, label: string, order?: number) {
    return (
      <button
        key={hex}
        onClick={onClick}
        aria-label={label}
        title={label}
        className="relative flex h-9 w-9 items-center justify-center rounded-lg border border-border text-[11px] font-bold"
        style={{ backgroundColor: hex, color: contrastTextColor(hex) }}
      >
        {colorLetters[hex] ?? ''}
        {order !== undefined && (
          <span className="absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-accent-500 px-1 text-[9px] font-bold text-accent-ink">
            {order}
          </span>
        )}
      </button>
    )
  }

  return (
    <section>
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-muted">{t.gradient.title}</h3>
      <p className="mb-3 text-xs text-text-muted">{t.gradient.hint}</p>

      <div className="mb-1.5 flex items-center justify-between gap-2">
        <p className="text-[11px] font-semibold text-text-muted">{t.gradient.stops}</p>
        <button
          onClick={() => onSetStops([...stops].reverse())}
          disabled={stops.length < 2}
          className="flex items-center gap-1 rounded-full bg-surface-2 px-2.5 py-1 text-[11px] font-semibold text-text-muted hover:text-text disabled:opacity-40"
        >
          <ArrowUpDown size={12} />
          {t.gradient.reverse}
        </button>
      </div>
      <div className="flex flex-wrap gap-2 pt-1.5">
        {stops.map((hex, i) =>
          chip(hex, () => onSetStops(stops.filter((h) => h !== hex)), t.gradient.removeStop(colorLetters[hex] ?? describeColor(hex), i + 1), i + 1),
        )}
      </div>
      <p className="mt-2 text-[11px] text-text-muted">{t.gradient.stopsHint}</p>

      {remaining.length > 0 && (
        <>
          <p className="mb-1.5 mt-3 text-[11px] font-semibold text-text-muted">{t.gradient.add}</p>
          <div className="flex flex-wrap gap-2">
            {remaining.map((hex) => chip(hex, () => onSetStops([...stops, hex]), t.gradient.addStop(colorLetters[hex] ?? describeColor(hex))))}
          </div>
        </>
      )}

      <p className="mb-1.5 mt-3 text-[11px] font-semibold text-text-muted">{t.gradient.direction}</p>
      <div className="grid grid-cols-3 gap-2">
        {directions.map(({ value, icon: Icon, label }) => (
          <button
            key={value}
            onClick={() => onSetDirection(value)}
            title={label}
            aria-label={label}
            aria-pressed={direction === value}
            className={`flex items-center justify-center gap-1.5 rounded-xl border px-2 py-2.5 text-xs font-medium transition-colors
              ${direction === value ? 'border-accent-500 bg-accent-500 text-accent-ink' : 'border-border bg-surface-2 text-text-muted hover:bg-surface-3 hover:text-text'}`}
          >
            <Icon size={15} />
          </button>
        ))}
      </div>

      <button
        onClick={onApply}
        disabled={stops.length < 2}
        className="mt-3 w-full rounded-full bg-accent-500 py-2 text-sm font-semibold text-accent-ink transition-colors hover:bg-accent-400 disabled:opacity-40"
      >
        {t.gradient.apply}
      </button>
      {stops.length < 2 && <p className="mt-2 text-center text-xs text-text-muted">{t.gradient.needsTwoColors}</p>}
    </section>
  )
}

function CloneDirectionButton({
  icon: Icon,
  label,
  active,
  onClick,
}: {
  icon: typeof ArrowDown
  label: string
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 rounded-xl border px-3 py-2.5 text-sm font-medium transition-colors
        ${active ? 'border-accent-500 bg-accent-500 text-accent-ink' : 'border-border bg-surface-2 text-text-muted hover:bg-surface-3 hover:text-text'}`}
    >
      <Icon size={16} />
      {label}
    </button>
  )
}
