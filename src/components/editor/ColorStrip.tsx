import { useEffect, useRef } from 'react'
import { Palette } from 'lucide-react'
import { useEditorStore } from '@/store/editorStore'
import { t } from '@/i18n/es'
import { UnusedSwatch, UsedSwatch, usePaletteSwatches } from './PaletteSwatches'

/**
 * Phone only: the palette as one always-visible row above the tools, so
 * changing color is a single tap on the color itself — not opening a sheet,
 * finding the swatch among the controls and closing the sheet again. The
 * full panel (custom colors, replace, merge, gradient) is one tap away at
 * the end of the row.
 */
export function ColorStrip({ onOpenPalette }: { onOpenPalette: () => void }) {
  const { used, unused, isActive, pick } = usePaletteSwatches()
  const scrollerRef = useRef<HTMLDivElement>(null)
  const activeSlot = useEditorStore((s) => s.activeSlot)
  const slotCount = useEditorStore((s) => s.slots.length)

  // A color just added from "Más colores" lands at the end of the row, out of
  // sight on a narrow phone — bring the active swatch into view so the weaver
  // sees what she's about to paint with.
  useEffect(() => {
    const active = scrollerRef.current?.querySelector<HTMLElement>('[aria-pressed="true"]')
    active?.scrollIntoView?.({ behavior: 'smooth', inline: 'nearest', block: 'nearest' })
  }, [activeSlot, slotCount])
  return (
    <div className="flex items-center gap-2">
      <div
        ref={scrollerRef}
        role="group"
        aria-label={t.editor.colorsTitle}
        className="no-scrollbar min-w-0 flex-1 overflow-x-auto"
      >
        {/* Padding so the active swatch's offset ring isn't clipped by the scroller. */}
        <div className="flex w-max items-center gap-2.5 p-1.5">
          {used.map((swatch) => (
            <UsedSwatch key={swatch.hex} swatch={swatch} active={isActive(swatch)} onSelect={() => pick(swatch)} compact />
          ))}
          {unused.map((swatch) => (
            <UnusedSwatch key={swatch.key} swatch={swatch} active={isActive(swatch)} onSelect={() => pick(swatch)} />
          ))}
        </div>
      </div>
      <button
        onClick={onOpenPalette}
        className="flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full bg-surface-2 px-3 py-2 text-xs font-semibold"
      >
        <Palette size={14} />
        {t.editor.moreColors}
      </button>
    </div>
  )
}
