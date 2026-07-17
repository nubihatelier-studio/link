import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { MoreVertical } from 'lucide-react'
import { usePatternsStore } from '@/store/patternsStore'
import { useThemeStore, type ThemePref } from '@/store/themeStore'
import { getBeadType } from '@/data/beadTypes'
import type { PatternDoc } from '@/engine/types'
import { t } from '@/i18n/es'
import { exportFullBackup, importBackupFile, parseBackupFile } from '@/storage/backup'
import { dismissBackupReminder, shouldShowBackupReminder } from '@/storage/backupReminder'
import { useStorageStatus } from '@/hooks/useStorageStatus'
import { APP_VERSION } from '@/version'
import { Button } from '@/components/shared/Button'
import { IconButton } from '@/components/shared/IconButton'
import { SegmentedControl } from '@/components/shared/SegmentedControl'
import { PatternThumb } from '@/components/shared/PatternThumb'
import { UndoToast } from '@/components/shared/UndoToast'

export function HomePage() {
  const navigate = useNavigate()
  const { patterns, order, deletePattern, duplicatePattern, refresh } = usePatternsStore()
  const { theme, setTheme } = useThemeStore()
  const { persisted } = useStorageStatus()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [importMessage, setImportMessage] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  // Optimistically hidden from the list while its undo window is open —
  // only actually deleted once the toast expires without being undone.
  const [pendingDelete, setPendingDelete] = useState<{ id: string; doc: PatternDoc } | null>(null)
  const [reminderDismissed, setReminderDismissed] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const showBackupReminder = !reminderDismissed && shouldShowBackupReminder(order.length)

  useEffect(() => {
    if (!menuOpen) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setMenuOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [menuOpen])

  function dismissReminder() {
    dismissBackupReminder()
    setReminderDismissed(true)
  }

  async function backupFromReminder() {
    await exportFullBackup()
    setReminderDismissed(true)
  }

  function requestDelete(doc: PatternDoc) {
    // Only one undo window open at a time: finalize whatever was already pending.
    if (pendingDelete) deletePattern(pendingDelete.id)
    setPendingDelete({ id: doc.id, doc })
  }

  function undoDelete() {
    setPendingDelete(null)
  }

  function confirmDelete() {
    if (!pendingDelete) return
    deletePattern(pendingDelete.id)
    setPendingDelete(null)
  }

  // A pending delete is only real once its UndoToast expires — but that
  // timer gets cancelled if this page unmounts (navigating elsewhere) or the
  // tab closes before the ~6s window is up, which used to leave the pattern
  // "revived" on the next visit despite having been hidden from the list.
  // Finalize it ourselves in both cases instead of losing it silently.
  const pendingDeleteRef = useRef(pendingDelete)
  pendingDeleteRef.current = pendingDelete

  useEffect(() => {
    function finalizePendingDelete() {
      if (pendingDeleteRef.current) deletePattern(pendingDeleteRef.current.id)
    }
    window.addEventListener('pagehide', finalizePendingDelete)
    return () => {
      window.removeEventListener('pagehide', finalizePendingDelete)
      finalizePendingDelete()
    }
  }, [deletePattern])

  async function handleImportFile(file: File) {
    setImportMessage(null)
    setBusy(true)
    try {
      const raw = await file.text()
      const parsed = parseBackupFile(raw)
      const { importedCount } = await importBackupFile(parsed)
      await refresh()
      setImportMessage(t.backup.importSuccess(importedCount))
    } catch (err) {
      setImportMessage((err as Error).message || t.backup.importError)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto min-h-screen max-w-3xl px-4 pb-28 pt-[calc(2rem+env(safe-area-inset-top))] sm:px-8">
      <header className="mb-6 flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-3">
          <img src="/logo.png" alt="" className="h-10 w-10 shrink-0 rounded-full" />
          <h1 className="truncate font-serif text-2xl italic text-text">{t.app.name}</h1>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <SegmentedControl<ThemePref>
            value={theme}
            onChange={setTheme}
            options={[
              { value: 'system', label: 'Auto' },
              { value: 'light', label: 'Claro' },
              { value: 'dark', label: 'Oscuro' },
            ]}
          />
          <div className="relative">
            <IconButton label={t.common.moreOptions} onClick={() => setMenuOpen((v) => !v)}>
              <MoreVertical size={18} />
            </IconButton>
            {menuOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} />
                <div className="absolute right-0 z-50 mt-2 w-72 rounded-2xl border border-border bg-surface p-3 shadow-lg">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="application/json,.json"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0]
                      if (file) handleImportFile(file)
                      e.target.value = ''
                    }}
                  />
                  <div className="flex flex-col gap-1.5">
                    <button
                      disabled={busy || order.length === 0}
                      onClick={() => exportFullBackup()}
                      className="rounded-xl px-3 py-2 text-left text-sm font-semibold hover:bg-surface-2 disabled:opacity-40"
                    >
                      {t.backup.exportAll}
                    </button>
                    <button
                      disabled={busy}
                      onClick={() => fileInputRef.current?.click()}
                      className="rounded-xl px-3 py-2 text-left text-sm font-semibold hover:bg-surface-2 disabled:opacity-40"
                    >
                      {t.backup.import}
                    </button>
                  </div>
                  {importMessage && <p className="mt-2 px-3 text-xs text-text-muted">{importMessage}</p>}
                  {persisted !== null && (
                    <p className={`mt-2 px-3 text-xs ${persisted ? 'text-text-muted' : 'font-semibold text-warning'}`}>
                      {persisted ? t.storage.protected : t.storage.atRisk}
                    </p>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </header>

      {showBackupReminder && (
        <div className="mb-6 flex items-center justify-between gap-3 rounded-2xl border border-accent-300 bg-accent-500/10 px-4 py-3">
          <p className="text-sm text-text">{t.backup.reminderMessage}</p>
          <div className="flex shrink-0 items-center gap-2">
            <button
              onClick={backupFromReminder}
              className="rounded-full bg-accent-500 px-3 py-1.5 text-xs font-semibold text-accent-ink hover:bg-accent-400 active:bg-accent-600"
            >
              {t.backup.exportAll}
            </button>
            <button
              onClick={dismissReminder}
              aria-label={t.common.close}
              className="rounded-full px-2 py-1.5 text-xs text-text-muted hover:bg-surface-3"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      <h2 className="mb-4 text-lg font-semibold">{t.home.title}</h2>

      {order.filter((id) => id !== pendingDelete?.id).length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border p-10 text-center text-text-muted">
          {t.home.empty}
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {order.map((id) => {
            if (id === pendingDelete?.id) return null
            const p = patterns[id]
            if (!p) return null
            const bead = getBeadType(p.config.beadTypeId)
            const colorCount = new Set(Object.values(p.cells)).size
            return (
              <li
                key={id}
                className="flex items-center gap-4 rounded-2xl border border-border bg-surface-2 p-3 hover:border-accent-300"
              >
                <button
                  onClick={() => navigate(`/editor/${id}`)}
                  className="flex min-w-0 flex-1 items-center gap-4 rounded-xl text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-500"
                >
                  <PatternThumb pattern={p} size={64} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold">{p.name}</p>
                    <p className="truncate text-sm text-text-muted">
                      {t.technique[p.config.technique]} · {p.config.cols}×{p.config.rows} · {bead.label}
                    </p>
                    <p className="text-xs text-text-muted">{colorCount} colores</p>
                  </div>
                </button>
                <button
                  className="shrink-0 rounded-full px-3 py-1 text-xs text-text-muted hover:bg-surface-3"
                  onClick={() => duplicatePattern(id)}
                >
                  {t.common.duplicate}
                </button>
                <button
                  className="shrink-0 rounded-full px-3 py-1 text-xs text-red-500 hover:bg-red-500/10"
                  onClick={() => requestDelete(p)}
                >
                  {t.common.delete}
                </button>
              </li>
            )
          })}
        </ul>
      )}

      <p className="mt-10 text-center text-xs text-text-muted">
        {t.privacy.footer}
        <br />
        {t.privacy.version(APP_VERSION)}
      </p>

      <div className="fixed inset-x-0 bottom-0 flex justify-center bg-gradient-to-t from-canvas via-canvas to-transparent px-6 pt-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
        <Button className="max-w-sm" fullWidth onClick={() => navigate('/new')}>
          {t.home.createNew}
        </Button>
      </div>

      {pendingDelete && (
        <UndoToast
          key={pendingDelete.id}
          message={t.common.deletedPattern(pendingDelete.doc.name)}
          onUndo={undoDelete}
          onExpire={confirmDelete}
        />
      )}
    </div>
  )
}
