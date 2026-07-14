import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { Technique } from '@/engine/types'
import { BEAD_TYPES } from '@/data/beadTypes'
import { suggestGridForImage, imageToPattern } from '@/lib/imageToPattern'
import { usePatternsStore } from '@/store/patternsStore'
import { t } from '@/i18n/es'
import { Button } from '@/components/shared/Button'
import { SliderField } from '@/components/shared/SliderField'
import { TechniqueIcon } from '@/components/configurator/TechniqueIcon'

const TECHNIQUES: Technique[] = ['loom', 'peyote', 'brick']

export function PhotoToPatternPage() {
  const navigate = useNavigate()
  const createPatternWithCells = usePatternsStore((s) => s.createPatternWithCells)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [imgUrl, setImgUrl] = useState<string | null>(null)
  const [imgEl, setImgEl] = useState<HTMLImageElement | null>(null)
  const [technique, setTechnique] = useState<Technique>('peyote')
  const [cols, setCols] = useState(40)
  const [rows, setRows] = useState(40)
  const [numColors, setNumColors] = useState(12)
  const [beadTypeId] = useState(BEAD_TYPES[0].id)
  const [processing, setProcessing] = useState(false)

  function handleFile(file: File) {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      setImgEl(img)
      setImgUrl(url)
      const suggestion = suggestGridForImage(img.width, img.height, 50)
      setCols(suggestion.cols)
      setRows(suggestion.rows)
    }
    img.src = url
  }

  async function handleGenerate() {
    if (!imgEl) return
    setProcessing(true)
    await new Promise((r) => setTimeout(r, 30)) // let the "processing" state paint
    try {
      const { cells } = imageToPattern(imgEl, { cols, rows, numColors })
      const id = createPatternWithCells({ technique, cols, rows, beadTypeId }, cells)
      navigate(`/editor/${id}`)
    } finally {
      setProcessing(false)
    }
  }

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
        <div className="mb-6 overflow-hidden rounded-2xl border border-border">
          <img src={imgUrl} alt="" className="max-h-64 w-full object-contain bg-surface-2" />
        </div>
      )}

      {imgUrl && (
        <>
          <section className="mb-8">
            <h2 className="mb-3 text-sm font-semibold text-text-muted">Técnica</h2>
            <div className="grid grid-cols-3 gap-3">
              {TECHNIQUES.map((tech) => (
                <button
                  key={tech}
                  onClick={() => setTechnique(tech)}
                  className={`flex flex-col items-center gap-2 rounded-2xl border py-4 ${technique === tech ? 'border-accent-500 bg-accent-500/10' : 'border-border bg-surface-2'}`}
                >
                  <TechniqueIcon technique={tech} className={technique === tech ? 'text-accent-500' : 'text-text-muted'} />
                  <span className="text-sm font-semibold">{t.technique[tech]}</span>
                </button>
              ))}
            </div>
          </section>

          <section className="mb-8 flex flex-col gap-5">
            <h2 className="text-sm font-semibold text-text-muted">{t.photo.grid}</h2>
            <SliderField label={t.configurator.columns} value={cols} min={8} max={150} onChange={setCols} />
            <SliderField label={t.configurator.rows} value={rows} min={8} max={150} onChange={setRows} />
          </section>

          <section className="mb-10">
            <SliderField label={t.photo.colors} value={numColors} min={2} max={24} onChange={setNumColors} />
          </section>
        </>
      )}

      <div className="fixed inset-x-0 bottom-0 mx-auto flex max-w-2xl justify-center bg-gradient-to-t from-canvas via-canvas to-transparent pt-6 px-4 pb-[calc(1.5rem+env(safe-area-inset-bottom))] sm:px-8">
        <Button fullWidth disabled={!imgUrl || processing} onClick={handleGenerate}>
          {processing ? t.photo.processing : t.photo.generate}
        </Button>
      </div>
    </div>
  )
}
