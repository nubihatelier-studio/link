import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ArrowDown, ArrowRight, CopyPlus } from 'lucide-react'
import { useEditorStore } from '@/store/editorStore'
import { IconButton } from '@/components/shared/IconButton'
import { t } from '@/i18n/es'

/** How many copies in a row the button offers — enough for a repeated motif without turning into a number pad. */
const REPEATS = [2, 3, 5]

/**
 * "Clonar": repeats what's marked, copy after copy, in a row or in a column.
 * It used to live inside the Paleta panel, where nobody found it — it belongs
 * next to marcar / copiar / pegar, which is what it is: paste, several times,
 * perfectly aligned. The choices (which way, how many) open in a little panel
 * on top of the button, so the toolbar keeps one button per idea. The panel
 * is drawn over the page (a portal) and anchored to the button: inside the
 * phone's toolbar, which scrolls sideways, anything sticking out of the row
 * gets clipped away.
 */
export function CloneButton({ orientation = 'vertical' }: { orientation?: 'vertical' | 'horizontal' }) {
  const { selection, cloneDirection, setCloneDirection, cloneSelection } = useEditorStore()
  const [open, setOpen] = useState(false)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const [anchor, setAnchor] = useState<{ left: number; top?: number; bottom?: number } | null>(null)

  /** Pins the panel beside the button (desktop column) or above it (phone row). */
  function place() {
    const rect = buttonRef.current?.getBoundingClientRect()
    if (!rect) return
    const width = 176
    if (orientation === 'vertical') {
      setAnchor({ left: Math.min(rect.right + 8, window.innerWidth - width - 8), top: Math.max(8, rect.top) })
    } else {
      setAnchor({
        left: Math.min(Math.max(8, rect.left - width / 2 + rect.width / 2), window.innerWidth - width - 8),
        bottom: window.innerHeight - rect.top + 8,
      })
    }
  }

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  useEffect(() => {
    if (!selection) setOpen(false)
  }, [selection])

  const width = selection ? selection.c1 - selection.c0 + 1 : 0
  const height = selection ? selection.r1 - selection.r0 + 1 : 0

  return (
    <>
      <IconButton
        ref={buttonRef}
        label={t.editor.clone}
        active={open}
        disabled={!selection}
        aria-expanded={open}
        onClick={() => {
          place()
          setOpen((v) => !v)
        }}
      >
        <CopyPlus size={18} />
      </IconButton>

      {open && selection && anchor && createPortal(
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div
            role="group"
            aria-label={t.editor.clone}
            style={{ left: anchor.left, top: anchor.top, bottom: anchor.bottom }}
            className="fixed z-50 w-44 rounded-2xl border border-border bg-surface p-3 shadow-lg"
          >
            <p className="mb-2 text-xs text-text-muted">{t.editor.cloneSize(width, height)}</p>
            <div className="mb-3 flex gap-2">
              <DirectionButton
                label={t.editor.cloneHorizontal}
                active={cloneDirection === 'horizontal'}
                onClick={() => setCloneDirection('horizontal')}
              >
                <ArrowRight size={16} />
              </DirectionButton>
              <DirectionButton
                label={t.editor.cloneVertical}
                active={cloneDirection === 'vertical'}
                onClick={() => setCloneDirection('vertical')}
              >
                <ArrowDown size={16} />
              </DirectionButton>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {REPEATS.map((n) => (
                <button
                  key={n}
                  onClick={() => {
                    cloneSelection(cloneDirection, n)
                    setOpen(false)
                  }}
                  className="rounded-xl border border-border bg-surface-2 py-2 text-sm font-semibold text-text transition-colors hover:bg-surface-3"
                >
                  ×{n}
                </button>
              ))}
            </div>
          </div>
        </>,
        document.body,
      )}
    </>
  )
}

function DirectionButton({
  label,
  active,
  onClick,
  children,
}: {
  label: string
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      aria-label={label}
      aria-pressed={active}
      title={label}
      onClick={onClick}
      className={`flex flex-1 items-center justify-center rounded-xl border py-2 transition-colors
        ${active ? 'border-accent-500 bg-accent-500/10 text-text' : 'border-border bg-surface-2 text-text-muted hover:text-text'}`}
    >
      {children}
    </button>
  )
}
