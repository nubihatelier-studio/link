import { useEffect, useRef, type ReactNode } from 'react'

interface NameDialogProps {
  title: string
  label: string
  value: string
  onChange: (value: string) => void
  /** Shown under the field — e.g. that a template with this name already exists. */
  notice?: ReactNode
  confirmLabel: string
  cancelLabel: string
  onConfirm: () => void
  onCancel: () => void
}

/**
 * A small dialog that asks for a name: a sheet from the bottom on a phone, a
 * centered dialog on a larger screen. Enter confirms, Escape cancels, and an
 * empty name can't be confirmed.
 */
export function NameDialog({ title, label, value, onChange, notice, confirmLabel, cancelLabel, onConfirm, onCancel }: NameDialogProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const canConfirm = value.trim().length > 0

  useEffect(() => {
    inputRef.current?.focus()
    inputRef.current?.select()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // Focus once, when the dialog opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/40 md:items-center md:justify-center" onClick={onCancel}>
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby="name-dialog-title"
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault()
          if (canConfirm) onConfirm()
        }}
        className="flex w-full flex-col gap-4 rounded-t-2xl bg-surface p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] md:max-w-sm md:rounded-2xl md:pb-4"
      >
        <h2 id="name-dialog-title" className="text-base font-semibold">
          {title}
        </h2>
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-semibold text-text-muted">{label}</span>
          <input
            id="name-dialog-input"
            ref={inputRef}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className="rounded-xl border border-border bg-surface-2 px-3 py-2.5 text-[16px] outline-none focus:border-accent-500"
          />
        </label>
        {notice && <div className="text-sm text-text-muted">{notice}</div>}
        <div className="flex gap-2">
          <button type="button" onClick={onCancel} className="h-11 flex-1 rounded-full bg-surface-2 text-sm font-semibold">
            {cancelLabel}
          </button>
          <button
            type="submit"
            disabled={!canConfirm}
            className="h-11 flex-1 rounded-full bg-accent-500 text-sm font-semibold text-accent-ink disabled:opacity-40"
          >
            {confirmLabel}
          </button>
        </div>
      </form>
    </div>
  )
}
