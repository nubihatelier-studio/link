import { useEffect, useRef, useState } from 'react'
import { ImagePlus, Trash2 } from 'lucide-react'
import type { Difficulty, PieceKind } from '@/engine/types'
import type { TemplateMeta } from '@/engine/template'
import { dataUrlSizeKb, readPhotoAsDataUrl } from '@/lib/photoFile'
import { t } from '@/i18n/es'

const KINDS: PieceKind[] = ['pulsera', 'aro', 'anillo', 'collar', 'tobillera', 'llavero', 'otro']
const DIFFICULTIES: Difficulty[] = ['facil', 'intermedio', 'avanzado']

/**
 * A template's card: its name, what it makes, how hard it is, and a photo of
 * the finished piece. Used both when saving a template and when editing one
 * already saved.
 *
 * The difficulty arrives already proposed from the piece itself
 * (`engine/difficulty.ts`) and says so — a proposal, not a verdict: nobody
 * knows what a piece costs to weave better than whoever wove it, so the
 * choice stays in her hands, which is why the suggested one is marked rather
 * than silently applied.
 */
export function TemplateCardDialog({
  title,
  name,
  meta,
  suggestedDifficulty,
  notice,
  confirmLabel,
  onNameChange,
  onConfirm,
  onCancel,
}: {
  title: string
  name: string
  meta: TemplateMeta
  /** What the app would say if nobody said otherwise — marked as "propuesta" next to that option. */
  suggestedDifficulty: Difficulty
  notice?: string
  confirmLabel: string
  /** Reported as it's typed, so the caller can warn about a name already taken while there's still time to change it. */
  onNameChange?: (name: string) => void
  onConfirm: (next: { name: string; meta: TemplateMeta }) => void
  onCancel: () => void
}) {
  const [draftName, setDraftName] = useState(name)
  const [kind, setKind] = useState<PieceKind | undefined>(meta.kind)
  const [difficulty, setDifficulty] = useState<Difficulty>(meta.difficulty ?? suggestedDifficulty)
  const [photo, setPhoto] = useState<string | undefined>(meta.photo)
  const [error, setError] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCancel])

  function confirm() {
    onConfirm({ name: draftName, meta: { kind, difficulty, photo } })
  }

  async function takePhoto(file: File | undefined) {
    if (!file) return
    setError(false)
    try {
      setPhoto(await readPhotoAsDataUrl(file))
    } catch {
      setError(true)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/40 md:items-center md:justify-center" onClick={onCancel}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="template-card-title"
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[88dvh] w-full flex-col rounded-t-2xl bg-surface pb-[env(safe-area-inset-bottom)] md:max-h-[85vh] md:max-w-md md:rounded-2xl md:pb-0"
      >
        <div className="shrink-0 px-4 pb-3 pt-4">
          <h2 id="template-card-title" className="text-base font-semibold">
            {title}
          </h2>
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-4 pb-4">
          <label className="flex flex-col gap-1.5">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-text-muted">
              {t.editor.saveTemplate.nameLabel}
            </span>
            <input
              autoFocus
              value={draftName}
              onChange={(e) => {
                setDraftName(e.target.value)
                onNameChange?.(e.target.value)
              }}
              // Enter guarda, como en cualquier campo de nombre: escribir y
              // apretar Enter es lo que hace quien viene con el teclado.
              onKeyDown={(e) => {
                if (e.key !== 'Enter' || !draftName.trim()) return
                e.preventDefault()
                confirm()
              }}
              className="rounded-xl border border-border bg-surface-2 px-3 py-2.5 text-sm outline-none focus:border-accent-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-500"
            />
          </label>
          {notice && <p className="text-xs text-warning">{notice}</p>}

          <section>
            <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-text-muted">
              {t.editor.templateMeta.kindLabel}
            </h3>
            <div className="flex flex-wrap gap-2">
              {KINDS.map((k) => (
                <Chip key={k} label={t.pieceKind[k]} selected={kind === k} onClick={() => setKind(kind === k ? undefined : k)} />
              ))}
            </div>
          </section>

          <section>
            <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-text-muted">
              {t.editor.templateMeta.difficultyLabel}
            </h3>
            <div className="flex flex-wrap gap-2">
              {DIFFICULTIES.map((d) => (
                <Chip
                  key={d}
                  label={d === suggestedDifficulty ? `${t.difficulty[d]} · ${t.editor.templateMeta.suggested}` : t.difficulty[d]}
                  selected={difficulty === d}
                  onClick={() => setDifficulty(d)}
                />
              ))}
            </div>
            <p className="mt-2 text-[11px] text-text-muted">{t.editor.templateMeta.difficultyHint}</p>
          </section>

          <section>
            <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-text-muted">
              {t.editor.templateMeta.photoLabel}
            </h3>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                takePhoto(e.target.files?.[0])
                e.target.value = ''
              }}
            />
            {photo ? (
              <div className="flex items-center gap-3">
                <img src={photo} alt="" className="h-20 w-20 shrink-0 rounded-xl border border-border object-cover" />
                <div className="flex min-w-0 flex-col items-start gap-1">
                  <button
                    onClick={() => fileRef.current?.click()}
                    className="rounded-full bg-surface-2 px-3 py-1.5 text-xs font-semibold hover:bg-surface-3"
                  >
                    {t.editor.templateMeta.photoChange}
                  </button>
                  <button
                    onClick={() => setPhoto(undefined)}
                    className="flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-semibold text-text-muted hover:text-text"
                  >
                    <Trash2 size={13} />
                    {t.editor.templateMeta.photoRemove}
                  </button>
                  <span className="px-3 text-[11px] text-text-soft">{t.editor.templateMeta.photoWeight(dataUrlSizeKb(photo))}</span>
                </div>
              </div>
            ) : (
              <button
                onClick={() => fileRef.current?.click()}
                className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-surface-2 py-3 text-sm font-semibold hover:border-accent-300"
              >
                <ImagePlus size={16} className="text-text-muted" />
                {t.editor.templateMeta.photoAdd}
              </button>
            )}
            <p className="mt-2 text-[11px] text-text-muted">{t.editor.templateMeta.photoHint}</p>
            {error && <p className="mt-1 text-xs text-red-500">{t.editor.templateMeta.photoError}</p>}
          </section>
        </div>

        <div className="flex shrink-0 gap-2 border-t border-border px-4 py-3">
          <button onClick={onCancel} className="h-11 flex-1 rounded-full bg-surface-2 text-sm font-semibold">
            {t.editor.saveTemplate.cancel}
          </button>
          <button
            onClick={confirm}
            disabled={!draftName.trim()}
            className="h-11 flex-1 rounded-full bg-accent-500 text-sm font-semibold text-accent-ink disabled:opacity-40"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

function Chip({ label, selected, onClick }: { label: string; selected: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors
        ${selected ? 'border-accent-500 bg-accent-500 text-accent-ink' : 'border-border bg-surface-2 text-text-muted hover:text-text'}`}
    >
      {label}
    </button>
  )
}
