import { useEditorStore } from '@/store/editorStore'
import type { LoopVariant } from '@/engine/types'
import { DEFAULT_LOOP_BEAD_COUNT, DEFAULT_LOOP_COLOR, MAX_LOOP_BEAD_COUNT, MIN_LOOP_BEAD_COUNT } from '@/engine/loop'
import { paletteFromCells } from '@/lib/palette'
import { SegmentedControl } from '@/components/shared/SegmentedControl'
import { t } from '@/i18n/es'

const VARIANT_OPTIONS: { value: LoopVariant; label: string }[] = [
  { value: 'woven', label: t.editor.loop.variantWoven },
  { value: 'metal', label: t.editor.loop.variantMetal },
]

export function LoopPanel() {
  const { cells, loop, setLoop } = useEditorStore()
  const palette = paletteFromCells(cells)

  function enable() {
    setLoop({
      variant: 'woven',
      beadCount: DEFAULT_LOOP_BEAD_COUNT,
      color: palette[0]?.hex ?? DEFAULT_LOOP_COLOR,
    })
  }

  function setVariant(variant: LoopVariant) {
    if (!loop) return
    setLoop({ ...loop, variant })
  }

  function setBeadCount(raw: number) {
    if (!loop) return
    const beadCount = Math.max(MIN_LOOP_BEAD_COUNT, Math.min(MAX_LOOP_BEAD_COUNT, Math.round(raw) || 0))
    setLoop({ ...loop, beadCount })
  }

  function setColor(color: string) {
    if (!loop) return
    setLoop({ ...loop, color })
  }

  return (
    <div className="flex h-full flex-col gap-3 overflow-y-auto p-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-text-muted">{t.editor.loop.title}</h3>
        <button
          onClick={() => (loop ? setLoop(undefined) : enable())}
          aria-pressed={!!loop}
          className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold transition-colors
            ${loop ? 'bg-accent-500 text-accent-ink' : 'bg-surface-2 text-text-muted hover:bg-surface-3'}`}
        >
          {loop ? t.editor.loop.remove : t.editor.loop.add}
        </button>
      </div>

      {loop && (
        <div className="flex flex-col gap-3">
          <div>
            <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-text-muted">
              {t.editor.loop.variant}
            </p>
            <SegmentedControl<LoopVariant> value={loop.variant} onChange={setVariant} options={VARIANT_OPTIONS} />
            <p className="mt-1.5 text-[11px] text-text-muted">
              {loop.variant === 'woven' ? t.editor.loop.wovenHint : t.editor.loop.metalHint}
            </p>
          </div>

          {loop.variant === 'woven' && (
            <>
              <label className="flex flex-col gap-1.5">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-text-muted">
                  {t.editor.loop.beadCount}
                </span>
                <input
                  type="number"
                  min={MIN_LOOP_BEAD_COUNT}
                  max={MAX_LOOP_BEAD_COUNT}
                  value={loop.beadCount}
                  onChange={(e) => setBeadCount(Number(e.target.value))}
                  className="w-20 rounded-md border border-border bg-surface-1 px-2 py-1 text-center text-sm font-semibold"
                />
              </label>

              <div>
                <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-text-muted">
                  {t.editor.loop.color}
                </p>
                {palette.length === 0 ? (
                  <p className="text-[11px] text-text-muted">{t.editor.loop.noColorsYet}</p>
                ) : (
                  <>
                    <div className="flex flex-wrap gap-1.5">
                      {palette.map((p) => (
                        <button
                          key={p.hex}
                          onClick={() => setColor(p.hex)}
                          aria-label={p.hex}
                          aria-pressed={loop.color === p.hex}
                          className={`h-7 w-7 rounded-full border-2 transition-transform
                            ${loop.color === p.hex ? 'scale-110 border-accent-500' : 'border-border hover:scale-105'}`}
                          style={{ backgroundColor: p.hex }}
                        />
                      ))}
                    </div>
                    <p className="mt-1.5 text-[11px] text-text-muted">{t.editor.loop.colorHint}</p>
                  </>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
