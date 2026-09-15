import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { MoreHorizontal, MoreVertical, Star } from 'lucide-react'
import { usePatternsStore } from '@/store/patternsStore'
import { useWeaveStore, parseWeaveProgressKey } from '@/store/weaveStore'
import { useThemeStore, type ThemePref } from '@/store/themeStore'
import { beadCount } from '@/engine/geometry'
import { totalFringeBeadCount } from '@/engine/fringe'
import { loopBeadCount } from '@/engine/loop'
import { paletteFromCells } from '@/lib/palette'
import type { PatternDoc } from '@/engine/types'
import { pickMostRecentInProgress, summarizeWeaveProgress } from '@/engine/weaveProgressSummary'
import { leftPieceOf, rightEarring } from '@/engine/pair'
import { filterPatternsByName, sortPatterns, type LibrarySort } from '@/lib/patternLibrary'
import { LIBRARY_FILTERS, matchesLibraryFilter, weaveStatusOf, type LibraryFilter } from '@/lib/libraryFilter'
import { t } from '@/i18n/es'
import { exportFullBackup, exportPatternBackup, importBackupFile, parseBackupFile } from '@/storage/backup'
import { dismissBackupReminder, shouldShowBackupReminder } from '@/storage/backupReminder'
import { useStorageStatus } from '@/hooks/useStorageStatus'
import { APP_VERSION } from '@/version'
import { MainNav } from '@/components/shared/MainNav'
import { IconButton } from '@/components/shared/IconButton'
import { SegmentedControl } from '@/components/shared/SegmentedControl'
import { PatternThumb } from '@/components/shared/PatternThumb'
import { UndoToast } from '@/components/shared/UndoToast'

/** Colors shown as dots on a card; the rest become "+N". */
const MAX_CARD_COLORS = 4

