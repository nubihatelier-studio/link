import { useState } from 'react'
import { Plus } from 'lucide-react'
import type { ColorMap } from '@/engine/types'
import { activeAfterEmptying, fillSlot, slotOf, type Tray } from '@/engine/tray'
import { ColorChooserSheet } from '@/components/editor/ColorChooserSheet'
import { contrastTextColor } from '@/lib/color'
import { describeColor } from '@/lib/colorName'
import { usePatternsStore } from '@/store/patternsStore'
import { t } from '@/i18n/es'

/** The active swatch's ring: an offset gold ring reads at a glance on any bead color, light or dark. */
const ACTIVE_RING = 'ring-2 ring-accent-500 ring-offset-2 ring-offset-surface'

interface TrianglePaletteProps {
  patternId: string
  /** The tray as `engine/tray.ts#trayFor` hands it over: what's saved with the pattern, padded to six. */
  slots: Tray
  /** What's painted, to repaint it when a loaded color is changed. */
  cells: ColorMap
  activeSlot: number
  onActiveSlot: (slot: number) => void
  /** Se llama justo antes de repintar, para que el "deshacer" de la página guarde cómo estaba. */
  onBeforeRecolor: () => void
}

/**
 * The triangular earring's color tray: six free colors saved with the
 * pattern, the same as the grid editor's (`ColorTray`), and the same chooser
 * behind it (`ColorChooserSheet`).
 *
 * It doesn't go through `editorStore` — the triangle isn't a grid, so it
 * keeps its tray straight in the pattern (`PatternDoc.palette`). What it
 * doesn't have yet is the color card: here changing a loaded color is the
 * second tap on it, and there's no swapping or merging.
 */
export function TrianglePalette({
  patternId,
  slots,
  cells,
  activeSlot,
  onActiveSlot,
  onBeforeRecolor,
}: TrianglePaletteProps) {
  const setPalette = usePatternsStore((s) => s.setPalette)
  const setCells = usePatternsStore((s) => s.setCells)
  const [pidiendo, setPidiendo] = useState<{ slot: number; mode: 'fill' | 'recolor' } | null>(null)
  const primeraVacia = slots.indexOf(null)

  function usar(hex: string) {
    if (!pidiendo) return
    const { slot, mode } = pidiendo
    if (mode === 'recolor') {
      const antes = slots[slot]
      if (!antes) return
      onBeforeRecolor()
      // Todas sus mostacillas pasan al color nuevo, como en el editor de grilla.
      const pintado: ColorMap = {}
      let cambió = false
      for (const [llave, valor] of Object.entries(cells)) {
        if (!valor) continue
        if (valor.toLowerCase() === antes.toLowerCase()) {
          pintado[llave] = hex
          cambió = true
        } else {
          pintado[llave] = valor
        }
      }
      if (cambió) setCells(patternId, pintado)
      // Si el color nuevo ya estaba en otra casilla, las dos se juntan en ella.
      const otra = slotOf(slots, hex)
      const juntar = otra >= 0 && otra !== slot
      const siguiente = [...slots]
      siguiente[slot] = juntar ? null : hex
      setPalette(patternId, siguiente)
      onActiveSlot(juntar ? otra : activeAfterEmptying(siguiente, slot))
    } else {
      const { tray, active } = fillSlot(slots, slot, hex)
      setPalette(patternId, tray)
      onActiveSlot(active)
    }
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-2.5" role="group" aria-label={t.editor.tray.label}>
        {slots.map((hex, i) => {
          if (!hex) {
            return (
              <button
                key={`vacia-${i}`}
                onClick={() => setPidiendo({ slot: i, mode: 'fill' })}
                aria-label={t.editor.tray.emptySlot(i + 1)}
                title={t.editor.tray.emptySlot(i + 1)}
                className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-2 border-dashed transition-colors
                  ${i === primeraVacia ? 'border-accent-500 text-accent-500' : 'border-border text-text-soft hover:border-accent-300'}`}
              >
                <Plus size={16} />
              </button>
            )
          }
          const activa = i === activeSlot
          const nombre = describeColor(hex)
          const label = activa ? t.trianglePreview.changeColor(nombre) : t.editor.tray.loaded(nombre)
          return (
            <button
              key={`casilla-${i}`}
              onClick={() => (activa ? setPidiendo({ slot: i, mode: 'recolor' }) : onActiveSlot(i))}
              aria-pressed={activa}
              aria-label={label}
              title={label}
              className={`h-10 w-10 shrink-0 rounded-full border transition-transform
                ${activa ? `scale-110 border-transparent ${ACTIVE_RING}` : 'border-black/10'}`}
              style={{ backgroundColor: hex, color: contrastTextColor(hex) }}
            />
          )
        })}
        <button
          onClick={() => {
            setPalette(patternId, [...slots, null])
            setPidiendo({ slot: slots.length, mode: 'fill' })
          }}
          aria-label={t.editor.tray.addSlotLabel}
          title={t.editor.tray.addSlotLabel}
          className="h-10 shrink-0 rounded-full border border-border px-3 text-xs font-semibold text-text-muted hover:bg-surface-2"
        >
          {t.editor.tray.addSlot}
        </button>
      </div>

      {pidiendo && (
        <ColorChooserSheet
          key={`${pidiendo.slot}-${pidiendo.mode}`}
          slot={pidiendo.slot}
          mode={pidiendo.mode}
          slots={slots}
          patternId={patternId}
          onUse={usar}
          onClose={() => setPidiendo(null)}
        />
      )}
    </>
  )
}
