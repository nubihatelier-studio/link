import { useEffect, useMemo, useRef, useState } from 'react'
import { ImagePlus } from 'lucide-react'
import { useEditorStore } from '@/store/editorStore'
import type { RGB } from '@/lib/color'
import { describeColor } from '@/lib/colorName'
import { MAX_PHOTO_COLORS, MIN_PHOTO_COLORS, paletteFromPixels, readPhotoPixels, suggestPhotoColorCount } from '@/lib/photoPalette'
import { SliderField } from '@/components/shared/SliderField'
import { t } from '@/i18n/es'

/**
 * "Paleta desde una foto": pick or drop a photo, see its main colors as
 * beads, tap away the ones not wanted (the table it was photographed on is
 * usually the biggest), and load the rest into the tray — added to what's
 * there, never replacing a color. A sheet on a phone, a dialog on a larger
 * screen; rendered once by the editor page and opened through the store.
 */
export function PhotoPaletteDialog() {
  const open = useEditorStore((s) => s.photoPaletteOpen)
  if (!open) return null
  return <Dialog />
}

function Dialog() {
  const setOpen = useEditorStore((s) => s.setPhotoPaletteOpen)
  const loadColors = useEditorStore((s) => s.loadColors)
  const inputRef = useRef<HTMLInputElement>(null)
  const [photo, setPhoto] = useState<{ pixels: RGB[]; url: string } | null>(null)
  const [count, setCount] = useState(MIN_PHOTO_COLORS)
  const [excluded, setExcluded] = useState<Set<string>>(new Set())
  const [status, setStatus] = useState<'idle' | 'reading' | 'error'>('idle')
  const [dragging, setDragging] = useState(false)
  const close = () => setOpen(false)

  // k-means seeds at random: computed once per photo and count, so a re-render never reshuffles the colors.
  const colors = useMemo(() => (photo ? paletteFromPixels(photo.pixels, count) : []), [photo, count])
  const included = colors.filter((c) => !excluded.has(c.hex))

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [setOpen])

  useEffect(() => () => {
    if (photo) URL.revokeObjectURL(photo.url)
  }, [photo])

  async function takeFile(file: File | undefined) {
    if (!file) return
    setStatus('reading')
    try {
      const read = await readPhotoPixels(file)
      if (read.pixels.length === 0) throw new Error('empty')
      setPhoto(read)
      setCount(suggestPhotoColorCount(read.pixels))
      setExcluded(new Set())
      setStatus('idle')
    } catch {
      setStatus('error')
    }
  }

  function toggle(hex: string) {
    setExcluded((prev) => {
      const next = new Set(prev)
      if (next.has(hex)) next.delete(hex)
      else next.add(hex)
      return next
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/40 md:items-center md:justify-center" onClick={close}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="photo-palette-title"
        onClick={(e) => e.stopPropagation()}
        onDragOver={(e) => {
          e.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDragging(false)
          takeFile(e.dataTransfer.files[0])
        }}
        className={`flex max-h-[88dvh] w-full flex-col rounded-t-2xl bg-surface pb-[env(safe-area-inset-bottom)] md:max-h-[85vh] md:max-w-md md:rounded-2xl md:pb-0
          ${dragging ? 'ring-2 ring-accent-500' : ''}`}
      >
        <div className="shrink-0 px-4 pb-3 pt-4">
          <h2 id="photo-palette-title" className="text-base font-semibold">
            {t.editor.photoPalette.title}
          </h2>
          <p className="text-xs text-text-muted">{t.editor.photoPalette.privacy}</p>
        </div>

        <input
          id="photo-palette-file"
          ref={inputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            takeFile(e.target.files?.[0])
            e.target.value = ''
          }}
        />

        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 pb-4">
          {!photo ? (
            <button
              onClick={() => inputRef.current?.click()}
              className={`flex flex-col items-center gap-2 rounded-2xl border-2 border-dashed px-4 py-10 text-center transition-colors
                ${dragging ? 'border-accent-500 bg-accent-500/10' : 'border-border bg-surface-2 hover:border-accent-300'}`}
            >
              <ImagePlus size={28} className="text-text-muted" />
              <span className="font-semibold">{status === 'reading' ? t.editor.photoPalette.reading : t.editor.photoPalette.pick}</span>
              <span className="hidden text-xs text-text-muted md:block">{t.editor.photoPalette.dropHint}</span>
            </button>
          ) : (
            <>
              <div className="flex items-center gap-3">
                <img src={photo.url} alt="" className="h-16 w-16 shrink-0 rounded-xl border border-border object-cover" />
                <p className="flex-1 text-xs text-text-muted">{t.editor.photoPalette.hint}</p>
                <button
                  onClick={() => inputRef.current?.click()}
                  className="shrink-0 rounded-full bg-surface-2 px-3 py-1.5 text-xs font-semibold text-text-muted hover:text-text"
                >
                  {t.editor.photoPalette.another}
                </button>
              </div>

              <SliderField
                label={t.editor.photoPalette.count}
                value={count}
                min={MIN_PHOTO_COLORS}
                max={MAX_PHOTO_COLORS}
                onChange={(n) => {
                  setCount(n)
                  setExcluded(new Set())
                }}
              />

              <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                {colors.map((c) => {
                  const name = describeColor(c.hex)
                  const isIn = !excluded.has(c.hex)
                  return (
                    <button
                      key={c.hex}
                      onClick={() => toggle(c.hex)}
                      aria-pressed={isIn}
                      aria-label={t.editor.photoPalette.toggle(name, isIn)}
                      className={`flex flex-col items-center gap-1 rounded-xl border p-2 text-center transition-opacity
                        ${isIn ? 'border-border' : 'border-dashed border-border opacity-40'}`}
                    >
                      <span className="h-8 w-10 rounded-lg border border-black/10" style={{ backgroundColor: c.hex }} />
                      <span className={`w-full truncate text-[11px] ${isIn ? '' : 'line-through'}`}>{name}</span>
                      <span className="text-[10px] tabular-nums text-text-muted">
                        {t.editor.photoPalette.share(Math.max(1, Math.round(c.share * 100)))}
                      </span>
                    </button>
                  )
                })}
              </div>
            </>
          )}
          {status === 'error' && <p className="text-sm text-red-500">{t.editor.photoPalette.error}</p>}
        </div>

        <div className="flex shrink-0 gap-2 border-t border-border px-4 py-3">
          <button onClick={close} className="h-11 flex-1 rounded-full bg-surface-2 text-sm font-semibold">
            {t.editor.photoPalette.cancel}
          </button>
          <button
            onClick={() => {
              loadColors(included.map((c) => c.hex))
              close()
            }}
            disabled={included.length === 0}
            className="h-11 flex-1 rounded-full bg-accent-500 text-sm font-semibold text-accent-ink disabled:opacity-40"
          >
            {t.editor.photoPalette.load(included.length)}
          </button>
        </div>
      </div>
    </div>
  )
}
