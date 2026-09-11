import type { ComponentType } from 'react'
import {
  Pencil,
  Minus,
  PaintBucket,
  Eraser,
  Pipette,
  SquareDashedMousePointer,
  Copy,
  ClipboardPaste,
  FlipHorizontal2,
  FlipVertical2,
  Trash2,
  Undo2,
  Redo2,
} from 'lucide-react'
import { useEditorStore, type Tool } from '@/store/editorStore'
import { EraseAreaIcon } from '@/components/icons/EraseAreaIcon'
import { IconButton } from '@/components/shared/IconButton'
import { t } from '@/i18n/es'

// Icon set ported from the Lovable build (Peyote Weaver Pro) so both apps
// read the same across platforms. Using a real icon library instead of
// emoji matters most for the native (Capacitor) build: emoji glyphs render
// inconsistently across iOS/Android/OS versions, while lucide-react draws
// the same stroked SVG everywhere.
/** What paints: everything that puts color on (or takes it off) a bead, one tap at a time. */
const TOOLS: { id: Tool; icon: ComponentType<{ size?: number }>; labelKey: keyof typeof t.editor.tools }[] = [
  { id: 'pencil', icon: Pencil, labelKey: 'pencil' },
  { id: 'line', icon: Minus, labelKey: 'line' },
  { id: 'fill', icon: PaintBucket, labelKey: 'fill' },
  { id: 'eraser', icon: Eraser, labelKey: 'eraser' },
  { id: 'rectErase', icon: EraseAreaIcon, labelKey: 'rectErase' },
  { id: 'eyedropper', icon: Pipette, labelKey: 'eyedropper' },
]

interface ToolPanelProps {
  orientation?: 'vertical' | 'horizontal'
  /** Undo / redo at the end of the panel. The phone toolbar pins them outside its scrolling row instead. */
  showHistory?: boolean
}

export function ToolPanel({ orientation = 'vertical', showHistory = true }: ToolPanelProps) {
  const {
    tool,
    setTool,
    selection,
    clipboard,
    copySelection,
    armPaste,
    pasteArmed,
    pasteFlipH,
    pasteFlipV,
    toggleFlipH,
    toggleFlipV,
    eraseSelection,
    mirrorMode,
    setMirrorMode,
  } = useEditorStore()

  return (
    <div className={`flex ${orientation === 'vertical' ? 'flex-col gap-2' : 'flex-row items-center gap-2'}`}>
      {TOOLS.map((tl) => {
        const Icon = tl.icon
        return (
          <IconButton
            key={tl.id}
            label={t.editor.tools[tl.labelKey]}
            active={tool === tl.id}
            onClick={() => setTool(tl.id)}
          >
            <Icon size={18} />
          </IconButton>
        )
      })}

      <div className={orientation === 'vertical' ? 'my-2 h-px w-full bg-border' : 'mx-2 h-8 w-px bg-border'} />

      <IconButton
        label={t.editor.mirror.horizontal}
        active={mirrorMode === 'horizontal'}
        onClick={() => setMirrorMode('horizontal')}
      >
        <FlipHorizontal2 size={18} />
      </IconButton>
      <IconButton
        label={t.editor.mirror.vertical}
        active={mirrorMode === 'vertical'}
        onClick={() => setMirrorMode('vertical')}
      >
        <FlipVertical2 size={18} />
      </IconButton>

      <div className={orientation === 'vertical' ? 'my-2 h-px w-full bg-border' : 'mx-2 h-8 w-px bg-border'} />

      {/* Marcar, copiar y pegar son los tres pasos de una misma tarea: van
          juntos en su propio grupo, en ese orden, para que se lean como uno.
          Voltear y borrar la selección aparecen dentro del grupo cuando
          tienen sentido, no fuera de él. */}
      <IconButton label={t.editor.tools.select} active={tool === 'select'} onClick={() => setTool('select')}>
        <SquareDashedMousePointer size={18} />
      </IconButton>
      <IconButton label={t.editor.tools.copy} disabled={!selection} onClick={copySelection}>
        <Copy size={18} />
      </IconButton>
      <IconButton label={t.editor.tools.paste} active={pasteArmed} disabled={!clipboard} onClick={armPaste}>
        <ClipboardPaste size={18} />
      </IconButton>
      {pasteArmed && (
        <>
          <IconButton label={t.editor.pasteFlipH} active={pasteFlipH} onClick={toggleFlipH}>
            <FlipHorizontal2 size={18} />
          </IconButton>
          <IconButton label={t.editor.pasteFlipV} active={pasteFlipV} onClick={toggleFlipV}>
            <FlipVertical2 size={18} />
          </IconButton>
        </>
      )}
      {tool === 'select' && (
        <IconButton label={t.editor.eraseSelection} disabled={!selection} onClick={eraseSelection}>
          <Trash2 size={18} />
        </IconButton>
      )}

      {showHistory && (
        <>
          <div className={orientation === 'vertical' ? 'my-2 h-px w-full bg-border' : 'mx-2 h-8 w-px bg-border'} />
          <HistoryButtons />
        </>
      )}
    </div>
  )
}

/** Undo and redo — the two buttons reached for most, so the phone toolbar keeps them always in view. */
export function HistoryButtons() {
  const { undo, redo, history, future } = useEditorStore()
  return (
    <>
      <IconButton label={t.editor.tools.undo} disabled={history.length === 0} onClick={undo}>
        <Undo2 size={18} />
      </IconButton>
      <IconButton label={t.editor.tools.redo} disabled={future.length === 0} onClick={redo}>
        <Redo2 size={18} />
      </IconButton>
    </>
  )
}
