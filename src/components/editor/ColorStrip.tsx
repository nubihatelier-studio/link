import { useEffect, useRef } from 'react'
import { Palette } from 'lucide-react'
import { useEditorStore } from '@/store/editorStore'
import { t } from '@/i18n/es'
import { ColorTray } from './ColorTray'

/**
 * Phone only: the color tray as one always-visible row above the tools, so
 * changing color is a single tap on the color itself. The palette panel
 * (the pattern's colors and counts, gradient) is one tap away at the end.
 */
export function ColorStrip({ onOpenPalette }: { onOpenPalette: () => void }) {
  const scrollerRef = useRef<HTMLDivElement>(null)
  const activeSlot = useEditorStore((s) => s.activeSlot)
  const slotCount = useEditorStore((s) => s.slots.length)

  // A color loaded into a slot off to the right of a narrow phone comes into
  // view, so the weaver sees what she's about to paint with.
  useEffect(() => {
    const active = scrollerRef.current?.querySelector<HTMLElement>('[aria-pressed="true"]')
    active?.scrollIntoView?.({ behavior: 'smooth', inline: 'nearest', block: 'nearest' })
  }, [activeSlot, slotCount])
  return (
    <div className="flex items-center gap-2">
      <div
        ref={scrollerRef}
        role="group"
        aria-label={t.editor.tray.label}
        className="no-scrollbar min-w-0 flex-1 overflow-x-auto"
      >
        {/* Padding so the active swatch's offset ring isn't clipped by the scroller. */}
        <div className="p-1.5">
          <ColorTray layout="row" />
        </div>
      </div>
      <button
        onClick={onOpenPalette}
        aria-label={t.editor.moreColors}
        className="flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full bg-surface-2 px-3 py-2 text-xs font-semibold"
      >
        <Palette size={14} />
        {t.editor.moreColors}
      </button>
    </div>
  )
}
