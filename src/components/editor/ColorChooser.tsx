import { useEditorStore } from '@/store/editorStore'
import { usePatternLetters } from '@/hooks/usePatternLetters'
import { ColorChooserSheet } from './ColorChooserSheet'

/**
 * The grid editor's way into the color chooser — see `ColorChooserSheet` for
 * the sheet itself.
 *
 * Rendered once by the editor page and opened through the store, so the tray,
 * the canvas (painting with no color loaded) and "+ Casilla" all reach it.
 */
export function ColorChooser() {
  const request = useEditorStore((s) => s.colorChooser)
  if (!request) return null
  // Keyed by the request, so each opening starts from its own draft.
  return <ChooserSheet key={`${request.slot}-${request.mode}`} slot={request.slot} mode={request.mode} />
}

function ChooserSheet({ slot, mode }: { slot: number; mode: 'fill' | 'recolor' }) {
  const slots = useEditorStore((s) => s.slots)
  const patternId = useEditorStore((s) => s.patternId)
  const fillSlot = useEditorStore((s) => s.fillSlot)
  const recolorSlot = useEditorStore((s) => s.recolorSlot)
  const close = useEditorStore((s) => s.closeColorChooser)
  const setPhotoPaletteOpen = useEditorStore((s) => s.setPhotoPaletteOpen)
  const letters = usePatternLetters()
  const current = slots[slot] ?? null
  const letter = current ? (letters.find((l) => l.hex.toLowerCase() === current.toLowerCase())?.letter ?? '') : ''

  return (
    <ColorChooserSheet
      slot={slot}
      mode={mode}
      slots={slots}
      patternId={patternId}
      letter={letter}
      onUse={(hex) => (mode === 'recolor' ? recolorSlot(slot, hex) : fillSlot(slot, hex))}
      onClose={close}
      onPhotoPalette={() => setPhotoPaletteOpen(true)}
    />
  )
}
