import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { FringeData, MeasurementUnit, Technique } from '@/engine/types'
import { beadCount, physicalSizeMm, gridFromPhysicalSizeMm } from '@/engine/geometry'
import {
  createFringeLengths,
  createFringeLengthsForShape,
  isFringeCapable,
  MAX_FRINGE_LENGTH,
  totalFringeBeadCount,
  type FringeShape,
} from '@/engine/fringe'
import { createShapedRowShape, isShapeCapable, preferredRowsFor, type BodyShapePreset } from '@/engine/shape'
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

interface TemplatePreset {
  id: string
  emoji: string
  label: string
  description: string
  technique: Technique
  cols: number
  rows: number
  fringeEnabled: boolean
  fringeMaxLength: number
  fringeShape: FringeShape
  bodyShape: BodyShapePreset
}

const BODY_SHAPE_PRESETS: BodyShapePreset[] = ['rectangle', 'triangle', 'triangleInverted', 'rhombus']
const BODY_SHAPE_ICON: Record<BodyShapePreset, string> = {
  rectangle: '▭',
  triangle: '▲',
  triangleInverted: '▽',
  rhombus: '◆',
}

/**
 * Starting points offered in "Crear patrón" — each just pre-fills the
 * fields below (technique, size, fringe) with typical values for that kind
 * of project; nothing here is locked in, every field stays editable
 * afterward in this same screen and later in the editor.
 */
const TEMPLATES: TemplatePreset[] = [
  {
    id: 'pulsera',
    emoji: '📿',
    label: t.configurator.templates.pulsera,
    description: t.configurator.templates.pulseraDesc,
    technique: 'peyote',
    cols: 10,
    rows: 140,
    fringeEnabled: false,
    fringeMaxLength: 8,
    fringeShape: 'straight',
    bodyShape: 'rectangle',
  },
  {
    id: 'aroFlecos',
    emoji: '🪶',
    label: t.configurator.templates.aroFlecos,
    description: t.configurator.templates.aroFlecosDesc,
    technique: 'brick',
    // A trapezoid body (triangle preset: narrow top, full-width bottom) that
    // grows exactly 1 bead/row up to 13 beads by the last row — the row the
    // V fringe hangs from. See "Corrección 1" in shape.ts: at 1 bead of
    // total width growth per row, every cols/rows pair tapers perfectly, so
    // this is just a typical starting size, not a specially-fitted one.
    cols: 13,
    rows: 7,
    fringeEnabled: true,
    fringeMaxLength: 10,
    fringeShape: 'v',
    bodyShape: 'triangle',
  },
  {
    id: 'personalizado',
    emoji: '🎨',
    label: t.configurator.templates.personalizado,
    description: t.configurator.templates.personalizadoDesc,
    technique: 'loom',
    cols: 16,
    rows: 16,
    fringeEnabled: false,
    fringeMaxLength: 8,
    fringeShape: 'straight',
    bodyShape: 'rectangle',
  },
]

