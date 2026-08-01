import { useMemo, useState } from 'react'
import {
  ArrowDown,
  ArrowDownLeft,
  ArrowDownRight,
  ArrowRight,
  BoxSelect,
  ChevronDown,
  FlipHorizontal2,
  FlipVertical2,
  Merge,
  Plus,
  Replace,
  Shuffle,
} from 'lucide-react'
import { useEditorStore } from '@/store/editorStore'
import type { GradientDirection } from '@/engine/gradient'
import { QUICK_SWATCHES } from '@/data/standardPalette'
import { usePatternLetters } from '@/hooks/usePatternLetters'
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
    selection,
    cloneDirection,
    setCloneDirection,
    cloneSelection,
    mergeColors,
    swapColors,
    selectColor,
    reflectSelection,
    applyGradient,
  } = useEditorStore()
  const [pickerOpen, setPickerOpen] = useState(true)
  // Open by default — the group is collapsible so a long "sin usar" row can
  // be folded away on a narrow screen, not to hide it until asked for.
  const [unusedOpen, setUnusedOpen] = useState(true)
  const [mergeTarget, setMergeTarget] = useState<string | null>(null)
  const [replaceTarget, setReplaceTarget] = useState<string | null>(null)
  const [replaceDraft, setReplaceDraft] = useState('#000000')
  const [swapTarget, setSwapTarget] = useState<string | null>(null)
  const [gradientStart, setGradientStart] = useState<string | null>(null)
  const [gradientEnd, setGradientEnd] = useState<string | null>(null)
  const [gradientDirection, setGradientDirection] = useState<GradientDirection>('vertical')

  function closeAllPanels() {
    setMergeTarget(null)
    setReplaceTarget(null)
    setSwapTarget(null)
  }

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

  function handleSelectColor(hex: string) {
    closeAllPanels()
    selectColor(hex)
  }

  function confirmReplace(fromHex: string) {
    mergeColors(fromHex, replaceDraft)
    setReplaceTarget(null)
  }

  // Already in A, B, C… order — `assignLetters` returns used colors by order
  // of first use, which is exactly the order this list should read in.
  const palette = usePatternLetters()
  const colorLetters = useMemo(
    () => Object.fromEntries(palette.map((p) => [p.hex, p.letter])),
    [palette],
  )
  const activeHex = slots[activeSlot]

  /**
   * The swatch row splits the palette in two, because it was showing two
   * different things as if they were one: the colors this design is made of
   * (they carry a letter and a bead count — they're the chart's notation) and
   * the colors merely loaded and ready to paint with. Used ones come first in
   * letter order; the rest follow, dimmed and letterless, and cross over the
   * moment they're painted.
   *
   * Keyed by color rather than by slot: a color used in the pattern is one
   * entry even if it sits in two slots, and one that's used but no longer in
   * any slot (its slot was recolored) still gets a swatch — `slotIndex` -1
   * means "give it a slot when picked" instead of leaving it unreachable.
   */
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

  function isActive(swatch: { hex: string; slotIndex: number }) {
    return swatch.slotIndex >= 0 ? activeSlot === swatch.slotIndex : activeHex === swatch.hex
  }

  function pick(swatch: { hex: string; slotIndex: number }) {
    if (swatch.slotIndex >= 0) setActiveSlot(swatch.slotIndex)
    else addSlot(swatch.hex)
  }

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

        <div className="mt-3 flex flex-col gap-3">
          {used.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {used.map((swatch) => (
                <UsedSwatch key={swatch.hex} swatch={swatch} active={isActive(swatch)} onSelect={() => pick(swatch)} />
              ))}
            </div>
          )}

          {unused.length > 0 &&
            // Before anything is painted every color is "unused", so the split
            // has nothing to separate — show the plain row instead of filing
            // the whole palette under a heading that only states the obvious.
            (used.length === 0 ? (
              <div className="flex flex-wrap gap-2">
                {unused.map((swatch) => (
                  <UnusedSwatch key={swatch.key} swatch={swatch} active={isActive(swatch)} onSelect={() => pick(swatch)} />
                ))}
              </div>
            ) : (
              <div className="border-t border-border pt-3">
                <button
                  onClick={() => setUnusedOpen((v) => !v)}
                  aria-expanded={unusedOpen}
                  title={unusedOpen ? t.editor.hideUnusedColors : t.editor.showUnusedColors}
                  className="flex w-full items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-text-muted transition-colors hover:text-text"
                >
                  <ChevronDown size={13} className={unusedOpen ? '' : '-rotate-90'} />
                  {t.editor.unusedColors} ({unused.length})
                </button>
                {unusedOpen && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {unused.map((swatch) => (
                      <UnusedSwatch key={swatch.key} swatch={swatch} active={isActive(swatch)} onSelect={() => pick(swatch)} />
                    ))}
                  </div>
                )}
              </div>
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
                    <span className="ml-1 text-text-muted">· {match.color.name}</span>
                  </span>
                  <span className="text-xs font-semibold">{p.count}</span>
                  <button
                    aria-label={t.advancedColor.selectColor}
                    title={t.advancedColor.selectColor}
                    onClick={() => handleSelectColor(p.hex)}
                    className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-text-muted transition-colors hover:bg-surface-3"
                  >
                    <BoxSelect size={13} />
                  </button>
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
          {palette.length === 0 && <p className="text-xs text-text-muted">{t.editor.paletteEmpty}</p>}
        </ul>
      </section>

      {palette.length >= 2 && (
        <GradientSection
          palette={palette}
          colorLetters={colorLetters}
          start={gradientStart ?? palette[0].hex}
          end={gradientEnd ?? palette[1].hex}
          direction={gradientDirection}
          onSetStart={setGradientStart}
          onSetEnd={setGradientEnd}
          onSetDirection={setGradientDirection}
          onApply={() => applyGradient(gradientStart ?? palette[0].hex, gradientEnd ?? palette[1].hex, gradientDirection)}
        />
      )}
    </div>
  )
}

