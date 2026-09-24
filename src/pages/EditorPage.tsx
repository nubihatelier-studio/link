import { useEffect, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { CaseSensitive, Download, Image, Keyboard, MoreHorizontal, StickyNote, Type } from 'lucide-react'
import { usePatternsStore } from '@/store/patternsStore'
import { useEditorStore, type Tool } from '@/store/editorStore'
import { useEditorPrefsStore } from '@/store/editorPrefsStore'
import { useWeaveStore } from '@/store/weaveStore'
import { getBeadType } from '@/data/beadTypes'
import { beadCount } from '@/engine/geometry'
import { WEAVE_ORDER_VERSION } from '@/engine/weaveOrder'
import { isFringeCapable, totalFringeBeadCount } from '@/engine/fringe'
import { isShapeCapable } from '@/engine/shape'
import { loopBeadCount } from '@/engine/loop'
import { exportPatternToPdf, type PdfSections } from '@/lib/pdfExport'
import { exportInstagramCardImage, exportPatternImage } from '@/lib/imageExport'
import { exportPatternBackup } from '@/storage/backup'
import { t } from '@/i18n/es'
import { CanvasGrid } from '@/components/editor/CanvasGrid'
import { HistoryButtons, ToolPanel } from '@/components/editor/ToolPanel'
import { ColorPanel } from '@/components/editor/ColorPanel'
import { ColorStrip } from '@/components/editor/ColorStrip'
import { FringeIcon } from '@/components/icons/FringeIcon'
import { ShapeIcon } from '@/components/icons/ShapeIcon'
import { LoopIcon } from '@/components/icons/LoopIcon'
import { FringePanel } from '@/components/editor/FringePanel'
import { ShapePanel } from '@/components/editor/ShapePanel'
import { LoopPanel } from '@/components/editor/LoopPanel'
import { PairBar } from '@/components/editor/PairBar'
import { ZoomBar } from '@/components/editor/ZoomBar'
import { ColorChooser } from '@/components/editor/ColorChooser'
import { ColorCard } from '@/components/editor/ColorCard'
import { PhotoPaletteDialog } from '@/components/editor/PhotoPaletteDialog'
import { Button } from '@/components/shared/Button'
import { IconButton } from '@/components/shared/IconButton'
import { InfoScreen } from '@/components/shared/InfoScreen'
import { UndoToast } from '@/components/shared/UndoToast'
import { TemplateCardDialog } from '@/components/templates/TemplateCardDialog'
import { ResizeDialog } from '@/components/editor/ResizeDialog'
import { TriangleRoundsDialog } from '@/components/editor/TriangleRoundsDialog'
import { BeadTypeDialog } from '@/components/editor/BeadTypeDialog'
import { ShoppingListDialog } from '@/components/editor/ShoppingListDialog'
import { EditorPanelTabs } from '@/components/editor/EditorPanelTabs'
import { suggestDifficulty } from '@/engine/difficulty'
import type { TemplateMeta } from '@/engine/template'
import { FeedbackMenuItems } from '@/components/shared/FeedbackMenuItems'
import { BottomSheet } from '@/components/shared/BottomSheet'
import { templateNamed } from '@/engine/template'
import type { PatternDoc } from '@/engine/types'
import { Toast } from '@/components/shared/Toast'
import { ExportPdfDialog } from '@/components/editor/ExportPdfDialog'

const TOOL_SHORTCUTS: { key: string; tool: Tool; labelKey: keyof typeof t.editor.tools }[] = [
  { key: 'P', tool: 'pencil', labelKey: 'pencil' },
  { key: 'L', tool: 'line', labelKey: 'line' },
  { key: 'B', tool: 'fill', labelKey: 'fill' },
  { key: 'E', tool: 'eraser', labelKey: 'eraser' },
  { key: 'I', tool: 'eyedropper', labelKey: 'eyedropper' },
  { key: 'S', tool: 'select', labelKey: 'select' },
  { key: 'M', tool: 'pan', labelKey: 'pan' },
]

function isTypingTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null
  return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)
}

