import { useEffect, useRef, useState } from 'react'
import { ChevronRight, ImagePlus, Pipette } from 'lucide-react'
import type { Tray } from '@/engine/tray'
import { useRecentColors } from '@/hooks/useRecentColors'
import { describeColor } from '@/lib/colorName'
import { TONE_FAMILIES, TONES_PER_FAMILY } from '@/data/toneFamilies'
import { ColorPicker } from './ColorPicker'
import { t } from '@/i18n/es'

/** Where the exact picker starts when there's no color to start from. */
const EXACT_START = '#3547b0'

export interface ColorChooserSheetProps {
  /** Which tray slot is being filled or changed — only for the title and to leave it out of the preview. */
  slot: number
  mode: 'fill' | 'recolor'
  /** The tray as it stands, to show the choice next to the colors already loaded. */
  slots: Tray
  /** The pattern being painted, so its own colors don't come back as "used in your patterns". */
  patternId: string | null
  /** The letter of the color being changed, when it has one. Only used in the `recolor` title. */
  letter?: string
  onUse: (hex: string) => void
  onClose: () => void
  /** Left out where there's no photo palette — then the button doesn't show. */
  onPhotoPalette?: () => void
}

/**
 * The color chooser's sheet: fills an empty slot of the tray, or changes a
 * color already painted. Colors are free — no bead brand's codes — and it
 * offers, in order of how often they're the answer: the colors used in the
 * weaver's other patterns, a grid of tones from light to dark, and an exact
 * picker for anything else. The preview shows the choice as a bead next to
 * the colors already loaded, which is what decides whether it works.
 *
 * A sheet from the bottom on a phone, a dialog on a larger screen.
 *
 * It holds no store of its own on purpose: the grid editor opens it through
 * `editorStore` (see `ColorChooser`) and the triangular earring straight off
 * the saved pattern (see `TrianglePalette`), and both get the same sheet.
 */
