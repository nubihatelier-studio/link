import { Plus } from 'lucide-react'
import { useEditorStore } from '@/store/editorStore'
import { usePatternLetters } from '@/hooks/usePatternLetters'
import { contrastTextColor } from '@/lib/color'
import { describeColor } from '@/lib/colorName'
import { slotOf } from '@/engine/tray'
import { t } from '@/i18n/es'

/** The active swatch's ring: an offset gold ring reads at a glance on any bead color, light or dark. */
const ACTIVE_RING = 'ring-2 ring-accent-500 ring-offset-2 ring-offset-surface'

/**
 * The palette tray — the colors loaded to paint with, one per slot (see
 * `engine/tray.ts`). Shared by the phone's always-visible row and the color
 * panel, so both show the same slots with the same one active.
 *
 * - An empty slot opens the color chooser on it; the first one is marked, so
 *   a new pattern says where to start.
 * - A loaded color is picked with one tap. Painted colors carry their
 *   letter; loaded ones not painted yet carry none (they haven't earned one).
 * - Tapping the active color again opens the chooser to change it.
 */
export function ColorTray({ layout, onChosen }: { layout: 'row' | 'wrap'; onChosen?: () => void }) {
  const slots = useEditorStore((s) => s.slots)
  const activeSlot = useEditorStore((s) => s.activeSlot)
  const setActiveSlot = useEditorStore((s) => s.setActiveSlot)
  const chooseColor = useEditorStore((s) => s.chooseColor)
  const openColorChooser = useEditorStore((s) => s.openColorChooser)
  const addSlot = useEditorStore((s) => s.addSlot)
  const letters = usePatternLetters()
  const letterOf = (hex: string) => letters.find((l) => l.hex.toLowerCase() === hex.toLowerCase())
  const firstVacant = slots.indexOf(null)
  // A painted color no slot holds any more (an undo brought it back) still
  // gets a swatch, so a letter on the canvas is never unreachable.
  const orphans = letters.filter((l) => slotOf(slots, l.hex) < 0)

  return (
    <div className={`flex items-center gap-2.5 ${layout === 'wrap' ? 'flex-wrap' : 'w-max'}`}>
      {slots.map((hex, i) => {
        if (!hex) {
          return (
            <button
              key={`vacant-${i}`}
              onClick={() => openColorChooser(i)}
              aria-label={t.editor.tray.emptySlot(i + 1)}
              title={t.editor.tray.emptySlot(i + 1)}
              className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2 border-dashed transition-colors
                ${i === firstVacant ? 'border-accent-500 text-accent-500' : 'border-border text-text-soft hover:border-accent-300'}`}
            >
              <Plus size={16} />
            </button>
          )
        }
        const entry = letterOf(hex)
        const active = i === activeSlot
        const label = entry ? t.editor.usedColorHint(entry.letter, entry.count) : t.editor.tray.loaded(describeColor(hex))
        return (
          <button
            key={`slot-${i}`}
            onClick={() => {
              if (active) openColorChooser(i, entry ? 'recolor' : 'fill')
              else {
                setActiveSlot(i)
                onChosen?.()
              }
            }}
            aria-pressed={active}
            aria-label={label}
            title={label}
            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full border text-xs font-bold
              ${active ? `border-transparent ${ACTIVE_RING}` : 'border-border'}`}
            style={{ backgroundColor: hex, color: contrastTextColor(hex) }}
          >
            {entry?.letter ?? ''}
          </button>
        )
      })}
      {orphans.map((entry) => (
        <button
          key={`orphan-${entry.hex}`}
          onClick={() => {
            chooseColor(entry.hex)
            onChosen?.()
          }}
          aria-label={t.editor.usedColorHint(entry.letter, entry.count)}
          title={t.editor.usedColorHint(entry.letter, entry.count)}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border text-xs font-bold"
          style={{ backgroundColor: entry.hex, color: contrastTextColor(entry.hex) }}
        >
          {entry.letter}
        </button>
      ))}
      <button
        onClick={addSlot}
        aria-label={t.editor.tray.addSlotLabel}
        className="h-8 shrink-0 whitespace-nowrap rounded-full bg-surface-2 px-3 text-xs font-semibold text-text-muted hover:text-text"
      >
        {t.editor.tray.addSlot}
      </button>
    </div>
  )
}
