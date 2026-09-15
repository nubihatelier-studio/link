import { useMemo, useState } from 'react'
import { Wordmark } from '@/components/shared/Wordmark'
import { MoreHorizontal } from 'lucide-react'
import type { PatternDoc } from '@/engine/types'
import { NUBIH_TEMPLATES } from '@/data/nubihTemplates'
import { usePatternsStore } from '@/store/patternsStore'
import { PatternThumb } from '@/components/shared/PatternThumb'
import { NameDialog } from '@/components/shared/NameDialog'
import { UndoToast } from '@/components/shared/UndoToast'
import { MainNav } from '@/components/shared/MainNav'
import { TemplateUseDialog } from '@/components/templates/TemplateUseDialog'
import { templateSummary } from '@/components/templates/templateSummary'
import { t } from '@/i18n/es'

/**
 * The "Plantillas" tab: the templates that ship with the app, big, and the
 * ones the weaver saved underneath (renamed or deleted from their "⋯").
 * Tapping one opens `TemplateUseDialog` to make a pattern from it.
 */
export function TemplatesPage() {
  const templatesById = usePatternsStore((s) => s.templates)
  const saved = useMemo(() => Object.values(templatesById).sort((a, b) => b.updatedAt - a.updatedAt), [templatesById])
  const [using, setUsing] = useState<PatternDoc | null>(null)
  const [menuId, setMenuId] = useState<string | null>(null)
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null)
  const [deleted, setDeleted] = useState<PatternDoc | null>(null)

  return (
    <div className="mx-auto min-h-screen max-w-3xl px-4 pb-32 pt-[calc(2rem+env(safe-area-inset-top))] sm:px-8">
      <header className="mb-6 flex flex-col gap-3">
        <Wordmark decorative className="h-12 self-start" />
        <h1 className="text-2xl font-bold">{t.nav.templates}</h1>
      </header>

      <section className="mb-8">
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-text-muted">{t.configurator.nubihTemplatesTitle}</h2>
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {NUBIH_TEMPLATES.map((tpl) => (
            <li key={tpl.id}>
              <TemplateTile template={tpl} onOpen={() => setUsing(tpl)} />
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-text-muted">{t.configurator.userTemplates.title}</h2>
        {saved.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-text-muted">{t.templates.emptySaved}</p>
        ) : (
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {saved.map((tpl) => (
              <li key={tpl.id} className="relative">
                <TemplateTile template={tpl} onOpen={() => setUsing(tpl)} />
                <button
                  onClick={() => setMenuId((open) => (open === tpl.id ? null : tpl.id))}
                  aria-label={t.configurator.userTemplates.options(tpl.name)}
                  aria-expanded={menuId === tpl.id}
                  className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full bg-surface/90 text-text-muted shadow-sm hover:text-text"
                >
                  <MoreHorizontal size={16} />
                </button>
                {menuId === tpl.id && (
                  <div className="absolute right-2 top-11 z-20 flex min-w-36 flex-col rounded-xl border border-border bg-surface p-1 shadow-lg">
                    <button
                      onClick={() => {
                        setMenuId(null)
                        setRenaming({ id: tpl.id, name: tpl.name })
                      }}
                      className="rounded-lg px-3 py-2 text-left text-sm font-semibold hover:bg-surface-2"
                    >
                      {t.configurator.userTemplates.rename}
                    </button>
                    <button
                      onClick={() => {
                        setMenuId(null)
                        setDeleted(usePatternsStore.getState().deleteTemplate(tpl.id))
                      }}
                      className="rounded-lg px-3 py-2 text-left text-sm font-semibold text-red-500 hover:bg-surface-2"
                    >
                      {t.configurator.userTemplates.delete}
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {using && <TemplateUseDialog template={using} onClose={() => setUsing(null)} />}
      {renaming && (
        <NameDialog
          title={t.configurator.userTemplates.renameTitle}
          label={t.editor.saveTemplate.nameLabel}
          value={renaming.name}
          onChange={(name) => setRenaming({ ...renaming, name })}
          confirmLabel={t.editor.saveTemplate.save}
          cancelLabel={t.editor.saveTemplate.cancel}
          onConfirm={() => {
            usePatternsStore.getState().renameTemplate(renaming.id, renaming.name)
            setRenaming(null)
          }}
          onCancel={() => setRenaming(null)}
        />
      )}
      {deleted && (
        <UndoToast
          key={deleted.id}
          message={t.configurator.userTemplates.deleted(deleted.name)}
          onUndo={() => {
            usePatternsStore.getState().restoreTemplate(deleted)
            setDeleted(null)
          }}
          onExpire={() => setDeleted(null)}
        />
      )}
      <MainNav />
    </div>
  )
}

function TemplateTile({ template, onOpen }: { template: PatternDoc; onOpen: () => void }) {
  return (
    <button
      onClick={onOpen}
      className="flex w-full flex-col gap-2 rounded-2xl border border-border bg-surface p-2.5 text-left hover:border-accent-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-500"
    >
      <span className="flex aspect-square w-full items-center justify-center overflow-hidden rounded-xl bg-surface-2">
        <PatternThumb pattern={template} size={140} />
      </span>
      <span lang="es" className="hyphens-auto break-words px-0.5 text-sm font-semibold leading-tight">
        {template.name}
      </span>
      <span className="px-0.5 text-[11px] text-text-muted">{templateSummary(template)}</span>
    </button>
  )
}
