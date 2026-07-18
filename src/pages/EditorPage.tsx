import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Download, Image, Keyboard, StickyNote, Type } from 'lucide-react'
import { usePatternsStore } from '@/store/patternsStore'
import { useEditorStore, type Tool } from '@/store/editorStore'
import { getBeadType } from '@/data/beadTypes'
import { beadCount } from '@/engine/geometry'
import { isFringeCapable, totalFringeBeadCount } from '@/engine/fringe'
import { exportPatternToPdf } from '@/lib/pdfExport'
import { exportInstagramCardImage, exportPatternImage } from '@/lib/imageExport'
import { exportPatternBackup } from '@/storage/backup'
import { t } from '@/i18n/es'
import { CanvasGrid } from '@/components/editor/CanvasGrid'
import { ToolPanel } from '@/components/editor/ToolPanel'
import { ColorPanel } from '@/components/editor/ColorPanel'
import { FringePanel } from '@/components/editor/FringePanel'
import { Button } from '@/components/shared/Button'
import { IconButton } from '@/components/shared/IconButton'
import { InfoScreen } from '@/components/shared/InfoScreen'

const TOOL_SHORTCUTS: { key: string; tool: Tool; labelKey: keyof typeof t.editor.tools }[] = [
  { key: 'P', tool: 'pencil', labelKey: 'pencil' },
  { key: 'L', tool: 'line', labelKey: 'line' },
  { key: 'B', tool: 'fill', labelKey: 'fill' },
  { key: 'E', tool: 'eraser', labelKey: 'eraser' },
  { key: 'I', tool: 'eyedropper', labelKey: 'eyedropper' },
  { key: 'S', tool: 'select', labelKey: 'select' },
]

function isTypingTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null
  return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)
}

