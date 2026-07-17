import { useMemo, useState } from 'react'
import { ArrowDown, ArrowRight, FlipHorizontal2, FlipVertical2, Merge, Plus, Replace, Shuffle } from 'lucide-react'
import { useEditorStore } from '@/store/editorStore'
import { QUICK_SWATCHES } from '@/data/standardPalette'
import { paletteFromCells } from '@/lib/palette'
import { catalogMatchForHex, contrastTextColor } from '@/lib/color'
import { ColorPicker } from './ColorPicker'
import { t } from '@/i18n/es'

const CLONE_REPEATS = [2, 3, 5]

export function ColorPanel() {
  const {
    slots,
    activeSlot,
    setActiveSlot,
    setSlotColor,
    addSlot,
    cells,
    selection,
    cloneDirection,
    setCloneDirection,
    cloneSelection,
    colorLetters,
    mergeColors,
    swapColors,
    reflectSelection,
  } = useEditorStore()
  const [pickerOpen, setPickerOpen] = useState(true)
  const [mergeTarget, setMergeTarget] = useState<string | null>(null)
  const [replaceTarget, setReplaceTarget] = useState<string | null>(null)
  const [replaceDraft, setReplaceDraft] = useState('#000000')
  const [swapTarget, setSwapTarget] = useState<string | null>(null)

  function openReplace(hex: string) {
    setMergeTarget(null)
    setSwapTarget(null)
    setReplaceDraft(hex)
    setReplaceTarget((current) => (current === hex ? null : hex))
  }

  function openMerge(hex: string) {
    setReplaceTarget(null)
    setSwapTarget(null)
    setMergeTarget((current) => (current === hex ? null : hex))
  }

  function openSwap(hex: string) {
    setReplaceTarget(null)
    setMergeTarget(null)
    setSwapTarget((current) => (current === hex ? null : hex))
  }

  function confirmReplace(fromHex: string) {
    mergeColors(fromHex, replaceDraft)
    setReplaceTarget(null)
  }

  // Sorted by letter (not usage count) so this list reads in the same
  // obvious A, B, C… order as the slot row above it, instead of jumping
  // around whenever the most-used color changes.
  const palette = useMemo(
    () =>
      [...paletteFromCells(cells)].sort((a, b) =>
        (colorLetters[a.hex] ?? '').localeCompare(colorLetters[b.hex] ?? ''),
      ),
    [cells, colorLetters],
  )
  const activeHex = slots[activeSlot]

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
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-muted">
          {t.editor.activeColor}
        </h3>
        <div className="flex items-center gap-3">
          <button
            title={t.editor.colorPickerToggle}
            className="h-12 w-12 shrink-0 rounded-xl border border-border"
            style={{ backgroundColor: activeHex }}
            onClick={() => setPickerOpen((v) => !v)}
          />
          <p className="font-mono text-sm">{activeHex}</p>
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          {slots.map((hex, i) => (
            <button
              key={i}
              onClick={() => setActiveSlot(i)}
              className={`flex h-9 w-9 items-center justify-center rounded-full border-2 text-xs font-bold
                ${activeSlot === i ? 'border-accent-500' : 'border-border'}`}
              style={{ backgroundColor: hex, color: contrastTextColor(hex) }}
            >
              {colorLetters[hex] ?? ''}
            </button>
          ))}
          <button
            onClick={() => {
              addSlot()
              setPickerOpen(true)
            }}
            aria-label={t.editor.addColor}
            title={t.editor.addColor}
            className="flex h-9 w-9 items-center justify-center rounded-full border-2 border-dashed border-border text-text-muted transition-colors hover:border-accent-500 hover:text-accent-500"
          >
            <Plus size={16} />
          </button>
        </div>
      </section>

      {pickerOpen && (
        <section className="flex flex-col gap-3">
          <ColorPicker value={activeHex} onChange={(hex) => setSlotColor(activeSlot, hex)} />
          <div className="grid grid-cols-6 gap-1.5">
            {QUICK_SWATCHES.map((hex) => (
              <button
                key={hex}
                title={hex}
                onClick={() => setSlotColor(activeSlot, hex)}
                className="aspect-square rounded-md border border-border/50"
                style={{ backgroundColor: hex }}
              />
            ))}
          </div>
        </section>
      )}

      <section>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-muted">
          {t.editor.palette} ({palette.length})
        </h3>
        <ul className="flex flex-col gap-1.5">
          {palette.map((p) => {
            const match = catalogMatchForHex(p.hex)
            const isMergeOpen = mergeTarget === p.hex
            const isReplaceOpen = replaceTarget === p.hex
            const isSwapOpen = swapTarget === p.hex
            const otherColors = palette.filter((o) => o.hex !== p.hex)
            return (
              <li key={p.hex} className="rounded-lg hover:bg-surface-2">
                <div className="flex items-center gap-2 px-2 py-1.5">
                  <span
                    onDoubleClick={() => openReplace(p.hex)}
                    title={p.hex}
                    className="flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center rounded-md border border-border text-[10px] font-bold"
                    style={{ backgroundColor: p.hex, color: contrastTextColor(p.hex) }}
                  >
                    {colorLetters[p.hex] ?? ''}
                  </span>
                  <span className="flex-1 truncate text-xs text-text-muted" title={p.hex}>
                    {match.exact ? '' : '~'}
                    {match.color.code}
                    <span className="ml-1 text-text-soft">· {match.color.name}</span>
                  </span>
                  <span className="text-xs font-semibold">{p.count}</span>
                  <button
                    aria-label={t.advancedColor.replaceAll}
                    title={t.advancedColor.replaceAll}
                    onClick={() => openReplace(p.hex)}
                    className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md transition-colors
                      ${isReplaceOpen ? 'bg-accent-500 text-accent-ink' : 'text-text-muted hover:bg-surface-3'}`}
                  >
                    <Replace size={13} />
                  </button>
                  {otherColors.length > 0 && (
                    <button
                      aria-label={t.advancedColor.swap}
                      title={t.advancedColor.swap}
                      onClick={() => openSwap(p.hex)}
                      className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md transition-colors
                        ${isSwapOpen ? 'bg-accent-500 text-accent-ink' : 'text-text-muted hover:bg-surface-3'}`}
                    >
                      <Shuffle size={13} />
                    </button>
                  )}
                  {otherColors.length > 0 && (
                    <button
                      aria-label={t.advancedColor.merge}
                      title={t.advancedColor.merge}
                      onClick={() => openMerge(p.hex)}
                      className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md transition-colors
                        ${isMergeOpen ? 'bg-accent-500 text-accent-ink' : 'text-text-muted hover:bg-surface-3'}`}
                    >
                      <Merge size={13} />
                    </button>
                  )}
                </div>
                {isReplaceOpen && (
                  <div data-testid="replace-panel" className="mx-2 mb-2 flex flex-col gap-2 rounded-lg bg-surface-3 p-2">
                    <p className="text-[11px] font-semibold text-text-muted">{t.advancedColor.replaceAll}</p>
                    <ColorPicker value={replaceDraft} onChange={setReplaceDraft} />
                    <div className="grid grid-cols-8 gap-1">
                      {QUICK_SWATCHES.map((hex) => (
                        <button
                          key={hex}
                          title={hex}
                          onClick={() => setReplaceDraft(hex)}
                          className="aspect-square rounded-md border border-border/50"
                          style={{ backgroundColor: hex }}
                        />
                      ))}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] text-text-muted">{t.advancedColor.preview}</span>
                      <span
                        className="h-6 w-6 rounded-md border border-border"
                        style={{ backgroundColor: replaceDraft }}
                      />
                      <button
                        onClick={() => confirmReplace(p.hex)}
                        className="ml-auto rounded-full bg-accent-500 px-3 py-1 text-xs font-semibold text-accent-ink hover:bg-accent-400"
                      >
                        {t.common.confirm}
                      </button>
                    </div>
                  </div>
                )}
                {isSwapOpen && (
                  <div data-testid="swap-panel" className="mx-2 mb-2 rounded-lg bg-surface-3 p-2">
                    <p className="mb-1.5 text-[11px] font-semibold text-text-muted">{t.advancedColor.swap}</p>
                    <div className="flex flex-wrap gap-1.5">
                      {otherColors.map((o) => (
                        <button
                          key={o.hex}
                          title={`${p.hex} ↔ ${o.hex}`}
                          onClick={() => {
                            swapColors(p.hex, o.hex)
                            setSwapTarget(null)
                          }}
                          className="flex h-7 w-7 items-center justify-center rounded-md border border-border text-[10px] font-bold"
                          style={{ backgroundColor: o.hex, color: contrastTextColor(o.hex) }}
                        >
                          {colorLetters[o.hex] ?? ''}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {isMergeOpen && (
                  <div data-testid="merge-panel" className="mx-2 mb-2 rounded-lg bg-surface-3 p-2">
                    <p className="mb-1.5 text-[11px] font-semibold text-text-muted">{t.advancedColor.merge}</p>
                    <div className="flex flex-wrap gap-1.5">
                      {otherColors.map((o) => (
                        <button
                          key={o.hex}
                          title={`${p.hex} → ${o.hex}`}
                          onClick={() => {
                            mergeColors(p.hex, o.hex)
                            setMergeTarget(null)
                          }}
                          className="flex h-7 w-7 items-center justify-center rounded-md border border-border text-[10px] font-bold"
                          style={{ backgroundColor: o.hex, color: contrastTextColor(o.hex) }}
                        >
                          {colorLetters[o.hex] ?? ''}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </li>
            )
          })}
          {palette.length === 0 && <p className="text-xs text-text-soft">{t.editor.paletteEmpty}</p>}
        </ul>
      </section>
    </div>
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
