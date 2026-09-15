import type { ReactNode } from 'react'
import { t } from '@/i18n/es'

/**
 * A panel that slides up from the bottom of a phone screen: a title, a
 * "Listo" to close it, and a body that scrolls on its own when it's taller
 * than the sheet.
 *
 * The fringe, shape and loop sheets used to be a bare box with a max height
 * and a grip: nothing inside could scroll, so everything past the fold was
 * unreachable, and the only way to close them was the thin strip of backdrop
 * left above. They also measured in `vh`, which on iOS Safari is taller than
 * the visible screen — `dvh` is what's actually there.
 */
export function BottomSheet({ title, onClose, children }: { title: ReactNode; onClose: () => void; children: ReactNode }) {
  return (
    <div className="fixed inset-0 z-40 flex items-end bg-black/40 md:hidden" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        className="flex max-h-[85dvh] w-full flex-col rounded-t-2xl bg-surface pb-[env(safe-area-inset-bottom)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border px-4 py-2.5">
          <h2 className="flex min-w-0 items-center gap-1.5 text-sm font-semibold">{title}</h2>
          <button onClick={onClose} className="shrink-0 rounded-full bg-accent-500 px-4 py-1.5 text-sm font-semibold text-accent-ink">
            {t.editor.colorsDone}
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">{children}</div>
      </div>
    </div>
  )
}