export function ConfiguratorPage() {
  const navigate = useNavigate()
  const createPattern = usePatternsStore((s) => s.createPattern)

  const [technique, setTechnique] = useState<Technique>('loom')
  const [cols, setCols] = useState(16)
  const [rows, setRows] = useState(16)
  const [beadTypeId, setBeadTypeId] = useState(BEAD_TYPES[0].id)
  const [mode, setMode] = useState<SizeMode>('count')
  const [unit, setUnit] = useState<MeasurementUnit>('mm')
  const [fringeEnabled, setFringeEnabled] = useState(false)
  const [fringeMaxLength, setFringeMaxLength] = useState(8)
  const [fringeShape, setFringeShape] = useState<FringeShape>('straight')
  const [bodyShape, setBodyShape] = useState<BodyShapePreset>('rectangle')
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null)
  /**
   * "Aro con flecos" starts from rows = columns — that's what gives its
   * trapezoid body + V fringe a well-proportioned, symmetric silhouette —
   * and keeps rows mirroring columns as they're adjusted, until the weaver
   * edits rows directly (see `updateRows`/`updateFinalHeight`), at which
   * point their choice sticks and rows stop following. Only this template
   * behaves this way; picking any other template or technique turns it off.
   */
  const [rowsFollowCols, setRowsFollowCols] = useState(false)

  const bead = getBeadType(beadTypeId)
  const fringeActive = isFringeCapable(technique) && fringeEnabled
  const shapeActive = isShapeCapable(technique) && bodyShape !== 'rectangle'
  const size = useMemo(
    () => physicalSizeMm(technique, cols, rows, bead.widthMm, bead.heightMm, fringeActive ? fringeMaxLength : 0),
    [technique, cols, rows, bead, fringeActive, fringeMaxLength],
  )
  const rowShapePreview = useMemo(
    () => (shapeActive ? createShapedRowShape(bodyShape, cols, rows) : null),
    [shapeActive, bodyShape, cols, rows],
  )
  const fringePreviewLengths = useMemo(() => {
    if (!fringeActive) return null
    const lastRowShape = rowShapePreview?.[rows - 1]
    return lastRowShape
      ? createFringeLengthsForShape(fringeShape, cols, fringeMaxLength, lastRowShape)
      : createFringeLengths(fringeShape, cols, fringeMaxLength)
  }, [fringeActive, fringeShape, cols, fringeMaxLength, rowShapePreview, rows])
  const total =
    beadCount(technique, cols, rows, rowShapePreview ?? undefined) +
    (fringePreviewLengths ? totalFringeBeadCount({ lengths: fringePreviewLengths, turnBeads: [] }) : 0)

  function applyTemplate(template: TemplatePreset) {
    const followRows = template.id === 'aroFlecos'
    setSelectedTemplate(template.id)
    setTechnique(template.technique)
    setCols(template.cols)
    // aroFlecos ignores its own template.rows — rows always starts equal to columns for this one.
    setRows(followRows ? template.cols : template.rows)
    setRowsFollowCols(followRows)
    setMode('count')
    setFringeEnabled(template.fringeEnabled)
    setFringeMaxLength(template.fringeMaxLength)
    setFringeShape(template.fringeShape)
    setBodyShape(template.bodyShape)
  }

  function updateCols(next: number) {
    const clamped = Math.max(MIN_DIM, Math.min(MAX_DIM, next))
    setCols(clamped)
    if (rowsFollowCols) setRows(clamped)
  }

  /** A direct edit to rows — always respected, and (per aroFlecos's own rule) stops rows from following columns from here on. */
  function updateRows(next: number) {
    setRowsFollowCols(false)
    setRows(Math.max(MIN_DIM, Math.min(MAX_DIM, next)))
  }

  function updateFinalWidth(valueInUnit: number) {
    const widthMm = toMm(valueInUnit, unit)
    const { cols: newCols } = gridFromPhysicalSizeMm(technique, widthMm, size.heightMm, bead.widthMm, bead.heightMm)
    updateCols(newCols)
  }

  function updateFinalHeight(valueInUnit: number) {
    const heightMm = toMm(valueInUnit, unit)
    const { rows: newRows } = gridFromPhysicalSizeMm(technique, size.widthMm, heightMm, bead.widthMm, bead.heightMm)
    updateRows(newRows)
  }

  function handleCreate() {
    const fringe: FringeData | undefined = fringePreviewLengths
      ? { lengths: fringePreviewLengths, turnBeads: fringePreviewLengths.map((len) => len > 0) }
      : undefined
    const id = createPattern({ technique, cols, rows, beadTypeId }, undefined, fringe, rowShapePreview ?? undefined)
    // "Aro con flecos" starts from a symmetric shape (rhombus body + V
    // fringe) — defaulting the length-symmetry toggle on too means a manual
    // tweak keeps that symmetry instead of silently drifting lopsided.
    navigate(`/editor/${id}`, selectedTemplate === 'aroFlecos' ? { state: { fringeSymmetricDefault: true } } : undefined)
  }

  return (
    <div className="mx-auto min-h-screen max-w-2xl px-4 pb-32 pt-[calc(2rem+env(safe-area-inset-top))] sm:px-8">
      <h1 className="mb-6 text-2xl font-bold">{t.configurator.title}</h1>

      <section className="mb-8">
        <h2 className="mb-3 text-sm font-semibold text-text-muted">{t.configurator.templates.title}</h2>
        <div className="grid grid-cols-2 gap-3">
          {TEMPLATES.map((template) => (
            <SelectableCard
              key={template.id}
              selected={selectedTemplate === template.id}
              onClick={() => applyTemplate(template)}
              className="flex flex-col items-center gap-1 py-4 text-center"
            >
              <span className="text-2xl">{template.emoji}</span>
              <p className="font-semibold">{template.label}</p>
              <p className="text-xs text-text-muted">{template.description}</p>
            </SelectableCard>
          ))}
        </div>
      </section>

      <section className="mb-8">
        <h2 className="mb-3 text-sm font-semibold text-text-muted">{t.configurator.technique}</h2>
        <div className="grid grid-cols-3 gap-3">
          {TECHNIQUES.map((tech) => (
            <SelectableCard
              key={tech}
              selected={technique === tech}
              onClick={() => {
                setTechnique(tech)
                setSelectedTemplate(null)
                setRowsFollowCols(false)
              }}
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
          <p className="text-xs text-text-muted">
            {t.configurator.columns}: {cols} · {t.configurator.rows}: {rows}
          </p>
        </section>
      )}

      {isShapeCapable(technique) && (
        <section className="mb-8">
          <h2 className="mb-3 text-sm font-semibold text-text-muted">{t.configurator.bodyShape.title}</h2>
          <p className="mb-3 text-xs text-text-muted">{t.configurator.bodyShape.hint}</p>
          <div className="grid grid-cols-4 gap-3">
            {BODY_SHAPE_PRESETS.map((preset) => (
              <SelectableCard
                key={preset}
                selected={bodyShape === preset}
                onClick={() => {
                  setBodyShape(preset)
                  setSelectedTemplate(null)
                  // Silent nudge, no dialog: triangle/rhombus each have one
                  // row whose position is physically pinned in a way that
                  // needs an odd row count to stay perfectly centered (see
                  // `preferredRowsFor`'s doc comment) — rectangle and
                  // triangleInverted never need it, so this is a no-op there.
                  setRows(preferredRowsFor(preset, rows))
                }}
                className="flex flex-col items-center gap-1 py-4 text-center"
              >
                <span className="text-2xl text-accent-500">{BODY_SHAPE_ICON[preset]}</span>
                <p className="text-xs font-semibold">{t.configurator.bodyShape[preset]}</p>
              </SelectableCard>
            ))}
          </div>
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

      {isFringeCapable(technique) && (
        <section className="mb-8">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-text-muted">{t.configurator.fringe.title}</h2>
            <button
              onClick={() => {
                setFringeEnabled((v) => !v)
                setSelectedTemplate(null)
              }}
              aria-pressed={fringeEnabled}
              className={`rounded-full px-4 py-2 text-sm font-semibold transition-colors
                ${fringeEnabled ? 'bg-accent-500 text-accent-ink' : 'bg-surface-2 text-text-muted hover:bg-surface-3'}`}
            >
              {fringeEnabled ? t.configurator.fringe.remove : t.configurator.fringe.add}
            </button>
          </div>
          {fringeEnabled && (
            <div className="flex flex-col gap-5">
              <p className="text-xs text-text-muted">{t.configurator.fringe.hint}</p>
              <SliderField
                label={t.configurator.fringe.maxLength}
                value={fringeMaxLength}
                min={1}
                max={MAX_FRINGE_LENGTH}
                suffix={t.configurator.fringe.beadsUnit}
                onChange={setFringeMaxLength}
              />
              <div>
                <p className="mb-2 text-sm font-semibold text-text">{t.configurator.fringe.shape}</p>
                <SegmentedControl<FringeShape>
                  value={fringeShape}
                  onChange={setFringeShape}
                  options={[
                    { value: 'straight', label: t.configurator.fringe.shapeStraight },
                    { value: 'v', label: t.configurator.fringe.shapeV },
                    { value: 'cascade', label: t.configurator.fringe.shapeCascade },
                  ]}
                />
              </div>
            </div>
          )}
        </section>
      )}

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
