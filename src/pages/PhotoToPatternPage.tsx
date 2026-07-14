import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { PatternDoc, Technique } from '@/engine/types'
import { BEAD_TYPES, getBeadType } from '@/data/beadTypes'
import { suggestGridForImage, imageToPattern, type ImageToPatternResult } from '@/lib/imageToPattern'
import { catalogMatchForHex } from '@/lib/color'
import { usePatternsStore } from '@/store/patternsStore'
import { t } from '@/i18n/es'
import { Button } from '@/components/shared/Button'
import { Card } from '@/components/shared/Card'
import { SliderField } from '@/components/shared/SliderField'
import { TechniqueIcon } from '@/components/configurator/TechniqueIcon'
import { PatternThumb } from '@/components/shared/PatternThumb'

const TECHNIQUES: Technique[] = ['loom', 'peyote', 'brick']
const REGENERATE_DEBOUNCE_MS = 200

export function PhotoToPatternPage() {
  const navigate = useNavigate()
  const createPatternWithCells = usePatternsStore((s) => s.createPatternWithCells)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [imgUrl, setImgUrl] = useState<string | null>(null)
  const [imgEl, setImgEl] = useState<HTMLImageElement | null>(null)
  const [technique, setTechnique] = useState<Technique>('peyote')
  const [cols, setCols] = useState(40)
  const [rows, setRows] = useState(40)
  const [numColors, setNumColors] = useState(12)
  const [beadTypeId, setBeadTypeId] = useState(BEAD_TYPES[0].id)
  const [processing, setProcessing] = useState(false)
  const [preview, setPreview] = useState<ImageToPatternResult | null>(null)

  const bead = getBeadType(beadTypeId)

  function handleFile(file: File) {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      setImgEl(img)
      setImgUrl(url)
      const suggestion = suggestGridForImage(img.width, img.height, technique, bead.widthMm, bead.heightMm, 50)
      setCols(suggestion.cols)
      setRows(suggestion.rows)
    }
    img.src = url
  }

  // Re-suggest the grid (bead-proportion corrected — see suggestGridForImage)
  // whenever technique or bead type changes, so switching either doesn't
  // leave the grid distorted relative to the new physical cell shape.
  function handleTechniqueChange(next: Technique) {
    setTechnique(next)
    if (imgEl) {
      const suggestion = suggestGridForImage(imgEl.width, imgEl.height, next, bead.widthMm, bead.heightMm, 50)
      setCols(suggestion.cols)
      setRows(suggestion.rows)
    }
  }

  function handleBeadTypeChange(nextId: string) {
    setBeadTypeId(nextId)
    if (imgEl) {
      const nextBead = getBeadType(nextId)
      const suggestion = suggestGridForImage(imgEl.width, imgEl.height, technique, nextBead.widthMm, nextBead.heightMm, 50)
      setCols(suggestion.cols)
      setRows(suggestion.rows)
    }
  }

  // Live preview: regenerates on every parameter change (debounced so a
  // slider drag doesn't re-run k-means on every intermediate tick). Nothing
  // is persisted here — only "Crear patrón" below writes the pattern.
  useEffect(() => {
    if (!imgEl) return
    setProcessing(true)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      const result = imageToPattern(imgEl, { cols, rows, numColors })
      setPreview(result)
      setProcessing(false)
    }, REGENERATE_DEBOUNCE_MS)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [imgEl, technique, cols, rows, numColors, beadTypeId])

  function handleCreate() {
    if (!preview) return
    const id = createPatternWithCells({ technique, cols, rows, beadTypeId }, preview.cells)
    navigate(`/editor/${id}`)
  }

  const previewDoc: PatternDoc | null = preview
    ? { id: 'preview', name: '', config: { technique, cols, rows, beadTypeId }, cells: preview.cells, createdAt: 0, updatedAt: 0 }
    : null

  return (
    <div className="mx-auto min-h-screen max-w-2xl px-4 pb-32 pt-[calc(2rem+env(safe-area-inset-top))] sm:px-8">
      <h1 className="mb-6 text-2xl font-bold">{t.photo.title}</h1>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) handleFile(file)
        }}
      />

      {!imgUrl ? (
        <button
          onClick={() => fileInputRef.current?.click()}
          className="mb-8 flex w-full flex-col items-center gap-3 rounded-2xl border border-dashed border-border bg-surface-2 py-16 text-text-muted hover:border-accent-300"
        >
          <span className="text-3xl">📷</span>
          <span>{t.photo.upload}</span>
        </button>
      ) : (
        <section className="mb-8">
          <div className="flex gap-3">
            <div className="flex-1">
              <p className="mb-2 text-xs font-semibold text-text-muted">{t.photo.original}</p>
              <div className="aspect-square overflow-hidden rounded-2xl border border-border bg-surface-2">
                <img src={imgUrl} alt="" className="h-full w-full object-cover" />
              </div>
            </div>
            <div className="flex-1">
              <p className="mb-2 text-xs font-semibold text-text-muted">
                {t.photo.preview}
                {processing && <span className="ml-1 text-text-soft">· {t.photo.updating}</span>}
              </p>
              <div className="flex aspect-square items-center justify-center overflow-hidden rounded-2xl border border-border bg-surface-2">
                {previewDoc && <PatternThumb pattern={previewDoc} size={200} />}
              </div>
            </div>
          </div>
        </section>
      )}

      {imgUrl && (
        <>
          <section className="mb-8">
            <h2 className="mb-3 text-sm font-semibold text-text-muted">{t.configurator.technique}</h2>
            <div className="grid grid-cols-3 gap-3">
              {TECHNIQUES.map((tech) => (
                <button
                  key={tech}
                  onClick={() => handleTechniqueChange(tech)}
                  className={`flex flex-col items-center gap-2 rounded-2xl border py-4 ${technique === tech ? 'border-accent-500 bg-accent-500/10' : 'border-border bg-surface-2'}`}
                >
                  <TechniqueIcon technique={tech} className={technique === tech ? 'text-accent-500' : 'text-text-muted'} />
                  <span className="text-sm font-semibold">{t.technique[tech]}</span>
                </button>
              ))}
            </div>
          </section>

          <section className="mb-8">
            <h2 className="mb-3 text-sm font-semibold text-text-muted">{t.photo.beadType}</h2>
            <div className="grid grid-cols-2 gap-3">
              {BEAD_TYPES.map((b) => (
                <Card
                  key={b.id}
                  selected={beadTypeId === b.id}
                  interactive
                  onClick={() => handleBeadTypeChange(b.id)}
                  className="flex flex-col gap-1"
                >
                  <p className="font-semibold">{b.label}</p>
                  <p className="text-xs text-text-muted">
                    {b.widthMm} × {b.heightMm} mm
                  </p>
                </Card>
              ))}
            </div>
          </section>

          <section className="mb-8 flex flex-col gap-5">
            <h2 className="text-sm font-semibold text-text-muted">{t.photo.grid}</h2>
            <SliderField label={t.configurator.columns} value={cols} min={8} max={150} onChange={setCols} />
            <SliderField label={t.configurator.rows} value={rows} min={8} max={150} onChange={setRows} />
          </section>

          <section className="mb-8">
            <SliderField label={t.photo.colors} value={numColors} min={2} max={24} onChange={setNumColors} />
            {preview && <p className="mt-2 text-xs text-text-muted">{t.photo.detectedColors(preview.palette.length)}</p>}
          </section>

          {preview && preview.palette.length > 0 && (
            <section className="mb-10">
              <h2 className="mb-3 text-sm font-semibold text-text-muted">{t.photo.materials}</h2>
              <ul className="flex flex-col gap-1.5">
                {preview.palette.map((p) => {
                  const match = catalogMatchForHex(p.color.hex)
                  return (
                    <li key={p.color.code} className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-surface-2">
                      <span className="h-6 w-6 shrink-0 rounded-md border border-border" style={{ backgroundColor: p.color.hex }} />
                      <span className="flex-1 truncate text-xs text-text-muted">
                        {match.exact ? '' : '~'}
                        {p.color.code} <span className="text-text-soft">· {p.color.name}</span>
                      </span>
                      <span className="text-xs font-semibold">×{p.count}</span>
                    </li>
                  )
                })}
              </ul>
            </section>
          )}
        </>
      )}

      <div className="fixed inset-x-0 bottom-0 mx-auto flex max-w-2xl justify-center bg-gradient-to-t from-canvas via-canvas to-transparent pt-6 px-4 pb-[calc(1.5rem+env(safe-area-inset-bottom))] sm:px-8">
        <Button fullWidth disabled={!preview} onClick={handleCreate}>
          {t.photo.createButton}
        </Button>
      </div>
    </div>
  )
}
