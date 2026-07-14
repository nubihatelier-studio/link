import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Download } from 'lucide-react'
import { usePatternsStore } from '@/store/patternsStore'
import { useEditorStore } from '@/store/editorStore'
import { getBeadType } from '@/data/beadTypes'
import { beadCount } from '@/engine/geometry'
import { exportPatternToPdf } from '@/lib/pdfExport'
import { exportPatternBackup } from '@/storage/backup'
import { t } from '@/i18n/es'
import { CanvasGrid } from '@/components/editor/CanvasGrid'
import { ToolPanel } from '@/components/editor/ToolPanel'
import { ColorPanel } from '@/components/editor/ColorPanel'
import { Button } from '@/components/shared/Button'

export function EditorPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const getPattern = usePatternsStore((s) => s.getPattern)
  const { loadPattern, name, renamePattern, technique, cols, rows, beadTypeId, cells, zoom, setZoom } =
    useEditorStore()
  const [colorDrawerOpen, setColorDrawerOpen] = useState(false)
  const [exporting, setExporting] = useState(false)

  useEffect(() => {
    if (!id) return
    const doc = getPattern(id)
    if (doc) loadPattern(doc)
  }, [id, getPattern, loadPattern])

  if (!id || !getPattern(id)) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4">
        <p className="text-text-muted">No se encontró el patrón.</p>
        <Button onClick={() => navigate('/')}>Volver al inicio</Button>
      </div>
    )
  }

  const bead = getBeadType(beadTypeId)
  const total = beadCount(technique, cols, rows)

  function handleBackupPattern() {
    const doc = id ? getPattern(id) : undefined
    if (doc) exportPatternBackup(doc)
  }

  async function handleExport() {
    setExporting(true)
    try {
      await exportPatternToPdf({ name, technique, cols, rows, cells, beadType: bead })
    } finally {
      setExporting(false)
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
            className="w-full truncate bg-transparent text-lg font-bold outline-none"
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
        <Button onClick={handleExport} disabled={exporting} className="px-4 py-2 text-sm">
          {exporting ? '…' : t.editor.exportPdf}
        </Button>
      </header>

      <div className="flex min-h-0 flex-1">
        <aside className="hidden w-16 shrink-0 flex-col items-center gap-2 border-r border-border py-4 md:flex">
          <ToolPanel orientation="vertical" />
        </aside>

        <main className="flex min-w-0 flex-1 flex-col p-4">
          <div className="mb-3 hidden items-center gap-2 md:flex">
            <button
              onClick={() => setZoom(zoom - 25)}
              aria-label="Alejar"
              className="flex h-8 w-8 items-center justify-center rounded-full border border-border text-lg hover:bg-surface-2"
            >
              −
            </button>
            <span className="w-14 text-center text-sm font-semibold">{zoom}%</span>
            <button
              onClick={() => setZoom(zoom + 25)}
              aria-label="Acercar"
              className="flex h-8 w-8 items-center justify-center rounded-full border border-border text-lg hover:bg-surface-2"
            >
              +
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-hidden rounded-2xl border border-border bg-surface">
            <CanvasGrid />
          </div>
        </main>

        <aside className="hidden w-80 shrink-0 border-l border-border md:block">
          <ColorPanel />
        </aside>
      </div>

      <nav className="flex flex-col gap-2 border-t border-border bg-surface px-2 pt-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))] md:hidden">
        <div className="flex items-center justify-between px-1">
          <button
            onClick={() => setColorDrawerOpen(true)}
            className="flex items-center gap-2 rounded-full bg-surface-2 px-3 py-1.5 text-xs font-semibold"
          >
            🎨 {t.editor.palette}
          </button>
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
    </div>
  )
}
