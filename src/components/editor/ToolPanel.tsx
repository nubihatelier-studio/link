import type { ComponentType } from 'react'
import {
  Pencil,
  Minus,
  PaintBucket,
  Eraser,
  Pipette,
  SquareDashedMousePointer,
  Copy,
  FlipHorizontal2,
  FlipVertical2,
  Trash2,
  Undo2,
  Redo2,
} from 'lucide-react'
import { useEditorStore, type Tool } from '@/store/editorStore'
import { EraseAreaIcon } from '@/components/icons/EraseAreaIcon'
import { PasteIcon } from '@/components/icons/PasteIcon'
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
    reflectSelection,
  } = useEditorStore()

  /**
   * Un solo par de botones para las dos formas de reflejar que tiene el
   * editor, según lo que se esté haciendo: mientras se pega, voltean lo que
   * está por pegarse; el resto del tiempo reflejan la selección ahí mismo.
   * Antes eran tres pares con el mismo ícono repartidos por la pantalla (el
   * "pincel espejo" de esta barra, el volteo al pegar, y un "Reflejar"
   * escondido en el panel de Paleta), y no se entendía cuál hacía qué.
   */
  const flipping = pasteArmed
  const mirrorButtons = (['horizontal', 'vertical'] as const).map((axis) => {
    const isH = axis === 'horizontal'
    return {
      axis,
      Icon: isH ? FlipHorizontal2 : FlipVertical2,
      label: flipping
        ? isH ? t.editor.pasteFlipH : t.editor.pasteFlipV
        : isH ? t.editor.mirror.horizontal : t.editor.mirror.vertical,
      active: flipping && (isH ? pasteFlipH : pasteFlipV),
      disabled: !flipping && !selection,
      onClick: () => (flipping ? (isH ? toggleFlipH() : toggleFlipV()) : reflectSelection(axis)),
    }
  })

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
        <PasteIcon size={18} />
      </IconButton>
      {mirrorButtons.map(({ axis, Icon, label, active, disabled, onClick }) => (
        <IconButton key={axis} label={label} active={active} disabled={disabled} onClick={onClick}>
          <Icon size={18} />
        </IconButton>
      ))}
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