export function EditorPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const location = useLocation()
  const getPattern = usePatternsStore((s) => s.getPattern)
  const {
    loadPattern,
    name,
    renamePattern,
    technique,
    cols,
    rows,
    rounds,
    beadTypeId,
    staggerPhase,
    cells,
    fringe,
    rowShape,
    loop,
    note,
    setNote,
    zoom,
    setZoom,
    requestFitZoom,
    setTool,
    setFringeSymmetric,
    undo,
    redo,
    patternId,
    weaveResetPending,
    clearWeaveResetPending,
    pair,
    side,
    leftPiece,
    clearAllCells,
    clearUnusedSlots,
  } = useEditorStore()
  const [colorDrawerOpen, setColorDrawerOpen] = useState(false)
  const [fringeDrawerOpen, setFringeDrawerOpen] = useState(false)
  const [shapeDrawerOpen, setShapeDrawerOpen] = useState(false)
  const [loopDrawerOpen, setLoopDrawerOpen] = useState(false)
  const [exporting, setExporting] = useState(false)
  /** Palette colours not painted anywhere — what "Quitar colores sin usar" would drop. */
  const unusedSlots = useEditorStore((st) => st.slots.filter((hex) => hex && !Object.values(st.cells).includes(hex)).length)
  const paintedCells = useEditorStore((st) => Object.keys(st.cells).length)
  /** Non-null while an export failure toast is showing — see `handleExport`. */
  const [exportError, setExportError] = useState<string | null>(null)
  /** The "qué incluir" picker — see `ExportPdfDialog`. */
  const [exportDialogOpen, setExportDialogOpen] = useState(false)
  const [imageMenuOpen, setImageMenuOpen] = useState(false)
  /** Phone only: the header's secondary actions, folded away so the pattern's name has room. */
  const [moreMenuOpen, setMoreMenuOpen] = useState(false)
  const [exportingImage, setExportingImage] = useState(false)
  const letterVisibility = useEditorPrefsStore((s) => s.letterVisibility)
  const cycleLetterVisibility = useEditorPrefsStore((s) => s.cycleLetterVisibility)
  // Exports keep taking a plain "does she want letters at all": their own
  // legibility floors are about print and pixel size, not screen zoom.
  const showLetters = letterVisibility !== 'never'
  const [shortcutsOpen, setShortcutsOpen] = useState(false)
  const [noteOpen, setNoteOpen] = useState(false)
  /** "Cambiar tamaño" — see ResizeDialog. */
  const [resizeOpen, setResizeOpen] = useState(false)
  /** "Vueltas", el tamaño del aro triangular — ver TriangleRoundsDialog. */
  const [roundsOpen, setRoundsOpen] = useState(false)
  /** "Cambiar la mostacilla" — see BeadTypeDialog. */
  const [beadTypeOpen, setBeadTypeOpen] = useState(false)
  /** "Lista de compras" — see ShoppingListDialog. */
  const [shoppingOpen, setShoppingOpen] = useState(false)
  /** The "Guardar como plantilla" dialog's name draft, or null while it's closed. */
  const [templateName, setTemplateName] = useState<string | null>(null)
  /** After saving a template: what to say, and how to undo it (drop the new one, or put back the one it replaced). */
  const [templateSaved, setTemplateSaved] = useState<{ message: string; undo: () => void } | null>(null)
  const templates = usePatternsStore((s) => s.templates)
  /** The pattern as saved — what the template is made from, and what its difficulty is proposed from. */
  const templateSource = usePatternsStore((s) => (patternId ? s.patterns[patternId] : undefined))
  const templateClash = templateName !== null ? templateNamed(Object.values(templates), templateName) : undefined

  function confirmSaveTemplate(draft: { name: string; meta: TemplateMeta }) {
    if (!draft.name.trim()) return
    const clash = templateNamed(Object.values(templates), draft.name)
    const result = useEditorStore.getState().saveAsTemplate(draft.name, clash?.id, draft.meta)
    setTemplateName(null)
    if (!result) return
    const name = draft.name.trim()
    const replaced: PatternDoc | null = result.replaced
    setTemplateSaved({
      message: replaced ? t.editor.saveTemplate.replaced(name) : t.editor.saveTemplate.saved(name),
      undo: () => {
        const store = usePatternsStore.getState()
        if (replaced) store.restoreTemplate(replaced)
        else store.deleteTemplate(result.id)
      },
    })
  }
  // On the right earring of a pair the shape, fringe and loop follow the left
  // one (mirrored) and are edited there — see `PairBar`.
  const onRightEarring = pair !== undefined && side === 'right'
  /**
   * El aro triangular se edita acá mismo, con la misma interfaz que el
   * peyote, pero no es una grilla: no tiene forma del cuerpo, ni flecos, ni
   * argolla, ni par de aros, y todavía no tiene PDF ni modo tejido. Se
   * esconde o se apaga lo que no aplica, en vez de dejarlo puesto y roto.
   */
  const esTriangulo = technique === 'triangle'
  const fringeCapable = isFringeCapable(technique) && !onRightEarring
  const shapeCapable = isShapeCapable(technique) && !onRightEarring
  const loopCapable = !onRightEarring && !esTriangulo

  useEffect(() => {
    if (!id) return
    const doc = getPattern(id)
    if (!doc) return
    loadPattern(doc)
    // "Aro con flecos" arrives here right after creation with this flag set
    // (see ConfiguratorPage#handleCreate) — its rhombus body + V fringe are
    // symmetric by construction, so starting with the toggle on keeps a
    // manual tweak from silently drifting lopsided.
    const state = location.state as { fringeSymmetricDefault?: boolean } | null
    if (state?.fringeSymmetricDefault) setFringeSymmetric(true)
  }, [id, getPattern, loadPattern, location.state, setFringeSymmetric])

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
    if (!shapeDrawerOpen) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setShapeDrawerOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [shapeDrawerOpen])

  useEffect(() => {
    if (!loopDrawerOpen) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setLoopDrawerOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [loopDrawerOpen])

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
      } else if (key === '0') {
        // Lo mismo que el botón "Ajustar a pantalla" de la barra de zoom.
        e.preventDefault()
        requestFitZoom()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [setTool, undo, redo, zoom, setZoom, requestFitZoom])

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
  // Both earrings of a pair share one shape, so the pair is exactly twice one earring.
  const beadsPerPiece = beadCount(technique, cols, rows, rowShape) + totalFringeBeadCount(fringe) + loopBeadCount(loop)
  const beadsLabel = pair ? t.editor.pair.beadsOfPair(beadsPerPiece * 2) : t.editor.beadsTotal(beadsPerPiece)

  /**
   * What the exports draw: the saved pattern, which is the LEFT earring —
   * never the working fields, which hold whichever earring is on screen.
   */
  function exportFields() {
    const left = leftPiece()
    // `pair` is read after `leftPiece()` flushed any pending save, so it holds the right earring's latest colours.
    const currentPair = useEditorStore.getState().pair
    // The saved letter assignment travels with the export, so paper and screen
    // name the same colour the same way — see `engine/letters.ts`.
    const letterAssignment = id ? getPattern(id)?.letters : undefined
    if (!left)
      return { technique, cols, rows, rounds, cells, fringe, rowShape, staggerPhase, loop, pair: currentPair, letterAssignment }
    return { ...left, rounds, pair: currentPair, letterAssignment }
  }

  /**
   * Deleting from the editor hands over to the library's own delete, which
   * shows the undo toast — the app never asks "are you sure", it lets you take
   * it back, and that shouldn't change depending on which screen you're on.
   */
  function handleDeletePattern() {
    navigate('/', { state: { deleteId: id } })
  }

  function handleBackupPattern() {
    const doc = id ? getPattern(id) : undefined
    if (doc) exportPatternBackup(doc)
  }

  function undoWeaveReset() {
    if (weaveResetPending === null) return
    undo()
    if (patternId) useWeaveStore.getState().setIndex(patternId, weaveResetPending, WEAVE_ORDER_VERSION[technique])
    clearWeaveResetPending()
  }

  async function handleExport(sections: PdfSections) {
    setExportDialogOpen(false)
    setExporting(true)
    setExportError(null)
    try {
      await exportPatternToPdf({ ...exportFields(), name, note, beadType: bead, showLetters, sections })
    } catch (err) {
      // Never swallow this: a silent failure looks exactly like a dead
      // button, which is what the weaver reported.
      console.error('Export a PDF falló:', err)
      setExportError(t.editor.exportFailed)
    } finally {
      setExporting(false)
    }
  }

  async function handleExportImage() {
    setImageMenuOpen(false)
    setExportingImage(true)
    setExportError(null)
    try {
      await exportPatternImage({ ...exportFields(), name, beadType: bead, showLetters })
    } catch (err) {
      console.error('Export a PNG falló:', err)
      setExportError(t.editor.exportImageFailed)
    } finally {
      setExportingImage(false)
    }
  }

  async function handleExportInstagramCard() {
    setImageMenuOpen(false)
    setExportingImage(true)
    setExportError(null)
    try {
      await exportInstagramCardImage({ ...exportFields(), name, beadType: bead, showLetters })
    } catch (err) {
      console.error('Export de tarjeta falló:', err)
      setExportError(t.editor.exportImageFailed)
    } finally {
      setExportingImage(false)
    }
  }

  return (
    // `dvh`, not `vh`: on an iPhone 100vh is taller than what Safari shows, so
    // the whole page scrolled — the header slid under the clock and the tools
    // ended up below the fold.
    <div className="flex h-dvh flex-col">
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
            {t.technique[technique]} · {esTriangulo ? t.home.roundCount(rounds) : `${cols}×${rows}`} · {bead.label} ·{' '}
            {beadsLabel}
          </p>
        </div>
        {!esTriangulo && (
          <button
            onClick={() => navigate(`/editor/${id}/weave`)}
            className="hidden rounded-full bg-surface-2 px-4 py-2 text-sm font-semibold hover:bg-surface-3 sm:block"
          >
            {t.editor.weaveMode}
          </button>
        )}
        <button
          onClick={handleBackupPattern}
          aria-label={t.backup.exportPattern}
          title={t.backup.exportPattern}
          className="hidden rounded-full p-2 text-text-muted hover:bg-surface-2 hover:text-text sm:block"
        >
          <Download size={18} />
        </button>
        <IconButton
          active={letterVisibility !== 'never'}
          label={`${t.editor.letterVisibility[letterVisibility]} — ${t.editor.letterVisibility[`${letterVisibility}Hint`]}`}
          onClick={cycleLetterVisibility}
          className="h-9 w-9"
        >
          {letterVisibility === 'always' ? <CaseSensitive size={17} /> : <Type size={16} />}
        </IconButton>
        <IconButton
          label={t.editor.shortcutsTitle}
          onClick={() => setShortcutsOpen(true)}
          className="hidden h-9 w-9 md:flex"
        >
          <Keyboard size={16} />
        </IconButton>
        <IconButton
          active={!!note.trim()}
          label={t.editor.noteTitle}
          onClick={() => setNoteOpen(true)}
          className="hidden h-9 w-9 sm:flex"
        >
          <StickyNote size={16} />
        </IconButton>
        <div className="relative hidden sm:block">
          <IconButton
            label={esTriangulo ? t.editor.triangleNoExport : t.editor.shareImage}
            active={imageMenuOpen}
            onClick={() => setImageMenuOpen((v) => !v)}
            className="h-9 w-9"
            disabled={exportingImage || esTriangulo}
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
        {/* Hidden on the wrapper: `Button`'s own `inline-flex` would win over a `hidden` passed to it. */}
        <div className="hidden sm:block">
          <Button onClick={() => setExportDialogOpen(true)} disabled={exporting} className="px-4 py-2 text-sm">
            {exporting ? '…' : t.editor.exportPdf}
          </Button>
        </div>
        {/* En el celular lleva todo; en pantallas grandes sólo lo que no tiene
            ya su propio botón en la barra, para no ofrecer lo mismo dos veces. */}
        <div className="relative">
          <IconButton
            label={t.editor.moreActions}
            active={moreMenuOpen}
            onClick={() => setMoreMenuOpen((v) => !v)}
            className="h-9 w-9"
          >
            <MoreHorizontal size={18} />
          </IconButton>
          {moreMenuOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setMoreMenuOpen(false)} />
              <div className="absolute right-0 z-50 mt-2 w-72 rounded-2xl border border-border bg-surface p-2 shadow-lg">
                <div className="sm:hidden">
                  <MenuHeading>{t.editor.menuExport}</MenuHeading>
                  <MenuItem disabled={exporting} onClick={() => setExportDialogOpen(true)} close={() => setMoreMenuOpen(false)}>
                    {exporting ? '…' : t.editor.exportPdf}
                  </MenuItem>
                  <MenuItem
                    disabled={exportingImage || esTriangulo}
                    hint={esTriangulo ? t.editor.triangleNoExport : undefined}
                    onClick={handleExportImage}
                    close={() => setMoreMenuOpen(false)}
                  >
                    {t.editor.shareImageDownloadPng}
                  </MenuItem>
                  <MenuItem
                    disabled={exportingImage || esTriangulo}
                    hint={esTriangulo ? t.editor.triangleNoExport : undefined}
                    onClick={handleExportInstagramCard}
                    close={() => setMoreMenuOpen(false)}
                  >
                    {t.editor.shareImageInstagram}
                  </MenuItem>
                  <MenuItem onClick={() => setNoteOpen(true)} close={() => setMoreMenuOpen(false)}>
                    {t.editor.noteTitle}
                  </MenuItem>
                  <MenuItem onClick={handleBackupPattern} close={() => setMoreMenuOpen(false)}>
                    {t.backup.exportPattern}
                  </MenuItem>
                  <div className="my-1 h-px bg-border" />
                </div>

                <MenuHeading>{t.editor.menuPalette}</MenuHeading>
                <MenuItem disabled={unusedSlots === 0} onClick={clearUnusedSlots} close={() => setMoreMenuOpen(false)}>
                  {t.editor.clearUnusedColors}
                </MenuItem>

                <div className="my-1 h-px bg-border" />
                <MenuHeading>{t.editor.menuPattern}</MenuHeading>
                {esTriangulo ? (
                  <MenuItem
                    hint={t.editor.triangleRounds.menuHint}
                    onClick={() => setRoundsOpen(true)}
                    close={() => setMoreMenuOpen(false)}
                  >
                    {t.editor.triangleRounds.menu}
                  </MenuItem>
                ) : (
                  <MenuItem
                    disabled={side === 'right'}
                    hint={side === 'right' ? t.editor.resize.rightSide : t.editor.resize.menuHint}
                    onClick={() => setResizeOpen(true)}
                    close={() => setMoreMenuOpen(false)}
                  >
                    {t.editor.resize.menu}
                  </MenuItem>
                )}
                <MenuItem
                  hint={t.editor.shopping.menuHint}
                  onClick={() => setShoppingOpen(true)}
                  close={() => setMoreMenuOpen(false)}
                >
                  {t.editor.shopping.menu}
                </MenuItem>
                <MenuItem
                  hint={t.editor.beadType.menuHint}
                  onClick={() => setBeadTypeOpen(true)}
                  close={() => setMoreMenuOpen(false)}
                >
                  {t.editor.beadType.menu}
                </MenuItem>
                <MenuItem
                  disabled={paintedCells === 0}
                  hint={t.editor.clearPatternHint}
                  onClick={clearAllCells}
                  close={() => setMoreMenuOpen(false)}
                >
                  {t.editor.clearPattern}
                </MenuItem>
                <MenuItem
                  hint={t.editor.saveTemplate.menuHint}
                  onClick={() => setTemplateName(name)}
                  close={() => setMoreMenuOpen(false)}
                >
                  {t.editor.saveTemplate.menu}
                </MenuItem>
                <MenuItem danger onClick={handleDeletePattern} close={() => setMoreMenuOpen(false)}>
                  {t.editor.deletePattern}
                </MenuItem>

                <div className="my-1 h-px bg-border" />
                <MenuHeading>{t.feedback.title}</MenuHeading>
                <FeedbackMenuItems
                  context={{ technique, cols, rows }}
                  onDone={() => setMoreMenuOpen(false)}
                />
              </div>
            </>
          )}
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <aside className="hidden w-16 shrink-0 flex-col items-center gap-2 border-r border-border py-4 md:flex">
          <ToolPanel orientation="vertical" />
        </aside>

        <div className="flex min-w-0 flex-1 flex-col p-4">
          {/* En el celular también: pellizcar es rápido pero impreciso. */}
          <div className="mb-2 md:mb-3">
            <ZoomBar />
          </div>
          {!esTriangulo && <PairBar />}
          <div className="min-h-0 flex-1 overflow-hidden rounded-2xl border border-border bg-surface">
            <CanvasGrid />
          </div>
        </div>

        {/* Una pestaña a la vez, con toda la altura para ella — ver EditorPanelTabs. */}
        <aside className="hidden w-80 shrink-0 flex-col border-l border-border md:flex">
          <EditorPanelTabs shapeCapable={shapeCapable} fringeCapable={fringeCapable} loopCapable={loopCapable} />
        </aside>
      </div>

      <nav className="flex flex-col gap-2 border-t border-border bg-surface px-2 pt-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))] md:hidden">
        <ColorStrip onOpenPalette={() => setColorDrawerOpen(true)} />
        <div className="flex items-center gap-2 px-1">
          <div className="no-scrollbar flex min-w-0 flex-1 items-center gap-2 overflow-x-auto">
            {shapeCapable && (
              <button
                onClick={() => setShapeDrawerOpen(true)}
                className="flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full bg-surface-2 px-3 py-1.5 text-xs font-semibold"
              >
                <ShapeIcon />
                {t.editor.shape.shortTitle}
              </button>
            )}
            {fringeCapable && (
              <button
                onClick={() => setFringeDrawerOpen(true)}
                className="flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full bg-surface-2 px-3 py-1.5 text-xs font-semibold"
              >
                <FringeIcon />
                {t.editor.fringe.shortTitle}
              </button>
            )}
            {loopCapable && (
              <button
                onClick={() => setLoopDrawerOpen(true)}
                className="flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full bg-surface-2 px-3 py-1.5 text-xs font-semibold"
              >
                <LoopIcon />
                {t.editor.loop.shortTitle}
              </button>
            )}
          </div>
          {!esTriangulo && (
            <button
              onClick={() => navigate(`/editor/${id}/weave`)}
              className="shrink-0 whitespace-nowrap rounded-full bg-accent-500 px-3 py-1.5 text-xs font-semibold text-accent-ink"
            >
              {t.editor.weaveMode}
            </button>
          )}
        </div>
        <div className="flex items-center gap-1">
          {/* `w-max mx-auto` rather than `justify-center`: a centred row that
              overflows can't be scrolled back to its first tool. */}
          <div className="no-scrollbar min-w-0 flex-1 overflow-x-auto">
            <div className="mx-auto w-max">
              <ToolPanel orientation="horizontal" showHistory={false} />
            </div>
          </div>
          {/* Undo / redo stay within reach instead of at the far end of the scrolling row. */}
          <div className="flex shrink-0 items-center gap-1 border-l border-border pl-1">
            <HistoryButtons />
          </div>
        </div>
      </nav>

      {colorDrawerOpen && (
        <BottomSheet title={t.editor.colorsTitle} onClose={() => setColorDrawerOpen(false)}>
          <ColorPanel onColorChosen={() => setColorDrawerOpen(false)} />
        </BottomSheet>
      )}

      {fringeDrawerOpen && (
        <BottomSheet
          title={
            <>
              <FringeIcon />
              {t.editor.fringe.title}
            </>
          }
          onClose={() => setFringeDrawerOpen(false)}
        >
          <FringePanel embedded />
        </BottomSheet>
      )}

      {shapeDrawerOpen && (
        <BottomSheet
          title={
            <>
              <ShapeIcon />
              {t.editor.shape.title}
            </>
          }
          onClose={() => setShapeDrawerOpen(false)}
        >
          <ShapePanel embedded />
        </BottomSheet>
      )}

      {loopDrawerOpen && (
        <BottomSheet
          title={
            <>
              <LoopIcon />
              {t.editor.loop.title}
            </>
          }
          onClose={() => setLoopDrawerOpen(false)}
        >
          <LoopPanel embedded />
        </BottomSheet>
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
              <li className="flex items-center justify-between gap-4">
                <span className="text-text-muted">{t.editor.fitToScreen}</span>
                <kbd className="rounded border border-border bg-surface-2 px-2 py-0.5 font-mono text-xs">0</kbd>
              </li>
            </ul>
          </div>
        </div>
      )}

      {templateName !== null && templateSource && (
        <TemplateCardDialog
          title={t.editor.saveTemplate.title}
          name={templateName}
          meta={{ kind: templateSource.kind, difficulty: templateSource.difficulty, photo: templateSource.photo }}
          suggestedDifficulty={suggestDifficulty(templateSource)}
          onNameChange={setTemplateName}
          notice={templateClash ? t.editor.saveTemplate.exists(templateClash.name) : undefined}
          confirmLabel={templateClash ? t.editor.saveTemplate.replace : t.editor.saveTemplate.save}
          onConfirm={confirmSaveTemplate}
          onCancel={() => setTemplateName(null)}
        />
      )}
      {templateSaved && (
        <UndoToast
          key={templateSaved.message}
          message={templateSaved.message}
          onUndo={() => {
            templateSaved.undo()
            setTemplateSaved(null)
          }}
          onExpire={() => setTemplateSaved(null)}
        />
      )}

      {/* Encima de todo, también de la hoja de colores del celular: se abre desde la bandeja y desde el lienzo. */}
      <ColorChooser />
      <PhotoPaletteDialog />
      {/* Seleccionar las mostacillas de un color cierra la hoja del celular: la selección tiene que verse. */}
      <ColorCard onSelected={() => setColorDrawerOpen(false)} />

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

      {weaveResetPending !== null && (
        <UndoToast message={t.editor.shape.weaveResetNotice} onUndo={undoWeaveReset} onExpire={clearWeaveResetPending} />
      )}
      {exportError && (
        <Toast message={exportError} actionLabel={t.common.close} onAction={() => setExportError(null)} />
      )}
      {resizeOpen && <ResizeDialog onClose={() => setResizeOpen(false)} />}
      {roundsOpen && <TriangleRoundsDialog onClose={() => setRoundsOpen(false)} />}
      {beadTypeOpen && <BeadTypeDialog onClose={() => setBeadTypeOpen(false)} />}
      {shoppingOpen && <ShoppingListDialog onClose={() => setShoppingOpen(false)} />}
      {exportDialogOpen && <ExportPdfDialog onCancel={() => setExportDialogOpen(false)} onConfirm={handleExport} />}
    </div>
  )
}

/** A section title inside the "⋯" menu — the grouping is what keeps a long menu readable. */
function MenuHeading({ children }: { children: React.ReactNode }) {
  return <p className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-text-muted">{children}</p>
}

function MenuItem({
  children,
  hint,
  onClick,
  close,
  disabled,
  danger,
}: {
  children: React.ReactNode
  /** A line of explanation under the label, for the actions that change the pattern. */
  hint?: string
  onClick: () => void
  close: () => void
  disabled?: boolean
  danger?: boolean
}) {
  return (
    <button
      disabled={disabled}
      onClick={() => {
        close()
        onClick()
      }}
      className={`w-full rounded-xl px-3 py-2.5 text-left text-sm font-semibold hover:bg-surface-2 disabled:opacity-40
        ${danger ? 'text-red-500' : ''}`}
    >
      {children}
      {hint && <span className="mt-0.5 block text-[11px] font-normal text-text-muted">{hint}</span>}
    </button>
  )
}
