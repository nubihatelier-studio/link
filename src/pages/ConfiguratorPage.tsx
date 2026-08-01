import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { FringeData, LoopData, MeasurementUnit, Technique } from '@/engine/types'
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
import { loopBeadCount } from '@/engine/loop'
import { CALIBRATION_SAMPLE } from '@/engine/calibration'
import { BEAD_TYPES, getBeadType } from '@/data/beadTypes'
import { toMm, fromMm, formatSizeMm } from '@/engine/units'
import { usePatternsStore } from '@/store/patternsStore'
import { t } from '@/i18n/es'
import { Button } from '@/components/shared/Button'
import { Card } from '@/components/shared/Card'
import { SelectableCard } from '@/components/shared/SelectableCard'
import { IconSelectableCard } from '@/components/shared/IconSelectableCard'
import { SegmentedControl } from '@/components/shared/SegmentedControl'
import { SliderField } from '@/components/shared/SliderField'
import { TechniqueIcon } from '@/components/configurator/TechniqueIcon'
import { TemplateIcon, type TemplateId } from '@/components/configurator/TemplateIcon'

const TECHNIQUES: Technique[] = ['loom', 'peyote', 'brick']
type SizeMode = 'count' | 'finalSize'

const MIN_DIM = 4
const MAX_DIM = 200

