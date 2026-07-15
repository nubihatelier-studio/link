interface ToastProps {
  message: string
  actionLabel: string
  onAction: () => void
}

/**
 * Shared pill-shaped toast shell: a message plus one action button, pinned
 * above the bottom nav (safe-area aware). Used both by UndoToast (auto-expires,
 * action = "Deshacer") and UpdateToast (persists until acted on, action =
 * "Actualizar") — same look, different lifetime rules owned by each caller.
 */
export function Toast({ message, actionLabel, onAction }: ToastProps) {
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-50 flex justify-center px-4 md:bottom-6">
      <div className="pointer-events-auto flex items-center gap-4 rounded-full bg-surface-3 px-4 py-2.5 shadow-lg">
        <span className="text-sm">{message}</span>
        <button onClick={onAction} className="shrink-0 text-sm font-semibold text-accent-500 hover:text-accent-600">
          {actionLabel}
        </button>
      </div>
    </div>
  )
}
