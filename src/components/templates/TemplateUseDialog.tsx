import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { PatternDoc } from '@/engine/types'
import type { TemplateMode } from '@/engine/template'
import { usePatternsStore } from '@/store/patternsStore'
import { PatternThumb } from '@/components/shared/PatternThumb'
import { SegmentedControl } from '@/components/shared/SegmentedControl'
import { t } from '@/i18n/es'
import { templateSummary } from './templateSummary'

/**
 * A template's card in the Plantillas tab: its design, what the new pattern
 * brings (the whole design or only its shape), and "Crear patrón", which
 * makes the copy and opens it in the editor. A sheet on a phone, a dialog on
 * a larger screen.
 */
export function TemplateUseDialog({ template, onClose }: { template: PatternDoc; onClose: () => void }) {
  const navigate = useNavigate()
  const [mode, setMode] = useState<TemplateMode>('full')

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  function create() {
    const id = usePatternsStore.getState().createFromTemplate(template, mode)
    if (id) navigate(`/editor/${id}`)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/40 md:items-center md:justify-center" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="template-use-title"
        onClick={(e) => e.stopPropagation()}
        className="flex w-full flex-col gap-4 rounded-t-2xl bg-surface p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] md:max-w-md md:rounded-2xl md:pb-5"
      >
        <div className="flex items-center gap-4">
          <div className="shrink-0 rounded-2xl bg-surface-2 p-2">
            <PatternThumb pattern={template} size={112} />
          </div>
          <div className="min-w-0">
            <h2 id="template-use-title" className="text-lg font-bold leading-tight">
              {template.name}
            </h2>
            <p className="text-sm text-text-muted">{templateSummary(template)}</p>
          </div>
        </div>
        <div className="flex flex-col gap-2">
          <p className="text-sm font-semibold text-text-muted">{t.configurator.userTemplates.modeLabel}</p>
          <div>
            <SegmentedControl
              ariaLabel={t.configurator.userTemplates.modeLabel}
              value={mode}
              onChange={setMode}
              options={[
                { value: 'full', label: t.configurator.userTemplates.full },
                { value: 'shape', label: t.configurator.userTemplates.shape },
              ]}
            />
          </div>
          <p className="text-sm text-text-muted">
            {mode === 'full' ? t.configurator.userTemplates.fullHint : t.configurator.userTemplates.shapeHint}
          </p>
        </div>
        <div className="flex flex-col gap-2">
          <button onClick={create} className="h-12 rounded-full bg-accent-500 text-base font-semibold text-accent-ink hover:bg-accent-400">
            {t.nav.createFromTemplate}
          </button>
          <button onClick={onClose} className="h-11 rounded-full bg-surface-2 text-sm font-semibold">
            {t.editor.saveTemplate.cancel}
          </button>
        </div>
      </div>
    </div>
  )
}
