import type { ComponentType } from 'react'
import {
  Pencil,
  Minus,
  PaintBucket,
  Eraser,
  Square,
  Pipette,
  BoxSelect,
  Copy,
  ClipboardPaste,
  FlipHorizontal2,
  FlipVertical2,
  Trash2,
  Undo2,
  Redo2,
} from 'lucide-react'
import { useEditorStore, type Tool } from '@/store/editorStore'
import { IconButton } from '@/components/shared/IconButton'
import { t } from '@/i18n/es'

// Icon set ported from the Lovable build (Peyote Weaver Pro) so both apps
// read the same across platforms. Using a real icon library instead of
// emoji matters most for the native (Capacitor) build: emoji glyphs render
// inconsistently across iOS/Android/OS versions, while lucide-react draws
// the same stroked SVG everywhere.
const TOOLS: { id: Tool; icon: ComponentType<{ size?: number }>; labelKey: keyof typeof t.editor.tools }[] = [
  { id: 'pencil', icon: Pencil, labelKey: 'pencil' },
  { id: 'line', icon: Minus, labelKey: 'line' },
  { id: 'fill', icon: PaintBucket, labelKey: 'fill' },
  { id: 'eraser', icon: Eraser, labelKey: 'eraser' },
  { id: 'rectErase', icon: Square, labelKey: 'rectErase' },
  { id: 'eyedropper', icon: Pipette, labelKey: 'eyedropper' },
  { id: 'select', icon: BoxSelect, labelKey: 'select' },
]

interface ToolPanelProps {
  orientation?: 'vertical' | 'horizontal'
}

export function ToolPanel({ orientation = 'vertical' }: ToolPanelProps) {
  const {
    tool,
    setTool,
    undo,
    redo,
    history,
    future,
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

      <IconButton label={t.editor.tools.paste} active={pasteArmed} disabled={!clipboard} onClick={armPaste}>
        <ClipboardPaste size={18} />
      </IconButton>
      {pasteArmed && (
        <>
          <IconButton label="Voltear horizontal" active={pasteFlipH} onClick={toggleFlipH}>
            <FlipHorizontal2 size={18} />
          </IconButton>
          <IconButton label="Voltear vertical" active={pasteFlipV} onClick={toggleFlipV}>
            <FlipVertical2 size={18} />
          </IconButton>
        </>
      )}

      <div className={orientation === 'vertical' ? 'my-2 h-px w-full bg-border' : 'mx-2 h-8 w-px bg-border'} />

      <IconButton label={t.editor.tools.copy} disabled={!selection} onClick={copySelection}>
        <Copy size={18} />
      </IconButton>
      {tool === 'select' && (
        <IconButton label="Borrar selección" disabled={!selection} onClick={eraseSelection}>
          <Trash2 size={18} />
        </IconButton>
      )}

      <div className={orientation === 'vertical' ? 'my-2 h-px w-full bg-border' : 'mx-2 h-8 w-px bg-border'} />

      <IconButton label={t.editor.tools.undo} disabled={history.length === 0} onClick={undo}>
        <Undo2 size={18} />
      </IconButton>
      <IconButton label={t.editor.tools.redo} disabled={future.length === 0} onClick={redo}>
        <Redo2 size={18} />
      </IconButton>
    </div>
  )
}
