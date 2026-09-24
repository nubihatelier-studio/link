import type { ComponentType } from 'react'
import {
  Pencil,
  Minus,
  PaintBucket,
  Eraser,
  Pipette,
  Hand,
  SquareDashedMousePointer,
  Copy,
  FlipHorizontal2,
  FlipVertical2,
  Move,
  Trash2,
  Undo2,
  Redo2,
} from 'lucide-react'
import { useEditorStore, type Tool } from '@/store/editorStore'
import { EraseAreaIcon } from '@/components/icons/EraseAreaIcon'
import { PasteIcon } from '@/components/icons/PasteIcon'
import { CloneButton } from './CloneButton'
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

/** Las que sí tienen sentido en el aro triangular — ver el comentario en `ToolPanel`. */
const TRIANGLE_TOOLS: Tool[] = ['pencil', 'eraser', 'eyedropper']

interface ToolPanelProps {
  orientation?: 'vertical' | 'horizontal'
  /** Undo / redo at the end of the panel. The phone toolbar pins them outside its scrolling row instead. */
  showHistory?: boolean
}

export function ToolPanel({ orientation = 'vertical', showHistory = true }: ToolPanelProps) {
  /**
   * El aro triangular no tiene filas ni columnas, así que no hay rectángulo
   * que marcar, ni copiar, pegar, clonar, reflejar, borrar área, ni línea
   * recta o balde, que necesitan vecinos en la grilla. Se esconden en vez de
   * dejarlas puestas y rotas: quedan el lápiz, la goma, el cuentagotas y la
   * mano. Ver `engine/trianglePeyote.ts`.
   */
  const esTriangulo = useEditorStore((s) => s.technique === 'triangle')
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
    mirrorSelectionToPaste,
    armMoveSelection,
  } = useEditorStore()

  /**
   * Un solo par de botones para reflejar, que hace lo mismo en dos momentos:
   * con algo marcado, toma una copia reflejada de la selección y la deja
   * lista para pegar (lo marcado no se toca, el reflejo se ve mientras se
   * mueve y recién se fija al soltarlo); mientras se pega, cambian el eje
   * del reflejo antes de soltar.
   */
  /**
   * Marcar y borrar área se cancelan tocándolas de nuevo: vuelven al lápiz y
   * con eso se va la selección (ver `setTool`). Antes, una vez elegido
   * "Seleccionar" no había cómo arrepentirse — la marca quedaba ahí y la
   * única salida era irse a otra herramienta.
   *
   * Las que pintan o borran mostacilla por mostacilla NO se apagan así: si el
   * borrador volviera al lápiz de un toque de más, el toque siguiente pintaría
   * en vez de borrar, y eso sí cuesta caro.
   */
  function toggleTool(id: Tool) {
    // La mano tampoco pinta, así que también se puede apagar de un toque.
    const cancelable = id === 'select' || id === 'rectErase' || id === 'pan'
    setTool(cancelable && tool === id ? 'pencil' : id)
  }

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
      onClick: () => (flipping ? (isH ? toggleFlipH() : toggleFlipV()) : mirrorSelectionToPaste(axis)),
    }
  })

  const tools = esTriangulo ? TOOLS.filter((tl) => TRIANGLE_TOOLS.includes(tl.id)) : TOOLS

  return (
    <div className={`flex ${orientation === 'vertical' ? 'flex-col gap-2' : 'flex-row items-center gap-2'}`}>
      {tools.map((tl) => {
        const Icon = tl.icon
        return (
          <IconButton
            key={tl.id}
            label={tool === tl.id && tl.id === 'rectErase' ? t.editor.tools.rectEraseOff : t.editor.tools[tl.labelKey]}
            active={tool === tl.id}
            onClick={() => toggleTool(tl.id)}
          >
            <Icon size={18} />
          </IconButton>
        )
      })}

      {/* La mano no pinta: arrastra el gráfico con un dedo, para no tener que
          soltar la aguja y usar dos. Va junto a las que pintan porque se
          alterna con ellas todo el rato. */}
      <IconButton
        label={tool === 'pan' ? t.editor.tools.panOff : t.editor.tools.pan}
        active={tool === 'pan'}
        onClick={() => toggleTool('pan')}
      >
        <Hand size={18} />
      </IconButton>

      {!esTriangulo && (
        <div className={orientation === 'vertical' ? 'my-2 h-px w-full bg-border' : 'mx-2 h-8 w-px bg-border'} />
      )}

      {!esTriangulo && (
        <>
      {/* Marcar, copiar y pegar son los tres pasos de una misma tarea: van
          juntos en su propio grupo, en ese orden, para que se lean como uno.
          Voltear y borrar la selección aparecen dentro del grupo cuando
          tienen sentido, no fuera de él. */}
      <IconButton
        label={tool === 'select' ? t.editor.tools.selectOff : t.editor.tools.select}
        active={tool === 'select'}
        onClick={() => toggleTool('select')}
      >
        <SquareDashedMousePointer size={18} />
      </IconButton>
      <IconButton label={t.editor.tools.copy} disabled={!selection} onClick={copySelection}>
        <Copy size={18} />
      </IconButton>
      <IconButton label={t.editor.tools.paste} active={pasteArmed} disabled={!clipboard} onClick={armPaste}>
        <PasteIcon size={18} />
      </IconButton>
      <IconButton
        label={t.editor.move}
        disabled={!selection || pasteArmed}
        onClick={armMoveSelection}
      >
        <Move size={18} />
      </IconButton>
      <CloneButton orientation={orientation} />
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
        </>
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
