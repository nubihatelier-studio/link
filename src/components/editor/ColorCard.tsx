import { useEffect, useState } from 'react'
import { ArrowLeftRight, Merge, Palette, SquareDashedMousePointer, CircleDashed, type LucideIcon } from 'lucide-react'
import { useEditorStore } from '@/store/editorStore'
import { usePatternLetters } from '@/hooks/usePatternLetters'
import { contrastTextColor } from '@/lib/color'
import { describeColor } from '@/lib/colorName'
import { t } from '@/i18n/es'

/**
 * A color's card: everything that acts on one color of the pattern, as big
 * rows instead of the four 24px icons each palette row used to carry.
 * Opened by tapping the active color again, or a color's row in the palette.
 *
 * Swap and merge need a second color, so they turn the card into a picker of
 * the other painted colors, with a way back.
 */
export function ColorCard({ onSelected }: { onSelected?: () => void }) {
  const slot = useEditorStore((s) => s.colorCard)
  if (slot === null) return null
  return <Card key={slot} slot={slot} onSelected={onSelected} />
}

function Card({ slot, onSelected }: { slot: number; onSelected?: () => void }) {
  const hex = useEditorStore((s) => s.slots[slot] ?? null)
  const close = useEditorStore((s) => s.closeColorCard)
  const openColorChooser = useEditorStore((s) => s.openColorChooser)
  const swapColors = useEditorStore((s) => s.swapColors)
  const mergeSlotInto = useEditorStore((s) => s.mergeSlotInto)
  const selectColor = useEditorStore((s) => s.selectColor)
  const emptySlot = useEditorStore((s) => s.emptySlot)
  const letters = usePatternLetters()
  const [picking, setPicking] = useState<'swap' | 'merge' | null>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [close])

  if (!hex) return null
  const entry = letters.find((l) => l.hex.toLowerCase() === hex.toLowerCase())
  const painted = Boolean(entry)
  const others = letters.filter((l) => l.hex.toLowerCase() !== hex.toLowerCase())

  function pick(otherHex: string) {
    if (picking === 'swap') swapColors(hex!, otherHex)
    else mergeSlotInto(slot, otherHex)
    close()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/40 md:items-center md:justify-center" onClick={close}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="color-card-title"
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[85dvh] w-full flex-col rounded-t-2xl bg-surface pb-[env(safe-area-inset-bottom)] md:max-w-sm md:rounded-2xl md:pb-0"
      >
        <div className="flex justify-center pt-2 md:hidden">
          <div className="h-1 w-10 rounded-full bg-surface-3" />
        </div>
        <div className="flex items-center gap-3 px-4 pb-3 pt-3">
          <span
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-black/10 text-lg font-bold"
            style={{ backgroundColor: hex, color: contrastTextColor(hex) }}
          >
            {entry?.letter ?? ''}
          </span>
          <div className="min-w-0">
            <h2 id="color-card-title" className="text-base font-semibold">
              {t.editor.card.title(entry?.letter ?? '')}
            </h2>
            <p className="truncate text-xs text-text-muted">
              {describeColor(hex)} · {t.editor.card.count(entry?.count ?? 0)}
            </p>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-3">
          {picking ? (
            <div className="flex flex-col gap-3">
              <p className="text-sm text-text-muted">{picking === 'swap' ? t.editor.card.swapPick : t.editor.card.mergePick}</p>
              <div className="flex flex-wrap gap-2.5">
                {others.map((o) => (
                  <button
                    key={o.hex}
                    onClick={() => pick(o.hex)}
                    aria-label={t.editor.usedColorHint(o.letter, o.count)}
                    className="flex h-11 w-11 items-center justify-center rounded-full border border-black/10 text-sm font-bold"
                    style={{ backgroundColor: o.hex, color: contrastTextColor(o.hex) }}
                  >
                    {o.letter}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="flex flex-col overflow-hidden rounded-2xl border border-border">
              <Action icon={Palette} label={t.editor.card.recolor} hint={painted ? t.editor.card.recolorHint : undefined}
                onClick={() => openColorChooser(slot, painted ? 'recolor' : 'fill')} />
              {painted && others.length > 0 && (
                <>
                  <Action icon={ArrowLeftRight} label={t.editor.card.swap} onClick={() => setPicking('swap')} />
                  <Action icon={Merge} label={t.editor.card.merge} onClick={() => setPicking('merge')} />
                </>
              )}
              {painted && (
                <Action
                  icon={SquareDashedMousePointer}
                  label={t.editor.card.select}
                  onClick={() => {
                    selectColor(hex)
                    close()
                    onSelected?.()
                  }}
                />
              )}
              <Action
                icon={CircleDashed}
                label={t.editor.card.empty}
                hint={painted ? t.editor.card.emptyBlocked : undefined}
                disabled={painted}
                onClick={() => {
                  emptySlot(slot)
                  close()
                }}
              />
            </div>
          )}
        </div>

        <div className="shrink-0 border-t border-border px-4 py-3">
          <button
            onClick={() => (picking ? setPicking(null) : close())}
            className="h-11 w-full rounded-full bg-surface-2 text-sm font-semibold"
          >
            {picking ? t.editor.card.back : t.editor.card.close}
          </button>
        </div>
      </div>
    </div>
  )
}

function Action({
  icon: Icon,
  label,
  hint,
  disabled,
  onClick,
}: {
  icon: LucideIcon
  label: string
  hint?: string
  disabled?: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="flex min-h-[52px] items-center gap-3 border-t border-border px-3.5 text-left first:border-t-0 hover:bg-surface-2 disabled:cursor-default disabled:hover:bg-transparent"
    >
      <Icon size={20} className="shrink-0 text-text-muted" />
      <span className={`flex-1 text-sm ${disabled ? 'text-text-soft' : ''}`}>{label}</span>
      {hint && <span className="text-xs text-text-soft">{hint}</span>}
    </button>
  )
}