export function EditorPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const getPattern = usePatternsStore((s) => s.getPattern)
  const {
    loadPattern,
    name,
    renamePattern,
    technique,
    cols,
    rows,
    beadTypeId,
    cells,
    fringe,
    rowShape,
    note,
    setNote,
    zoom,
    setZoom,
    setTool,
    undo,
    redo,
  } = useEditorStore()
  const [colorDrawerOpen, setColorDrawerOpen] = useState(false)
  const [fringeDrawerOpen, setFringeDrawerOpen] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [imageMenuOpen, setImageMenuOpen] = useState(false)
  const [exportingImage, setExportingImage] = useState(false)
  const [showLetters, setShowLetters] = useState(true)
  const [shortcutsOpen, setShortcutsOpen] = useState(false)
  const [noteOpen, setNoteOpen] = useState(false)
  const fringeCapable = isFringeCapable(technique)

  useEffect(() => {
    if (!id) return
    const doc = getPattern(id)
    if (doc) loadPattern(doc)
  }, [id, getPattern, loadPattern])

  useEffect(() => {
    if (!colorDrawerOpen) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setColorDrawerOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [colorDrawerOpen])

  useEffect(() => {
    if (!fringeDrawerOpen) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setFringeDrawerOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [fringeDrawerOpen])

  useEffect(() => {
    if (!shortcutsOpen) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setShortcutsOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [shortcutsOpen])

  useEffect(() => {
    if (!noteOpen) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setNoteOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [noteOpen])

  // Desktop shortcuts: tool letters, undo/redo, zoom. Ignored while typing
  // (e.g. renaming the pattern) so a letter like "e" doesn't hijack the name field.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (isTypingTarget(e.target)) return
      const meta = e.metaKey || e.ctrlKey
      const key = e.key.toLowerCase()

      if (meta && key === 'z') {
        e.preventDefault()
        if (e.shiftKey) redo()
        else undo()
        return
      }
      if (meta || e.altKey) return

      const shortcut = TOOL_SHORTCUTS.find((s) => s.key.toLowerCase() === key)
      if (shortcut) {
        e.preventDefault()
        setTool(shortcut.tool)
        return
      }
      if (key === '+' || key === '=') {
        e.preventDefault()
        setZoom(zoom + 25)
      } else if (key === '-') {
        e.preventDefault()
        setZoom(zoom - 25)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [setTool, undo, redo, zoom, setZoom])

  if (!id || !getPattern(id)) {
    return (
      <InfoScreen
        title={t.common.patternNotFound}
        message={t.common.patternNotFoundHint}
        action={{ label: t.common.goHome, onClick: () => navigate('/') }}
      />
    )
  }

  const bead = getBeadType(beadTypeId)
  const total = beadCount(technique, cols, rows, rowShape) + totalFringeBeadCount(fringe)

  function handleBackupPattern() {
    const doc = id ? getPattern(id) : undefined
    if (doc) exportPatternBackup(doc)
  }

  async function handleExport() {
    setExporting(true)
    try {
      await exportPatternToPdf({ name, technique, cols, rows, cells, fringe, rowShape, note, beadType: bead, showLetters })
    } finally {
      setExporting(false)
    }
  }

  async function handleExportImage() {
    setImageMenuOpen(false)
    setExportingImage(true)
    try {
      await exportPatternImage({ name, technique, cols, rows, cells, fringe, beadType: bead, showLetters })
    } finally {
      setExportingImage(false)
    }
  }

  async function handleExportInstagramCard() {
    setImageMenuOpen(false)
    setExportingImage(true)
    try {
      await exportInstagramCardImage({ name, technique, cols, rows, cells, fringe, beadType: bead, showLetters })
    } finally {
      setExportingImage(false)
    }
  }

  return (
    <div className="flex h-screen flex-col">
      <header className="flex items-center gap-3 border-b border-border px-4 pb-3 pt-[calc(0.75rem+env(safe-area-inset-top))]">
        <button onClick={() => navigate('/')} className="rounded-full p-2 hover:bg-surface-2" aria-label={t.editor.back}>
          ←
        </button>
        <div className="min-w-0 flex-1">
          <input
            value={name}
            onChange={(e) => renamePattern(e.target.value)}
            className="w-full truncate rounded bg-transparent text-lg font-bold outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-500"
          />
          <p className="truncate text-xs text-text-muted">
            {t.technique[technique]} · {cols}×{rows} · {bead.label} · {total} mostacillas
          </p>
        </div>
        <button
          onClick={() => navigate(`/editor/${id}/weave`)}
          className="hidden rounded-full bg-surface-2 px-4 py-2 text-sm font-semibold hover:bg-surface-3 sm:block"
        >
          {t.editor.weaveMode}
        </button>
        <button
          onClick={handleBackupPattern}
          aria-label={t.backup.exportPattern}
          title={t.backup.exportPattern}
          className="rounded-full p-2 text-text-muted hover:bg-surface-2 hover:text-text"
        >
          <Download size={18} />
        </button>
        <IconButton
          active={showLetters}
          label={t.editor.exportLetters}
          onClick={() => setShowLetters((v) => !v)}
          className="h-9 w-9"
        >
          <Type size={16} />
        </IconButton>
        <IconButton
          label={t.editor.shortcutsTitle}
          onClick={() => setShortcutsOpen(true)}
          className="hidden h-9 w-9 md:flex"
        >
          <Keyboard size={16} />
        </IconButton>
        <IconButton active={!!note.trim()} label={t.editor.noteTitle} onClick={() => setNoteOpen(true)} className="h-9 w-9">
          <StickyNote size={16} />
        </IconButton>
        <div className="relative">
          <IconButton
            label={t.editor.shareImage}
            active={imageMenuOpen}
            onClick={() => setImageMenuOpen((v) => !v)}
            className="h-9 w-9"
            disabled={exportingImage}
          >
            <Image size={16} />
          </IconButton>
          {imageMenuOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setImageMenuOpen(false)} />
              <div className="absolute right-0 z-50 mt-2 w-64 rounded-2xl border border-border bg-surface p-2 shadow-lg">
                <button
                  onClick={handleExportImage}
                  className="w-full rounded-xl px-3 py-2 text-left text-sm font-semibold hover:bg-surface-2"
                >
                  {t.editor.shareImageDownloadPng}
                </button>
                <button
                  onClick={handleExportInstagramCard}
                  className="w-full rounded-xl px-3 py-2 text-left text-sm font-semibold hover:bg-surface-2"
                >
                  {t.editor.shareImageInstagram}
                </button>
              </div>
            </>
          )}
        </div>
        <Button onClick={handleExport} disabled={exporting} className="px-4 py-2 text-sm">
          {exporting ? '…' : t.editor.exportPdf}
        </Button>
      </header>

      <div className="flex min-h-0 flex-1">
        <aside className="hidden w-16 shrink-0 flex-col items-center gap-2 border-r border-border py-4 md:flex">
          <ToolPanel orientation="vertical" />
        </aside>

        <div className="flex min-w-0 flex-1 flex-col p-4">
          <div className="mb-3 hidden items-center gap-2 md:flex">
            <button
              onClick={() => setZoom(zoom - 25)}
              aria-label={t.editor.zoomOut}
              className="flex h-8 w-8 items-center justify-center rounded-full border border-border text-lg hover:bg-surface-2"
            >
              −
            </button>
            <span className="w-14 text-center text-sm font-semibold">{zoom}%</span>
            <button
              onClick={() => setZoom(zoom + 25)}
              aria-label={t.editor.zoomIn}
              className="flex h-8 w-8 items-center justify-center rounded-full border border-border text-lg hover:bg-surface-2"
            >
              +
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-hidden rounded-2xl border border-border bg-surface">
            <CanvasGrid />
          </div>
        </div>

        <aside className="hidden w-80 shrink-0 flex-col border-l border-border md:flex">
          {fringeCapable && (
            <div className="max-h-64 shrink-0 overflow-y-auto border-b border-border">
              <FringePanel />
            </div>
          )}
          <div className="min-h-0 flex-1">
            <ColorPanel />
          </div>
        </aside>
      </div>

      <nav className="flex flex-col gap-2 border-t border-border bg-surface px-2 pt-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))] md:hidden">
        <div className="flex items-center justify-between px-1">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setColorDrawerOpen(true)}
              className="flex items-center gap-2 rounded-full bg-surface-2 px-3 py-1.5 text-xs font-semibold"
            >
              🎨 {t.editor.palette}
            </button>
            {fringeCapable && (
              <button
                onClick={() => setFringeDrawerOpen(true)}
                className="flex items-center gap-2 rounded-full bg-surface-2 px-3 py-1.5 text-xs font-semibold"
              >
                🪶 {t.editor.fringe.shortTitle}
              </button>
            )}
          </div>
          <button
            onClick={() => navigate(`/editor/${id}/weave`)}
            className="rounded-full bg-accent-500 px-3 py-1.5 text-xs font-semibold text-accent-ink"
          >
            {t.editor.weaveMode}
          </button>
        </div>
        <div className="no-scrollbar flex justify-center gap-2 overflow-x-auto">
          <ToolPanel orientation="horizontal" />
        </div>
      </nav>

      {colorDrawerOpen && (
        <div className="fixed inset-0 z-40 flex items-end bg-black/40 md:hidden" onClick={() => setColorDrawerOpen(false)}>
          <div
            className="max-h-[75vh] w-full rounded-t-2xl bg-surface pb-[env(safe-area-inset-bottom)]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-center py-2">
              <div className="h-1 w-10 rounded-full bg-surface-3" />
            </div>
            <ColorPanel />
          </div>
        </div>
      )}

      {fringeDrawerOpen && (
        <div className="fixed inset-0 z-40 flex items-end bg-black/40 md:hidden" onClick={() => setFringeDrawerOpen(false)}>
          <div
            className="max-h-[75vh] w-full rounded-t-2xl bg-surface pb-[env(safe-area-inset-bottom)]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-center py-2">
              <div className="h-1 w-10 rounded-full bg-surface-3" />
            </div>
            <FringePanel />
          </div>
        </div>
      )}

      {shortcutsOpen && (
        <div
          className="fixed inset-0 z-40 hidden items-center justify-center bg-black/40 md:flex"
          onClick={() => setShortcutsOpen(false)}
        >
          <div
            className="w-80 rounded-2xl border border-border bg-surface p-5 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold">{t.editor.shortcutsTitle}</h2>
              <button
                onClick={() => setShortcutsOpen(false)}
                aria-label={t.common.close}
                className="rounded-full p-1 text-text-muted hover:bg-surface-2"
              >
                ✕
              </button>
            </div>
            <ul className="flex flex-col gap-2 text-sm">
              {TOOL_SHORTCUTS.map((s) => (
                <li key={s.key} className="flex items-center justify-between gap-4">
                  <span className="text-text-muted">{t.editor.tools[s.labelKey]}</span>
                  <kbd className="rounded border border-border bg-surface-2 px-2 py-0.5 font-mono text-xs">{s.key}</kbd>
                </li>
              ))}
              <li className="flex items-center justify-between gap-4">
                <span className="text-text-muted">{t.editor.tools.undo}</span>
                <kbd className="rounded border border-border bg-surface-2 px-2 py-0.5 font-mono text-xs">Ctrl/Cmd+Z</kbd>
              </li>
              <li className="flex items-center justify-between gap-4">
                <span className="text-text-muted">{t.editor.tools.redo}</span>
                <kbd className="rounded border border-border bg-surface-2 px-2 py-0.5 font-mono text-xs">
                  Ctrl/Cmd+Shift+Z
                </kbd>
              </li>
              <li className="flex items-center justify-between gap-4">
                <span className="text-text-muted">{t.editor.zoom}</span>
                <kbd className="rounded border border-border bg-surface-2 px-2 py-0.5 font-mono text-xs">+ / −</kbd>
              </li>
            </ul>
          </div>
        </div>
      )}

      {noteOpen && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40" onClick={() => setNoteOpen(false)}>
          <div
            className="w-[90vw] max-w-md rounded-2xl border border-border bg-surface p-5 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold">{t.editor.noteTitle}</h2>
              <button
                onClick={() => setNoteOpen(false)}
                aria-label={t.common.close}
                className="rounded-full p-1 text-text-muted hover:bg-surface-2"
              >
                ✕
              </button>
            </div>
            <textarea
              autoFocus
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={t.editor.notePlaceholder}
              rows={5}
              className="w-full resize-none rounded-xl border border-border bg-surface-2 p-3 text-sm outline-none focus:border-accent-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-500"
            />
          </div>
        </div>
      )}
    </div>
  )
}