export function HomePage() {
  const navigate = useNavigate()
  const location = useLocation()
  const { patterns, order, deletePattern, duplicatePattern, refresh, justOnboarded, dismissOnboarding } =
    usePatternsStore()
  const { theme, setTheme } = useThemeStore()
  const { persisted } = useStorageStatus()
  const weaveProgress = useWeaveStore((s) => s.progress)
  const loadAllProgress = useWeaveStore((s) => s.loadAllProgress)

  useEffect(() => {
    loadAllProgress()
  }, [loadAllProgress])
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [importMessage, setImportMessage] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  // Optimistically hidden from the list while its undo window is open —
  // only actually deleted once the toast expires without being undone.
  const [pendingDelete, setPendingDelete] = useState<{ id: string; doc: PatternDoc } | null>(null)
  const [reminderDismissed, setReminderDismissed] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  // Right after duplicating, the new card's name field is focused and
  // pre-selected instead of leaving it as "X (copia)" for someone to notice
  // and fix by hand later — renameDraft is the input's live value; nothing
  // is written back to the store until it's confirmed.
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameDraft, setRenameDraft] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [librarySort, setLibrarySort] = useState<LibrarySort>('recent')
  const [filter, setFilter] = useState<LibraryFilter>('all')
  /** Which card's "⋯" options are open. */
  const [cardMenuId, setCardMenuId] = useState<string | null>(null)
  const setFavorite = usePatternsStore((s) => s.setFavorite)
  const showBackupReminder = !reminderDismissed && shouldShowBackupReminder(order.length)
  // Search/sort only earn their place once the list is long enough to need them.
  const showLibraryControls = order.length > 5

  function handleDuplicate(id: string) {
    const newId = duplicatePattern(id)
    if (!newId) return
    setRenamingId(newId)
    setRenameDraft(usePatternsStore.getState().patterns[newId]?.name ?? '')
  }

  function commitRename() {
    if (renamingId && renameDraft.trim()) {
      usePatternsStore.getState().renamePattern(renamingId, renameDraft.trim())
    }
    setRenamingId(null)
  }

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

  // "Eliminar el patrón" desde el editor llega acá: la biblioteca es la dueña
  // del borrado y de su ventana para deshacer, así que el editor delega en vez
  // de tener su propio diálogo.
  useEffect(() => {
    const state = location.state as { deleteId?: string } | null
    if (!state?.deleteId) return
    const doc = patterns[state.deleteId]
    navigate('/', { replace: true })
    if (doc) requestDelete(doc)
  }, [location.state, patterns, navigate])

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

  // Progress is keyed per piece (see `weaveProgressKey`): the right earring of
  // a pair has its own. Only progress that still points at something counts —
  // a pattern that exists and, for a right earring, is still a pair — so
  // leftovers never hide the pattern that should be featured.
  const liveProgress = Object.fromEntries(
    Object.entries(weaveProgress).filter(([key]) => {
      const { patternId, side } = parseWeaveProgressKey(key)
      const doc = patterns[patternId]
      return !!doc && (side === 'left' || !!doc.pair)
    }),
  )
  // "Continuar tejiendo" belongs to "Todos": in the other filters every match is simply listed.
  const heroKey = filter === 'all' ? pickMostRecentInProgress(liveProgress) : null
  const hero = heroKey ? parseWeaveProgressKey(heroKey) : null
  const heroPatternId = hero?.patternId ?? null
  const heroPattern = heroPatternId ? patterns[heroPatternId] : undefined
  const heroPiece =
    heroPattern && hero
      ? hero.side === 'right' && heroPattern.pair
        ? rightEarring(leftPieceOf(heroPattern), heroPattern.pair)
        : leftPieceOf(heroPattern)
      : undefined
  const heroSummary =
    heroPattern && heroKey && heroPiece
      ? summarizeWeaveProgress(
          heroPattern.config,
          liveProgress[heroKey].currentIndex,
          heroPiece.fringe,
          heroPiece.rowShape,
        )
      : null

  /** Everything in the library right now — minus a pattern whose delete is still undoable. */
  const libraryPatterns = order
    .filter((id) => id !== pendingDelete?.id)
    .map((id) => patterns[id])
    .filter((p): p is PatternDoc => !!p)
  const statusOf = (doc: PatternDoc) => weaveStatusOf(doc, weaveProgress)
  const filterCount = (f: LibraryFilter) => libraryPatterns.filter((doc) => matchesLibraryFilter(doc, statusOf(doc), f)).length
  const visiblePatterns = libraryPatterns.filter((doc) => doc.id !== heroPatternId && matchesLibraryFilter(doc, statusOf(doc), filter))
  const displayedPatterns = sortPatterns(filterPatternsByName(visiblePatterns, searchQuery), librarySort)

  return (
    <div className="mx-auto min-h-screen max-w-3xl px-4 pb-32 pt-[calc(2rem+env(safe-area-inset-top))] sm:px-8">
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

      {justOnboarded && (
        <div className="mb-6 flex items-center justify-between gap-3 rounded-2xl border border-accent-300 bg-accent-500/10 px-4 py-3">
          <p className="text-sm text-text">{t.home.onboardingMessage}</p>
          <button
            onClick={dismissOnboarding}
            aria-label={t.common.close}
            className="shrink-0 rounded-full px-2 py-1.5 text-xs text-text-muted hover:bg-surface-3"
          >
            ✕
          </button>
        </div>
      )}

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

      {heroPattern && heroSummary && (
        <button
          onClick={() => navigate(`/editor/${heroPattern.id}/weave${hero?.side === 'right' ? '?aro=derecho' : ''}`)}
          className="mb-6 flex w-full items-center gap-4 rounded-2xl border border-accent-300 bg-accent-500/10 p-4 text-left hover:border-accent-500"
        >
          <PatternThumb pattern={heroPattern} size={64} />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold uppercase tracking-wide text-warning">{t.home.continueWeaving}</p>
            <p className="truncate font-semibold">
              {heroPattern.name}
              {heroPattern.pair && (
                <span className="font-normal text-text-muted">
                  {' '}
                  · {hero?.side === 'right' ? t.weave.rightEarring : t.weave.leftEarring}
                </span>
              )}
            </p>
            <p className="text-sm text-text-muted">
              {heroSummary.isFringe
                ? t.weave.fringeUnitLabel
                : heroSummary.isLoop
                  ? t.weave.loopStepLabel
                  : `${heroSummary.isPass ? t.weave.pass : t.weave.row} ${heroSummary.unitIndex + 1} ${t.weave.of} ${heroSummary.unitCount}`}{' '}
              · {heroSummary.percent}%
            </p>
          </div>
        </button>
      )}

      <h2 className="mb-3 text-lg font-semibold">{t.home.title}</h2>

      {libraryPatterns.length > 0 && (
        <div role="group" aria-label={t.home.filters.label} className="no-scrollbar -mx-4 mb-4 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:px-0">
          {LIBRARY_FILTERS.map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              aria-pressed={filter === f}
              className={`flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-2 text-sm font-semibold transition-colors
                ${filter === f ? 'bg-accent-500 text-accent-ink' : 'bg-surface-2 text-text hover:bg-surface-3'}`}
            >
              {t.home.filters[f]}{' '}
              <span className={`text-xs tabular-nums ${filter === f ? 'opacity-70' : 'text-text-muted'}`}>{filterCount(f)}</span>
            </button>
          ))}
        </div>
      )}

      {showLibraryControls && (
        <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t.home.searchPlaceholder}
            className="flex-1 rounded-xl border border-border bg-surface-2 px-3 py-2 text-sm outline-none focus:border-accent-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-500"
          />
          <select
            value={librarySort}
            onChange={(e) => setLibrarySort(e.target.value as LibrarySort)}
            className="rounded-xl border border-border bg-surface-2 px-3 py-2 text-sm outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-500"
          >
            <option value="recent">{t.home.sortRecent}</option>
            <option value="name">{t.home.sortName}</option>
            <option value="technique">{t.home.sortTechnique}</option>
          </select>
        </div>
      )}

      {libraryPatterns.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border p-10 text-center text-text-muted">
          {t.home.empty}
        </div>
      ) : visiblePatterns.length === 0 ? (
        // In "Todos" the only pattern may be the one featured above; nothing more to say.
        filter !== 'all' && (
          <div className="rounded-2xl border border-dashed border-border p-10 text-center text-text-muted">
            {t.home.emptyFilter[filter]}
          </div>
        )
      ) : displayedPatterns.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border p-10 text-center text-text-muted">
          {t.home.searchNoResults}
        </div>
      ) : (
        <ul className="flex flex-col gap-2.5">
          {displayedPatterns.map((p) => {
            const id = p.id
            const colors = paletteFromCells(p.cells).map((c) => c.hex)
            const status = statusOf(p)
            const cardSummary = summarizeWeaveProgress(
              p.config,
              weaveProgress[id]?.currentIndex ?? -1,
              p.fringe,
              p.rowShape,
            )
            const totalBeads = beadCount(p.config.technique, p.config.cols, p.config.rows, p.rowShape) + totalFringeBeadCount(p.fringe) + loopBeadCount(p.loop)
            const isRenaming = id === renamingId
            const cardBody = (
              <>
                <span className="flex h-[76px] w-[76px] shrink-0 items-center justify-center overflow-hidden rounded-xl bg-surface-2">
                  <PatternThumb pattern={p} size={72} />
                </span>
                <span className="flex min-w-0 flex-1 flex-col gap-1">
                  {isRenaming ? (
                    <input
                      autoFocus
                      value={renameDraft}
                      onChange={(e) => setRenameDraft(e.target.value)}
                      onFocus={(e) => e.target.select()}
                      onBlur={commitRename}
                      onClick={(e) => e.stopPropagation()}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault()
                          commitRename()
                        } else if (e.key === 'Escape') {
                          e.preventDefault()
                          setRenamingId(null)
                        }
                      }}
                      className="w-full rounded bg-transparent font-semibold outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-500"
                    />
                  ) : (
                    <span className="truncate font-semibold">{p.name}</span>
                  )}
                  <span className="truncate text-xs text-text-muted">
                    {t.technique[p.config.technique]} · {p.config.cols}×{p.config.rows}
                  </span>
                  {colors.length > 0 && (
                    <span className="flex items-center" aria-label={t.home.colorCount(colors.length)} title={t.home.colorCount(colors.length)}>
                      {colors.slice(0, MAX_CARD_COLORS).map((hex, i) => (
                        <span
                          key={hex}
                          className={`h-4 w-4 rounded-full border-2 border-surface ${i > 0 ? '-ml-1' : ''}`}
                          style={{ backgroundColor: hex }}
                        />
                      ))}
                      {colors.length > MAX_CARD_COLORS && (
                        <span className="ml-1 text-[10px] font-semibold text-text-muted">+{colors.length - MAX_CARD_COLORS}</span>
                      )}
                    </span>
                  )}
                  {status === 'finished' ? (
                    <span className="mt-0.5 w-fit rounded-full bg-accent-500/15 px-2 py-0.5 text-[11px] font-semibold text-accent-600">
                      ✓ {t.weave.finishedLabel}
                    </span>
                  ) : cardSummary ? (
                    <span className="flex items-center gap-2">
                      <span className="h-1 max-w-28 flex-1 overflow-hidden rounded-full bg-surface-3">
                        <span className="block h-full rounded-full bg-accent-500" style={{ width: `${cardSummary.percent}%` }} />
                      </span>
                      <span className="shrink-0 text-[10px] tabular-nums text-text-muted">{cardSummary.percent}%</span>
                    </span>
                  ) : (
                    <span className="text-[11px] text-text-muted">{t.editor.beadsTotal(totalBeads)}</span>
                  )}
                </span>
              </>
            )
            return (
              <li
                key={id}
                className="relative flex items-center gap-2 rounded-2xl border border-border bg-surface p-2.5 hover:border-accent-300"
              >
                {isRenaming ? (
                  <div className="flex min-w-0 flex-1 items-center gap-3">{cardBody}</div>
                ) : (
                  <button
                    onClick={() => navigate(`/editor/${id}`)}
                    className="flex min-w-0 flex-1 items-center gap-3 rounded-xl text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-500"
                  >
                    {cardBody}
                  </button>
                )}
                <div className="flex shrink-0 flex-col items-center">
                  <button
                    onClick={() => setFavorite(id, !p.favorite)}
                    aria-pressed={Boolean(p.favorite)}
                    aria-label={p.favorite ? t.home.unfavorite(p.name) : t.home.favorite(p.name)}
                    title={p.favorite ? t.home.unfavorite(p.name) : t.home.favorite(p.name)}
                    className={`flex h-10 w-10 items-center justify-center rounded-full hover:bg-surface-2 ${p.favorite ? 'text-accent-500' : 'text-text-muted'}`}
                  >
                    <Star size={20} fill={p.favorite ? 'currentColor' : 'none'} />
                  </button>
                  <button
                    onClick={() => setCardMenuId((open) => (open === id ? null : id))}
                    aria-label={t.home.cardOptions(p.name)}
                    aria-expanded={cardMenuId === id}
                    className="flex h-10 w-10 items-center justify-center rounded-full text-text-muted hover:bg-surface-2"
                  >
                    <MoreHorizontal size={20} />
                  </button>
                </div>
                {cardMenuId === id && (
                  <>
                    <div className="fixed inset-0 z-20" onClick={() => setCardMenuId(null)} />
                    <div className="absolute right-12 top-12 z-30 flex min-w-40 flex-col rounded-xl border border-border bg-surface p-1 shadow-lg">
                      <CardMenuItem onClick={() => handleDuplicate(id)} close={() => setCardMenuId(null)}>
                        {t.common.duplicate}
                      </CardMenuItem>
                      <CardMenuItem
                        onClick={() => {
                          setRenamingId(id)
                          setRenameDraft(p.name)
                        }}
                        close={() => setCardMenuId(null)}
                      >
                        {t.common.rename}
                      </CardMenuItem>
                      <CardMenuItem onClick={() => exportPatternBackup(p)} close={() => setCardMenuId(null)}>
                        {t.home.download}
                      </CardMenuItem>
                      <CardMenuItem danger onClick={() => requestDelete(p)} close={() => setCardMenuId(null)}>
                        {t.common.delete}
                      </CardMenuItem>
                    </div>
                  </>
                )}
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

      <MainNav />

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

function CardMenuItem({
  children,
  onClick,
  close,
  danger,
}: {
  children: React.ReactNode
  onClick: () => void
  close: () => void
  danger?: boolean
}) {
  return (
    <button
      onClick={() => {
        close()
        onClick()
      }}
      className={`rounded-lg px-3 py-2 text-left text-sm font-semibold hover:bg-surface-2 ${danger ? 'text-red-500' : ''}`}
    >
      {children}
    </button>
  )
}