export function ColorChooserSheet({
  slot,
  mode,
  slots,
  patternId,
  letter = '',
  onUse,
  onClose,
  onPhotoPalette,
}: ColorChooserSheetProps) {
  const recent = useRecentColors(patternId, slots)
  const current = slots[slot] ?? null
  const [draft, setDraft] = useState<string | null>(mode === 'recolor' ? current : null)
  const [exactOpen, setExactOpen] = useState(false)
  const exactRef = useRef<HTMLDivElement>(null)

  // The picker opens below the fold of a phone sheet — bring it into view.
  useEffect(() => {
    if (exactOpen) exactRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'end' })
  }, [exactOpen])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  function use() {
    if (!draft) return
    onUse(draft)
    onClose()
  }

  const title = mode === 'recolor' ? t.editor.chooser.recolorTitle(letter) : t.editor.chooser.fillTitle(slot + 1)
  const neighbours = slots.filter((hex, i): hex is string => Boolean(hex) && i !== slot)
  const canUse = Boolean(draft) && !(mode === 'recolor' && draft === current)

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/40 md:items-center md:justify-center" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="color-chooser-title"
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[88dvh] w-full flex-col rounded-t-2xl bg-surface pb-[env(safe-area-inset-bottom)] md:max-h-[85vh] md:max-w-md md:rounded-2xl md:pb-0"
      >
        <div className="flex justify-center pt-2 md:hidden">
          <div className="h-1 w-10 rounded-full bg-surface-3" />
        </div>
        <div className="shrink-0 px-4 pb-3 pt-2 md:pt-4">
          <h2 id="color-chooser-title" className="text-base font-semibold">
            {title}
          </h2>
          <p className="text-xs text-text-muted">
            {mode === 'recolor' ? t.editor.chooser.recolorHint : t.editor.chooser.fillHint}
          </p>
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-4 pb-4">
          <div className="flex items-center gap-3 rounded-2xl bg-surface-2 p-3">
            <span
              className="h-11 w-14 shrink-0 rounded-xl border border-black/10"
              style={{ backgroundColor: draft ?? 'var(--color-surface-3)' }}
            />
            <div className="flex min-w-0 flex-col gap-1.5">
              <div className="flex gap-1">
                {[...neighbours, draft].filter(Boolean).slice(-8).map((hex, i) => (
                  <span key={`${hex}-${i}`} className="h-3 w-4 rounded-[4px]" style={{ backgroundColor: hex! }} />
                ))}
              </div>
              <p className="truncate text-sm font-semibold">{draft ? describeColor(draft) : t.editor.chooser.pickTone}</p>
              <p className="text-xs text-text-muted">{t.editor.chooser.previewHint}</p>
            </div>
          </div>

          {mode === 'fill' && onPhotoPalette && (
            <button
              onClick={() => {
                onClose()
                onPhotoPalette()
              }}
              className="flex items-center gap-2 rounded-xl border border-border px-3 py-2.5 text-left text-sm font-semibold hover:bg-surface-2"
            >
              <ImagePlus size={18} className="text-text-muted" />
              {t.editor.photoPalette.open}
              <ChevronRight size={14} className="ml-auto text-text-soft" />
            </button>
          )}

          {recent.length > 0 && (
            <section>
              <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-text-muted">{t.editor.chooser.recent}</h3>
              <div className="flex flex-wrap gap-2">
                {recent.map((hex) => (
                  <Swatch key={hex} hex={hex} chosen={draft === hex} onPick={setDraft} round />
                ))}
              </div>
            </section>
          )}

          <section>
            <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-text-muted">{t.editor.chooser.tones}</h3>
            <div className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${TONES_PER_FAMILY}, minmax(0, 1fr))` }}>
              {TONE_FAMILIES.flatMap((family) =>
                family.tones.map((hex) => (
                  <Swatch key={hex} hex={hex} label={family.name} chosen={draft === hex} onPick={setDraft} />
                )),
              )}
            </div>
          </section>

          <section>
            <button
              onClick={() => setExactOpen((v) => !v)}
              aria-expanded={exactOpen}
              className={`flex h-11 w-full items-center justify-center gap-2 rounded-full border-2 text-sm font-semibold transition-colors
                ${exactOpen ? 'border-accent-500 bg-accent-500/10 text-text' : 'border-accent-500 bg-accent-500 text-accent-ink hover:bg-accent-600'}`}
            >
              <Pipette size={16} />
              {t.editor.chooser.exact}
              <ChevronRight size={16} className={`transition-transform ${exactOpen ? 'rotate-90' : ''}`} />
            </button>
            {exactOpen && (
              <div ref={exactRef} className="mt-3">
                <ColorPicker value={draft ?? EXACT_START} onChange={setDraft} />
              </div>
            )}
          </section>
        </div>

        <div className="flex shrink-0 gap-2 border-t border-border px-4 py-3">
          <button onClick={onClose} className="h-11 flex-1 rounded-full bg-surface-2 text-sm font-semibold">
            {t.editor.chooser.cancel}
          </button>
          <button
            onClick={use}
            disabled={!canUse}
            className="h-11 flex-1 rounded-full bg-accent-500 text-sm font-semibold text-accent-ink disabled:opacity-40"
          >
            {t.editor.chooser.use}
          </button>
        </div>
      </div>
    </div>
  )
}

function Swatch({
  hex,
  label,
  chosen,
  onPick,
  round,
}: {
  hex: string
  label?: string
  chosen: boolean
  onPick: (hex: string) => void
  round?: boolean
}) {
  const name = label ? `${label} · ${describeColor(hex)}` : describeColor(hex)
  return (
    <button
      onClick={() => onPick(hex)}
      aria-label={name}
      aria-pressed={chosen}
      title={name}
      className={`border border-black/10 ${round ? 'h-9 w-9 rounded-full' : 'aspect-square w-full rounded-lg'}
        ${chosen ? 'ring-2 ring-accent-500 ring-offset-2 ring-offset-surface' : ''}`}
      style={{ backgroundColor: hex }}
    />
  )
}
