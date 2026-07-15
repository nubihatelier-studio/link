import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { MeasurementUnit, Technique } from '@/engine/types'
import { beadCount, physicalSizeMm, gridFromPhysicalSizeMm } from '@/engine/geometry'
import { BEAD_TYPES, getBeadType } from '@/data/beadTypes'
import { toMm, fromMm } from '@/engine/units'
import { usePatternsStore } from '@/store/patternsStore'
import { t } from '@/i18n/es'
import { Button } from '@/components/shared/Button'
import { Card } from '@/components/shared/Card'
import { SelectableCard } from '@/components/shared/SelectableCard'
import { SegmentedControl } from '@/components/shared/SegmentedControl'
import { SliderField } from '@/components/shared/SliderField'
import { TechniqueIcon } from '@/components/configurator/TechniqueIcon'

const TECHNIQUES: Technique[] = ['loom', 'peyote', 'brick']
type SizeMode = 'count' | 'finalSize'

const MIN_DIM = 4
const MAX_DIM = 200

export function ConfiguratorPage() {
  const navigate = useNavigate()
  const createPattern = usePatternsStore((s) => s.createPattern)

  const [technique, setTechnique] = useState<Technique>('loom')
  const [cols, setCols] = useState(16)
  const [rows, setRows] = useState(16)
  const [beadTypeId, setBeadTypeId] = useState(BEAD_TYPES[0].id)
  const [mode, setMode] = useState<SizeMode>('count')
  const [unit, setUnit] = useState<MeasurementUnit>('mm')

  const bead = getBeadType(beadTypeId)
  const size = useMemo(
    () => physicalSizeMm(technique, cols, rows, bead.widthMm, bead.heightMm),
    [technique, cols, rows, bead],
  )
  const total = beadCount(technique, cols, rows)

  function updateCols(next: number) {
    setCols(Math.max(MIN_DIM, Math.min(MAX_DIM, next)))
  }

  function updateRows(next: number) {
    setRows(Math.max(MIN_DIM, Math.min(MAX_DIM, next)))
  }

  function updateFinalWidth(valueInUnit: number) {
    const widthMm = toMm(valueInUnit, unit)
    const { cols: newCols } = gridFromPhysicalSizeMm(technique, widthMm, size.heightMm, bead.widthMm, bead.heightMm)
    setCols(Math.max(MIN_DIM, Math.min(MAX_DIM, newCols)))
  }

  function updateFinalHeight(valueInUnit: number) {
    const heightMm = toMm(valueInUnit, unit)
    const { rows: newRows } = gridFromPhysicalSizeMm(technique, size.widthMm, heightMm, bead.widthMm, bead.heightMm)
    setRows(Math.max(MIN_DIM, Math.min(MAX_DIM, newRows)))
  }

  function handleCreate() {
    const id = createPattern({ technique, cols, rows, beadTypeId })
    navigate(`/editor/${id}`)
  }

  return (
    <div className="mx-auto min-h-screen max-w-2xl px-4 pb-32 pt-[calc(2rem+env(safe-area-inset-top))] sm:px-8">
      <h1 className="mb-6 text-2xl font-bold">{t.configurator.title}</h1>

      <section className="mb-8">
        <h2 className="mb-3 text-sm font-semibold text-text-muted">{t.configurator.technique}</h2>
        <div className="grid grid-cols-3 gap-3">
          {TECHNIQUES.map((tech) => (
            <SelectableCard
              key={tech}
              selected={technique === tech}
              onClick={() => setTechnique(tech)}
              className="flex flex-col items-center gap-2 py-5 text-center"
            >
              <TechniqueIcon technique={tech} className={technique === tech ? 'text-accent-500' : 'text-text-muted'} />
              <p className="font-semibold">{t.technique[tech]}</p>
              <p className="text-xs text-text-muted">
                {tech === 'loom' ? t.technique.loomDesc : tech === 'peyote' ? t.technique.peyoteDesc : t.technique.brickDesc}
              </p>
            </SelectableCard>
          ))}
        </div>
      </section>

      <section className="mb-8">
        <SegmentedControl<SizeMode>
          value={mode}
          onChange={setMode}
          options={[
            { value: 'count', label: t.configurator.byCount },
            { value: 'finalSize', label: t.configurator.byFinalSize },
          ]}
        />
      </section>

      {mode === 'count' ? (
        <section className="mb-8 flex flex-col gap-5">
          <SliderField
            label={t.configurator.columns}
            value={cols}
            min={MIN_DIM}
            max={MAX_DIM}
            onChange={updateCols}
          />
          <SliderField
            label={t.configurator.rows}
            value={rows}
            min={MIN_DIM}
            max={MAX_DIM}
            onChange={updateRows}
          />
        </section>
      ) : (
        <section className="mb-8 flex flex-col gap-5">
          <div className="flex items-center gap-3">
            <label className="flex-1">
              <span className="mb-1 block text-sm font-semibold text-text-muted">{t.configurator.finalWidth}</span>
              <input
                type="number"
                className="w-full rounded-xl border border-border bg-surface-2 px-3 py-2 outline-none focus:border-accent-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-500"
                value={Number(fromMm(size.widthMm, unit).toFixed(2))}
                onChange={(e) => updateFinalWidth(Number(e.target.value) || 0)}
              />
            </label>
            <label className="flex-1">
              <span className="mb-1 block text-sm font-semibold text-text-muted">{t.configurator.finalHeight}</span>
              <input
                type="number"
                className="w-full rounded-xl border border-border bg-surface-2 px-3 py-2 outline-none focus:border-accent-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-500"
                value={Number(fromMm(size.heightMm, unit).toFixed(2))}
                onChange={(e) => updateFinalHeight(Number(e.target.value) || 0)}
              />
            </label>
            <label className="w-24">
              <span className="mb-1 block text-sm font-semibold text-text-muted">{t.configurator.unit}</span>
              <select
                className="w-full rounded-xl border border-border bg-surface-2 px-2 py-2 outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-500"
                value={unit}
                onChange={(e) => setUnit(e.target.value as MeasurementUnit)}
              >
                <option value="mm">mm</option>
                <option value="cm">cm</option>
                <option value="in">in</option>
              </select>
            </label>
          </div>
          <p className="text-xs text-text-soft">
            {t.configurator.columns}: {cols} · {t.configurator.rows}: {rows}
          </p>
        </section>
      )}

      <section className="mb-8">
        <h2 className="mb-3 text-sm font-semibold text-text-muted">{t.configurator.beadType}</h2>
        <div className="grid grid-cols-2 gap-3">
          {BEAD_TYPES.map((b) => (
            <SelectableCard
              key={b.id}
              selected={beadTypeId === b.id}
              onClick={() => setBeadTypeId(b.id)}
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

      <Card className="mb-8 flex flex-col items-center gap-1 bg-surface-3 py-5 text-center">
        <p className="text-2xl font-bold">{total.toLocaleString('es')}</p>
        <p className="text-sm text-text-muted">{t.configurator.totalBeads}</p>
        <p className="mt-2 text-sm text-text-muted">
          {t.configurator.estimatedSize}: {formatSize(size.widthMm, size.heightMm, unit)}
        </p>
      </Card>

      <button
        onClick={() => navigate('/new/photo')}
        className="mb-8 flex w-full items-center justify-between rounded-2xl border border-border bg-surface-2 px-4 py-4 text-left hover:border-accent-300"
      >
        <span>
          <span className="block font-semibold">{t.configurator.photoToPattern}</span>
          <span className="block text-xs text-text-muted">{t.configurator.photoToPatternDesc}</span>
        </span>
        <span className="text-xl">📷</span>
      </button>

      <div className="fixed inset-x-0 bottom-0 mx-auto flex max-w-2xl justify-center bg-gradient-to-t from-canvas via-canvas to-transparent pt-6 px-4 pb-[calc(1.5rem+env(safe-area-inset-bottom))] sm:px-8">
        <Button fullWidth onClick={handleCreate}>
          {t.configurator.createButton}
        </Button>
      </div>
    </div>
  )
}

function formatSize(widthMm: number, heightMm: number, unit: MeasurementUnit) {
  const w = fromMm(widthMm, unit)
  const h = fromMm(heightMm, unit)
  const decimals = unit === 'in' ? 2 : 1
  return `${w.toFixed(decimals)} × ${h.toFixed(decimals)} ${unit}`
}