/**
 * A color the design actually uses: its letter inside the swatch, its bead
 * count underneath. The count sits outside the circle on purpose — the circle
 * stays a full 36px touch target with a single legible character in it,
 * instead of shrinking two pieces of text to fit.
 */
function UsedSwatch({
  swatch,
  active,
  onSelect,
}: {
  swatch: { hex: string; letter: string; count: number }
  active: boolean
  onSelect: () => void
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
        className={`flex h-9 w-9 items-center justify-center rounded-full border-2 text-xs font-bold
          ${active ? 'border-accent-500' : 'border-border'}`}
        style={{ backgroundColor: swatch.hex, color: contrastTextColor(swatch.hex) }}
      >
        {swatch.letter}
      </span>
      <span className="text-[10px] leading-none text-text-muted">{swatch.count}</span>
    </button>
  )
}

/**
 * A color loaded in the palette but not painted anywhere yet — no letter (it
 * hasn't earned one), dimmed so it reads as material rather than notation,
 * and fully selectable: painting with it is exactly what promotes it.
 */
function UnusedSwatch({
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
        ${active ? 'border-accent-500 opacity-100' : 'border-border opacity-50'}`}
      style={{ backgroundColor: swatch.hex }}
    />
  )
}

function GradientSection({
  palette,
  colorLetters,
  start,
  end,
  direction,
  onSetStart,
  onSetEnd,
  onSetDirection,
  onApply,
}: {
  palette: { hex: string; count: number }[]
  colorLetters: Record<string, string>
  start: string
  end: string
  direction: GradientDirection
  onSetStart: (hex: string) => void
  onSetEnd: (hex: string) => void
  onSetDirection: (direction: GradientDirection) => void
  onApply: () => void
}) {
  const directions: { value: GradientDirection; icon: typeof ArrowDown; label: string }[] = [
    { value: 'vertical', icon: ArrowDown, label: t.gradient.directionVertical },
    { value: 'diagonalDR', icon: ArrowDownRight, label: t.gradient.directionDiagonalDR },
    { value: 'diagonalDL', icon: ArrowDownLeft, label: t.gradient.directionDiagonalDL },
  ]

  function swatchRow(selected: string, onSelect: (hex: string) => void) {
    return (
      <div className="flex flex-wrap gap-1.5">
        {palette.map((p) => (
          <button
            key={p.hex}
            title={p.hex}
            onClick={() => onSelect(p.hex)}
            aria-pressed={selected === p.hex}
            className={`flex h-7 w-7 items-center justify-center rounded-md border-2 text-[10px] font-bold
              ${selected === p.hex ? 'border-accent-500' : 'border-border'}`}
            style={{ backgroundColor: p.hex, color: contrastTextColor(p.hex) }}
          >
            {colorLetters[p.hex] ?? ''}
          </button>
        ))}
      </div>
    )
  }

  return (
    <section>
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-muted">{t.gradient.title}</h3>
      <p className="mb-3 text-xs text-text-muted">{t.gradient.hint}</p>

      <p className="mb-1.5 text-[11px] font-semibold text-text-muted">{t.gradient.start}</p>
      {swatchRow(start, onSetStart)}

      <p className="mb-1.5 mt-3 text-[11px] font-semibold text-text-muted">{t.gradient.end}</p>
      {swatchRow(end, onSetEnd)}

      <p className="mb-1.5 mt-3 text-[11px] font-semibold text-text-muted">{t.gradient.direction}</p>
      <div className="grid grid-cols-3 gap-2">
        {directions.map(({ value, icon: Icon, label }) => (
          <button
            key={value}
            onClick={() => onSetDirection(value)}
            title={label}
            className={`flex items-center justify-center gap-1.5 rounded-xl border px-2 py-2.5 text-xs font-medium transition-colors
              ${direction === value ? 'border-accent-500 bg-accent-500 text-accent-ink' : 'border-border bg-surface-2 text-text-muted hover:bg-surface-3 hover:text-text'}`}
          >
            <Icon size={15} />
          </button>
        ))}
      </div>

      <button
        onClick={onApply}
        className="mt-3 w-full rounded-full bg-accent-500 py-2 text-sm font-semibold text-accent-ink transition-colors hover:bg-accent-400"
      >
        {t.gradient.apply}
      </button>
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
