import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { PatternDoc, Technique } from '@/engine/types'
import { BEAD_TYPES, getBeadType } from '@/data/beadTypes'
import {
  CHART_STAGGER_ORDER,
  detectBeadGrid,
  staggerAlignment,
  suggestColorCount,
  suggestGridForImage,
  imageToPattern,
  type BeadGrid,
  type ChartStagger,
  type ImageToPatternResult,
} from '@/lib/imageToPattern'
import { describeColor } from '@/lib/colorName'
import { usePatternsStore } from '@/store/patternsStore'
import { t } from '@/i18n/es'
import { Button } from '@/components/shared/Button'
import { SelectableCard } from '@/components/shared/SelectableCard'
import { ColumnsIcon } from '@/components/icons/ColumnsIcon'
import { RowsIcon } from '@/components/icons/RowsIcon'
import { SliderField } from '@/components/shared/SliderField'
import { SegmentedControl } from '@/components/shared/SegmentedControl'
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
  /**
   * The bead grid found in the image, when it is a chart (or a piece shot flat
   * and square-on) — see `lib/imageToPattern.ts#detectBeadGrid`. It decides
   * both the starting grid and how cells are read: from bead centres instead
   * of from averaged rectangles. Null for an ordinary photo, which falls back
   * to plain pixelation.
   */
  const [grid, setGrid] = useState<BeadGrid | null>(null)
  /**
   * Whether the chart is read straight or staggered — `'auto'` trusts the
   * detection, the other two are the weaver's correction when it reads wrong.
   * Back to `'auto'` with every new image: it describes that chart, not a
   * preference to carry over to the next one.
   */
  const [chartStagger, setChartStagger] = useState<ChartStagger>('auto')

  const bead = getBeadType(beadTypeId)
  /** How the found grid's beads land on the pattern's rows for this technique. */
  const alignment = grid ? staggerAlignment(grid, technique) : null
  const usingDetectedSize = grid !== null && alignment !== null && grid.cols === cols && alignment.rows === rows

  /** Starts the grid, the size and the colour count from what was found in the image. */
  function applyGrid(img: HTMLImageElement, found: BeadGrid | null, tech: Technique) {
    setGrid(found)
    // A chart says how many beads it has; only guess from the aspect ratio
    // when the image isn't one.
    const { cols: nextCols, rows: nextRows } = found
      ? { cols: found.cols, rows: staggerAlignment(found, tech).rows }
      : suggestGridForImage(img.width, img.height, tech, bead.widthMm, bead.heightMm, 50)
    setCols(nextCols)
    setRows(nextRows)
    // Open at the number of colours the image actually has, not at a fixed
    // 12 that has to be dragged back down on a three-colour chart.
    setNumColors(suggestColorCount(img, nextCols, nextRows, found, tech))
  }

  function handleFile(file: File) {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      setImgEl(img)
      setImgUrl(url)
      setChartStagger('auto')
      const found = detectBeadGrid(img, 'auto')
      // A staggered chart is a peyote chart, so it opens there; the technique
      // cards below still have the last word.
      const tech = found && found.staggerY !== 0 ? 'peyote' : technique
      setTechnique(tech)
      applyGrid(img, found, tech)
    }
    img.src = url
  }

  function handleChartStaggerChange(next: ChartStagger) {
    setChartStagger(next)
    if (imgEl) applyGrid(imgEl, detectBeadGrid(imgEl, next), technique)
  }

  // Re-suggest the grid (bead-proportion corrected — see suggestGridForImage)
  // whenever technique or bead type changes, so switching either doesn't
  // leave the grid distorted relative to the new physical cell shape.
  function handleTechniqueChange(next: Technique) {
    setTechnique(next)
    if (imgEl && !grid) {
      const suggestion = suggestGridForImage(imgEl.width, imgEl.height, next, bead.widthMm, bead.heightMm, 50)
      setCols(suggestion.cols)
      setRows(suggestion.rows)
    }
    // A staggered chart loses a row in peyote when its high columns don't
    // match the weave's (see `staggerAlignment`), and gets it back elsewhere —
    // unless the rows were already set by hand.
    if (grid && usingDetectedSize) setRows(staggerAlignment(grid, next).rows)
  }

  function handleBeadTypeChange(nextId: string) {
    setBeadTypeId(nextId)
    if (imgEl && !grid) {
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
      const result = imageToPattern(imgEl, { cols, rows, numColors, grid, technique })
      setPreview(result)
      setProcessing(false)
    }, REGENERATE_DEBOUNCE_MS)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [imgEl, technique, cols, rows, numColors, beadTypeId, grid])

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
          {/* Sólo mientras la grilla detectada siga siendo la que se usa:
              al mover los deslizadores manda quien teje, y el aviso
              quedaría anunciando un tamaño que ya no es el del patrón. A lo
              ancho, sobre las dos imágenes: dentro de una columna empujaba
              la foto original hacia abajo y las dejaba desalineadas. */}
          {grid && alignment && usingDetectedSize && (
            <div className="mb-3 flex flex-col gap-1 rounded-xl bg-accent-500/10 px-3 py-2 text-xs font-semibold text-accent-500">
              <p>{t.photo.gridDetected(grid.cols, alignment.rows)}</p>
              {grid.staggerY !== 0 && <p className="font-normal">{t.photo.gridStaggered}</p>}
              {alignment.shiftedParity !== null && <p className="font-normal">{t.photo.staggerTrimmed}</p>}
            </div>
          )}
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
                {processing && <span className="ml-1 text-text-muted">· {t.photo.updating}</span>}
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
                <SelectableCard
                  key={tech}
                  selected={technique === tech}
                  onClick={() => handleTechniqueChange(tech)}
                  className="flex flex-col items-center gap-2 py-4 text-center"
                >
                  <TechniqueIcon technique={tech} className={technique === tech ? 'text-accent-500' : 'text-text-muted'} />
                  <span className="text-sm font-semibold">{t.technique[tech]}</span>
                </SelectableCard>
              ))}
            </div>
          </section>

          <section className="mb-8">
            <h2 className="mb-3 text-sm font-semibold text-text-muted">{t.photo.beadType}</h2>
            <div className="grid grid-cols-2 gap-3">
              {BEAD_TYPES.map((b) => (
                <SelectableCard
                  key={b.id}
                  selected={beadTypeId === b.id}
                  onClick={() => handleBeadTypeChange(b.id)}
                  className="flex flex-col gap-1"
                >
                  <p className="font-semibold">{b.label}</p>
                  <p className="text-xs text-text-muted">
                    {b.widthMm} × {b.heightMm} mm
                  </p>
                </SelectableCard>
              ))}
            </div>
          </section>

          <section className="mb-8 flex flex-col gap-5">
            <h2 className="text-sm font-semibold text-text-muted">{t.photo.grid}</h2>
            {/* Sólo cuando hay un gráfico reconocido: en una foto sin grilla no
                hay columnas que leer rectas o escalonadas. Sigue a la vista si
                la corrección misma dejó de reconocerlo, para poder volver. */}
            {(grid || chartStagger !== 'auto') && (
              <div className="flex flex-col gap-2">
                <p className="text-xs font-semibold text-text-muted">{t.photo.chartType}</p>
                <div>
                  <SegmentedControl
                    ariaLabel={t.photo.chartType}
                    options={CHART_STAGGER_ORDER.map((value) => ({ value, label: t.photo.chartStagger[value] }))}
                    value={chartStagger}
                    onChange={handleChartStaggerChange}
                  />
                </div>
                {chartStagger === 'auto' && grid && (
                  <p className="text-xs text-text-muted">{t.photo.chartStaggerDetected(grid.staggerY !== 0)}</p>
                )}
              </div>
            )}
            <SliderField label={t.configurator.columns}
            icon={<ColumnsIcon />} value={cols} min={1} max={150} onChange={setCols} />
            <SliderField label={t.configurator.rows}
            icon={<RowsIcon />} value={rows} min={1} max={150} onChange={setRows} />
          </section>

          <section className="mb-8">
            <SliderField label={t.photo.colors} value={numColors} min={2} max={24} onChange={setNumColors} />
            {preview && <p className="mt-2 text-xs text-text-muted">{t.photo.detectedColors(preview.palette.length)}</p>}
          </section>

          {preview && preview.palette.length > 0 && (
            <section className="mb-10">
              <h2 className="mb-3 text-sm font-semibold text-text-muted">{t.photo.materials}</h2>
              <ul className="flex flex-col gap-1.5">
                {preview.palette.map((p) => (
                  <li key={p.color.hex} className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-surface-2">
                    <span className="h-6 w-6 shrink-0 rounded-md border border-border" style={{ backgroundColor: p.color.hex }} />
                    <span className="flex-1 truncate text-xs text-text-muted">{describeColor(p.color.hex)}</span>
                    <span className="text-xs font-semibold">×{p.count}</span>
                  </li>
                ))}
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