interface TemplatePreset {
  id: TemplateId
  label: string
  description: string
  technique: Technique
  cols: number
  rows: number
  fringeEnabled: boolean
  fringeMaxLength: number
  fringeShape: FringeShape
  bodyShape: BodyShapePreset
  /**
   * The bead this template's numbers were chosen for. Set explicitly rather
   * than left to whatever was selected before: "Pulsera" only finishes at the
   * measured 8 × 102 mm in Delica 11/0, so picking the template with a
   * Rocalla still selected would quietly report a different size.
   */
  beadTypeId: string
  /**
   * A hand-designed fringe silhouette this template shows exactly, instead
   * of whatever `fringeShape` + `fringeMaxLength` would generically produce
   * — e.g. "Aro con flecos"'s cascade (4,6,8,9,8,6,4) matches a real
   * reference piece bead-for-bead, which no generic min=1-anchored curve
   * reproduces exactly. Absent for every other template (they're fine with
   * the generic formula). See `templateFringeLengths` state below for how
   * this stops applying the moment the weaver changes anything it depends
   * on (cols, fringe length/shape, technique, body shape).
   */
  fringeLengths?: number[]
  /**
   * A hanging loop the template starts with. No template sets one today —
   * "Aro con flecos" used to start with a woven ring, and now starts bare:
   * how a piece is hung (woven ring, metal jump ring, or a cord through the
   * top bead) is the weaver's decision, and one built in by default quietly
   * adds beads to the totals and the materials list. The mechanism stays
   * here for any template that wants it, and both loop variants stay fully
   * available in the editor's own panel.
   */
  loop?: LoopData
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
    label: t.configurator.templates.pulsera,
    description: t.configurator.templates.pulseraDesc,
    technique: 'peyote',
    // The real bracelet the size model is calibrated against: 6 × 60 in
    // Delica 11/0 finishes at 8 × 102 mm (see engine/calibration.ts). Starting
    // here means the very first thing a weaver creates reports a size someone
    // has actually measured, instead of an arbitrary bigger placeholder.
    cols: CALIBRATION_SAMPLE.cols,
    rows: CALIBRATION_SAMPLE.rows,
    beadTypeId: CALIBRATION_SAMPLE.beadTypeId,
    fringeEnabled: false,
    fringeMaxLength: 8,
    fringeShape: 'straight',
    bodyShape: 'rectangle',
  },
  {
    id: 'aroFlecos',
    label: t.configurator.templates.aroFlecos,
    description: t.configurator.templates.aroFlecosDesc,
    technique: 'brick',
    // A trapezoid body (triangle preset: narrow top, full-width bottom) that
    // grows exactly 1 bead/row up to 7 beads by the last row — the row the
    // fringe hangs from. 7 cols x 7 rows, both odd, is the smallest size
    // that both taps out at exactly `cols` on the last row AND keeps the
    // triangle preset's own row-count nudge (`preferredRowsFor`) a no-op —
    // matches a real reference piece (7-wide triangular body, rounded
    // fringe cascade), not an arbitrarily bigger placeholder. The reference
    // piece's hanging loop is deliberately left off — see `TemplatePreset.loop`.
    cols: 7,
    rows: 7,
    beadTypeId: 'miyuki-delica-11',
    fringeEnabled: true,
    fringeMaxLength: 9,
    fringeShape: 'rounded',
    // The generic 'rounded' formula (anchored at min=1) doesn't reproduce
    // this exact oval by itself — this is the reference piece's own
    // measured cascade, kept here as data. See `TemplatePreset.fringeLengths`.
    fringeLengths: [4, 6, 8, 9, 8, 6, 4],
    bodyShape: 'triangle',
  },
  {
    id: 'personalizado',
    label: t.configurator.templates.personalizado,
    description: t.configurator.templates.personalizadoDesc,
    technique: 'loom',
    cols: 16,
    rows: 16,
    beadTypeId: 'miyuki-delica-11',
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
  const [selectedTemplate, setSelectedTemplate] = useState<TemplateId | null>(null)
  /** The hanging loop the chosen template starts with, if any — see `TemplatePreset.loop`. */
  const [loop, setLoop] = useState<LoopData | undefined>(undefined)
  /**
   * "Aro con flecos" starts from rows = columns — that's what gives its
   * trapezoid body + V fringe a well-proportioned, symmetric silhouette —
   * and keeps rows mirroring columns as they're adjusted, until the weaver
   * edits rows directly (see `updateRows`/`updateFinalHeight`), at which
   * point their choice sticks and rows stop following. Only this template
   * behaves this way; picking any other template or technique turns it off.
   */
  const [rowsFollowCols, setRowsFollowCols] = useState(false)
  /**
   * A template's own hand-designed fringe silhouette (see
   * `TemplatePreset.fringeLengths`), used verbatim in place of the generic
   * `fringeShape`-derived one — only while it still applies. Cleared back
   * to `null` (falling back to the generic formula) the moment anything it
   * depends on changes: a different template, technique, or body shape, or
   * a direct edit to fringe length/shape. The `cols` mismatch guard below
   * is a second, automatic safety net for the same thing (e.g. resizing via
   * "por tamaño final") in case a column count change ever reaches here
   * through a path that doesn't explicitly clear it.
   */
  const [templateFringeLengths, setTemplateFringeLengths] = useState<number[] | null>(null)

  const bead = getBeadType(beadTypeId)
  const fringeActive = isFringeCapable(technique) && fringeEnabled
  const shapeActive = isShapeCapable(technique) && bodyShape !== 'rectangle'
  const size = useMemo(
    () =>
      physicalSizeMm(
        technique,
        cols,
        rows,
        bead,
        fringeActive ? fringeMaxLength : 0,
        loopBeadCount(loop),
      ),
    [technique, cols, rows, bead, fringeActive, fringeMaxLength, loop],
  )
  const rowShapePreview = useMemo(
    () => (shapeActive ? createShapedRowShape(bodyShape, cols, rows) : null),
    [shapeActive, bodyShape, cols, rows],
  )
  const fringePreviewLengths = useMemo(() => {
    if (!fringeActive) return null
    if (templateFringeLengths && templateFringeLengths.length === cols) return templateFringeLengths
    const lastRowShape = rowShapePreview?.[rows - 1]
    return lastRowShape
      ? createFringeLengthsForShape(fringeShape, cols, fringeMaxLength, lastRowShape)
      : createFringeLengths(fringeShape, cols, fringeMaxLength)
  }, [fringeActive, fringeShape, cols, fringeMaxLength, rowShapePreview, rows, templateFringeLengths])
  // Body + fringe + the loop's own ring, so this preview matches the count the
  // editor shows the moment the pattern is created.
  const total =
    beadCount(technique, cols, rows, rowShapePreview ?? undefined) +
    (fringePreviewLengths ? totalFringeBeadCount({ lengths: fringePreviewLengths, turnBeads: [] }) : 0) +
    loopBeadCount(loop)

  function applyTemplate(template: TemplatePreset) {
    const followRows = template.id === 'aroFlecos'
    setSelectedTemplate(template.id)
    setTechnique(template.technique)
    setCols(template.cols)
    // aroFlecos ignores its own template.rows — rows always starts equal to columns for this one.
    setRows(followRows ? template.cols : template.rows)
    setRowsFollowCols(followRows)
    setBeadTypeId(template.beadTypeId)
    setMode('count')
    setFringeEnabled(template.fringeEnabled)
    setFringeMaxLength(template.fringeMaxLength)
    setFringeShape(template.fringeShape)
    setTemplateFringeLengths(template.fringeLengths ?? null)
    setBodyShape(template.bodyShape)
    setLoop(template.loop)
  }

  function updateCols(next: number) {
    const clamped = Math.max(MIN_DIM, Math.min(MAX_DIM, next))
    setCols(clamped)
    if (rowsFollowCols) setRows(clamped)
    setTemplateFringeLengths(null)
  }

  /** A direct edit to rows — always respected, and (per aroFlecos's own rule) stops rows from following columns from here on. */
  function updateRows(next: number) {
    setRowsFollowCols(false)
    setRows(Math.max(MIN_DIM, Math.min(MAX_DIM, next)))
    setTemplateFringeLengths(null)
  }

  function updateFinalWidth(valueInUnit: number) {
    const widthMm = toMm(valueInUnit, unit)
    const { cols: newCols } = gridFromPhysicalSizeMm(technique, widthMm, size.heightMm, bead)
    updateCols(newCols)
  }

  function updateFinalHeight(valueInUnit: number) {
    const heightMm = toMm(valueInUnit, unit)
    const { rows: newRows } = gridFromPhysicalSizeMm(technique, size.widthMm, heightMm, bead)
    updateRows(newRows)
  }

  function handleCreate() {
    const fringe: FringeData | undefined = fringePreviewLengths
      ? { lengths: fringePreviewLengths, turnBeads: fringePreviewLengths.map((len) => len > 0) }
      : undefined
    const id = createPattern({ technique, cols, rows, beadTypeId }, undefined, fringe, rowShapePreview ?? undefined, loop)
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
        <div className="grid grid-cols-3 gap-3">
          {TEMPLATES.map((template) => (
            <IconSelectableCard
              key={template.id}
              selected={selectedTemplate === template.id}
              onClick={() => applyTemplate(template)}
              icon={
                <TemplateIcon
                  templateId={template.id}
                  className={selectedTemplate === template.id ? 'text-accent-500' : 'text-text-muted'}
                />
              }
              label={template.label}
              description={template.description}
            />
          ))}
        </div>
      </section>

      <section className="mb-8">
        <h2 className="mb-3 text-sm font-semibold text-text-muted">{t.configurator.techniqueStepTitle}</h2>
        <div className="grid grid-cols-3 gap-3">
          {TECHNIQUES.map((tech) => (
            <IconSelectableCard
              key={tech}
              selected={technique === tech}
              onClick={() => {
                setTechnique(tech)
                setSelectedTemplate(null)
                setRowsFollowCols(false)
                setTemplateFringeLengths(null)
              }}
              icon={
                <TechniqueIcon technique={tech} className={technique === tech ? 'text-accent-500' : 'text-text-muted'} />
              }
              label={t.technique[tech]}
              description={
                tech === 'loom' ? t.technique.loomDesc : tech === 'peyote' ? t.technique.peyoteDesc : t.technique.brickDesc
              }
            />
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
                  setTemplateFringeLengths(null)
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
                setTemplateFringeLengths(null)
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
                onChange={(next) => {
                  setFringeMaxLength(next)
                  setTemplateFringeLengths(null)
                }}
              />
              <div>
                <p className="mb-2 text-sm font-semibold text-text">{t.configurator.fringe.shape}</p>
                <SegmentedControl<FringeShape>
                  value={fringeShape}
                  onChange={(shape) => {
                    setFringeShape(shape)
                    setTemplateFringeLengths(null)
                  }}
                  options={[
                    { value: 'straight', label: t.configurator.fringe.shapeStraight },
                    { value: 'v', label: t.configurator.fringe.shapeV },
                    { value: 'cascade', label: t.configurator.fringe.shapeCascade },
                    { value: 'rounded', label: t.configurator.fringe.shapeRounded },
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
          {t.configurator.estimatedSize}: {formatSizeMm(size.widthMm, size.heightMm, unit)}
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
