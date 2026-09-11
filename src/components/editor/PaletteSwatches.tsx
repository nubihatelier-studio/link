import { useMemo } from 'react'
import { useEditorStore } from '@/store/editorStore'
import { usePatternLetters } from '@/hooks/usePatternLetters'
import { contrastTextColor } from '@/lib/color'
import { t } from '@/i18n/es'

export interface PaletteSwatch {
  hex: string
  /** The slot holding this color, or -1 for a used color no slot holds any more (it gets one when picked). */
  slotIndex: number
}

/**
 * The palette as swatches, split in two, because it holds two different
 * things: the colors this design is made of (they carry a letter and a bead
 * count — they're the chart's notation) and the colors merely loaded and
 * ready to paint with. Used ones come first in letter order; the rest follow,
 * dimmed and letterless, and cross over the moment they're painted.
 *
 * Keyed by color rather than by slot: a color used in the pattern is one
 * entry even if it sits in two slots, and one that's used but no longer in
 * any slot (its slot was recolored) still gets a swatch — `slotIndex` -1
 * means "give it a slot when picked" instead of leaving it unreachable.
 *
 * Shared by the color panel and the phone's always-visible color strip, so
 * both always show the same colors, in the same order, with the same one active.
 */
export function usePaletteSwatches() {
  const slots = useEditorStore((s) => s.slots)
  const activeSlot = useEditorStore((s) => s.activeSlot)
  const setActiveSlot = useEditorStore((s) => s.setActiveSlot)
  const addSlot = useEditorStore((s) => s.addSlot)
  // Already in A, B, C… order — `assignLetters` returns used colors by order
  // of first use, which is exactly the order the swatches should read in.
  const palette = usePatternLetters()
  const activeHex = slots[activeSlot]

  const used = useMemo(
    () => palette.map((p) => ({ hex: p.hex, letter: p.letter, count: p.count, slotIndex: slots.indexOf(p.hex) })),
    [palette, slots],
  )
  const unused = useMemo(() => {
    const usedHexes = new Set(palette.map((p) => p.hex))
    return slots
      .map((hex, slotIndex) => ({ hex, slotIndex, key: `${slotIndex}:${hex}` }))
      .filter((s) => !usedHexes.has(s.hex))
  }, [palette, slots])

  function isActive(swatch: PaletteSwatch) {
    return swatch.slotIndex >= 0 ? activeSlot === swatch.slotIndex : activeHex === swatch.hex
  }

  function pick(swatch: PaletteSwatch) {
    if (swatch.slotIndex >= 0) setActiveSlot(swatch.slotIndex)
    else addSlot(swatch.hex)
  }

  return { palette, used, unused, isActive, pick }
}

/** The active swatch's ring: an offset gold ring reads at a glance on any bead color, light or dark. */
const ACTIVE_RING = 'ring-2 ring-accent-500 ring-offset-2 ring-offset-surface'

/**
 * A color the design actually uses: its letter inside the swatch, its bead
 * count underneath (left out in the compact strip). The count sits outside
 * the circle on purpose — the circle stays a full 36px touch target with a
 * single legible character in it, instead of shrinking two pieces of text to fit.
 */
export function UsedSwatch({
  swatch,
  active,
  onSelect,
  compact,
}: {
  swatch: { hex: string; letter: string; count: number }
  active: boolean
  onSelect: () => void
  compact?: boolean
}) {
  return (
    <button
      onClick={onSelect}
      title={t.editor.usedColorHint(swatch.letter, swatch.count)}
      aria-label={t.editor.usedColorHint(swatch.letter, swatch.count)}
      aria-pressed={active}
      className="flex w-9 shrink-0 flex-col items-center gap-0.5"
    >
      <span
        className={`flex h-9 w-9 items-center justify-center rounded-full border text-xs font-bold
          ${active ? `border-transparent ${ACTIVE_RING}` : 'border-border'}`}
        style={{ backgroundColor: swatch.hex, color: contrastTextColor(swatch.hex) }}
      >
        {swatch.letter}
      </span>
      {!compact && <span className="text-[10px] leading-none text-text-muted">{swatch.count}</span>}
    </button>
  )
}

/**
 * A color loaded in the palette but not painted anywhere yet — no letter (it
 * hasn't earned one), dimmed so it reads as material rather than notation,
 * and fully selectable: painting with it is exactly what promotes it.
 */
export function UnusedSwatch({
  swatch,
  active,
  onSelect,
}: {
  swatch: { hex: string }
  active: boolean
  onSelect: () => void
}) {
  return (
    <button
      onClick={onSelect}
      title={`${swatch.hex} — ${t.editor.unusedColorHint}`}
      aria-label={`${swatch.hex} — ${t.editor.unusedColorHint}`}
      aria-pressed={active}
      className={`h-9 w-9 shrink-0 rounded-full border-2 border-dashed transition-opacity hover:opacity-100
        ${active ? `border-transparent opacity-100 ${ACTIVE_RING}` : 'border-border opacity-60'}`}
      style={{ backgroundColor: swatch.hex }}
    />
  )
}
