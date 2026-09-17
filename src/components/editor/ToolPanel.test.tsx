import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import { useEditorStore } from '@/store/editorStore'
import { createEmptyFringe } from '@/engine/fringe'
import { createRectangleRowShape } from '@/engine/shape'
import { t } from '@/i18n/es'
import { ToolPanel } from './ToolPanel'

const A = '#111111'
const B = '#222222'

beforeEach(() => {
  useEditorStore.setState({
    patternId: null,
    technique: 'loom',
    cols: 4,
    rows: 4,
    cells: { '0,0': A, '0,1': B },
    fringe: createEmptyFringe(4),
    rowShape: createRectangleRowShape(4, 4),
    selection: null,
    colorSelectionMask: null,
    clipboard: null,
    pasteArmed: false,
    pasteFlipH: false,
    pasteFlipV: false,
    tool: 'select',
    history: [],
    future: [],
    side: 'left',
  })
})
const editor = () => useEditorStore.getState()

describe('ToolPanel — los dos botones de reflejar', () => {
  it('sin selección están apagados', () => {
    render(<ToolPanel />)
    expect(screen.getByRole('button', { name: t.editor.mirror.horizontal })).toBeDisabled()
    expect(screen.getByRole('button', { name: t.editor.mirror.vertical })).toBeDisabled()
  })

  it('toma una copia reflejada y la deja lista para pegar, sin tocar lo marcado', async () => {
    const user = userEvent.setup()
    useEditorStore.setState({ selection: { r0: 0, c0: 0, r1: 0, c1: 1 } })
    render(<ToolPanel />)
    await user.click(screen.getByRole('button', { name: t.editor.mirror.horizontal }))

    // Lo marcado queda igual: el reflejo recién existe cuando se suelta.
    expect(editor().cells['0,0']).toBe(A)
    expect(editor().cells['0,1']).toBe(B)
    expect(editor().clipboard).toEqual({ width: 2, height: 1, cells: { '0,0': A, '0,1': B } })
    expect(editor().pasteArmed).toBe(true)
    expect(editor().pasteFlipH).toBe(true)
    expect(editor().pasteFlipV).toBe(false)
  })

  it('al soltarla, el reflejo queda pegado donde se dejó', async () => {
    const user = userEvent.setup()
    useEditorStore.setState({ selection: { r0: 0, c0: 0, r1: 0, c1: 1 } })
    render(<ToolPanel />)
    await user.click(screen.getByRole('button', { name: t.editor.mirror.horizontal }))
    editor().pasteClipboardAt(2, 0, { flipH: editor().pasteFlipH, flipV: editor().pasteFlipV })
    expect(editor().cells['2,0']).toBe(B) // invertido respecto del original
    expect(editor().cells['2,1']).toBe(A)
    expect(editor().cells['0,0']).toBe(A) // el original, intacto
  })

  it('el reflejo hacia abajo invierte las filas', async () => {
    const user = userEvent.setup()
    useEditorStore.setState({ cells: { '0,0': A, '1,0': B }, selection: { r0: 0, c0: 0, r1: 1, c1: 0 } })
    render(<ToolPanel />)
    await user.click(screen.getByRole('button', { name: t.editor.mirror.vertical }))
    expect(editor().pasteFlipV).toBe(true)
    editor().pasteClipboardAt(2, 0, { flipH: false, flipV: true })
    expect(editor().cells['2,0']).toBe(B)
    expect(editor().cells['3,0']).toBe(A)
  })

  it('mientras se pega, los mismos botones cambian el eje del reflejo', async () => {
    const user = userEvent.setup()
    useEditorStore.setState({
      clipboard: { width: 2, height: 1, cells: { '0,0': A, '0,1': B } },
      pasteArmed: true,
      selection: null,
    })
    render(<ToolPanel />)
    expect(screen.queryByRole('button', { name: t.editor.mirror.horizontal })).toBeNull()
    await user.click(screen.getByRole('button', { name: t.editor.pasteFlipH }))
    expect(editor().pasteFlipH).toBe(true)
    await user.click(screen.getByRole('button', { name: t.editor.pasteFlipV }))
    expect(editor().pasteFlipV).toBe(true)
    expect(editor().cells['0,0']).toBe(A) // nada se pinta hasta soltar
  })
})

describe('ToolPanel — clonar lo marcado', () => {
  it('sin selección el botón está apagado', () => {
    render(<ToolPanel />)
    expect(screen.getByRole('button', { name: t.editor.clone })).toBeDisabled()
  })

  it('repite la selección al lado, tantas veces como se pida', async () => {
    const user = userEvent.setup()
    // 8 columnas: las tres copias caben enteras dentro de la grilla.
    useEditorStore.setState({ cols: 8, rowShape: createRectangleRowShape(8, 4), fringe: createEmptyFringe(8), selection: { r0: 0, c0: 0, r1: 0, c1: 1 } })
    render(<ToolPanel />)
    await user.click(screen.getByRole('button', { name: t.editor.clone }))
    await user.click(screen.getByRole('button', { name: t.editor.cloneHorizontal }))
    await user.click(screen.getByRole('button', { name: '×3' }))

    expect(editor().cells['0,2']).toBe(A)
    expect(editor().cells['0,3']).toBe(B)
    expect(editor().cells['0,4']).toBe(A)
    expect(editor().cells['0,5']).toBe(B)
    // El panelito se cierra solo al clonar.
    expect(screen.queryByRole('button', { name: '×3' })).toBeNull()
  })

  it('también clona hacia abajo, y se puede deshacer', async () => {
    const user = userEvent.setup()
    useEditorStore.setState({ cells: { '0,0': A }, selection: { r0: 0, c0: 0, r1: 0, c1: 0 } })
    render(<ToolPanel />)
    await user.click(screen.getByRole('button', { name: t.editor.clone }))
    await user.click(screen.getByRole('button', { name: t.editor.cloneVertical }))
    await user.click(screen.getByRole('button', { name: '×2' }))
    expect(editor().cells['1,0']).toBe(A)
    editor().undo()
    expect(editor().cells['1,0']).toBeUndefined()
  })
})

describe('ToolPanel — mover lo marcado', () => {
  it('sin selección el botón está apagado', () => {
    render(<ToolPanel />)
    expect(screen.getByRole('button', { name: t.editor.move })).toBeDisabled()
  })

  it('levanta lo marcado sin borrarlo todavía, y al soltarlo lo deja en el lugar nuevo', async () => {
    const user = userEvent.setup()
    useEditorStore.setState({ selection: { r0: 0, c0: 0, r1: 0, c1: 1 } })
    render(<ToolPanel />)
    await user.click(screen.getByRole('button', { name: t.editor.move }))

    // Todavía no se movió nada: se ve dónde va a quedar antes de soltarlo.
    expect(editor().cells['0,0']).toBe(A)
    expect(editor().pasteArmed).toBe(true)
    expect(editor().moveSource).toEqual({ r0: 0, c0: 0, r1: 0, c1: 1 })

    editor().pasteClipboardAt(2, 0)
    expect(editor().cells['2,0']).toBe(A)
    expect(editor().cells['2,1']).toBe(B)
    expect(editor().cells['0,0']).toBeUndefined() // el lugar viejo queda vacío
    expect(editor().cells['0,1']).toBeUndefined()
    expect(editor().moveSource).toBeNull()
  })

  it('cancelar no cambia nada', async () => {
    const user = userEvent.setup()
    useEditorStore.setState({ selection: { r0: 0, c0: 0, r1: 0, c1: 1 } })
    render(<ToolPanel />)
    await user.click(screen.getByRole('button', { name: t.editor.move }))
    editor().disarmPaste()
    expect(editor().cells['0,0']).toBe(A)
    expect(editor().moveSource).toBeNull()
  })

  it('moverlo encima de sí mismo no se come lo que acaba de dejar', async () => {
    const user = userEvent.setup()
    useEditorStore.setState({ selection: { r0: 0, c0: 0, r1: 0, c1: 1 } })
    render(<ToolPanel />)
    await user.click(screen.getByRole('button', { name: t.editor.move }))
    editor().pasteClipboardAt(0, 1) // corrido una columna: se superpone con el original
    expect(editor().cells['0,1']).toBe(A)
    expect(editor().cells['0,2']).toBe(B)
    expect(editor().cells['0,0']).toBeUndefined()
  })

  it('lo que no cabe en la figura no se borra del lugar viejo', async () => {
    const user = userEvent.setup()
    // Una fila de solo 2 mostacillas de ancho: la segunda columna del bloque cae fuera.
    useEditorStore.setState({
      rowShape: [
        { offset: 0, length: 4 },
        { offset: 0, length: 4 },
        { offset: 0, length: 1 },
        { offset: 0, length: 1 },
      ],
      cells: { '0,0': A, '0,1': B },
      selection: { r0: 0, c0: 0, r1: 0, c1: 1 },
    })
    render(<ToolPanel />)
    await user.click(screen.getByRole('button', { name: t.editor.move }))
    editor().pasteClipboardAt(2, 0)

    expect(editor().cells['2,0']).toBe(A) // la que cabía se movió
    expect(editor().cells['0,0']).toBeUndefined()
    expect(editor().cells['0,1']).toBe(B) // la que no cabía se queda donde estaba
  })

  it('se puede deshacer de una vez', async () => {
    const user = userEvent.setup()
    useEditorStore.setState({ selection: { r0: 0, c0: 0, r1: 0, c1: 1 } })
    render(<ToolPanel />)
    await user.click(screen.getByRole('button', { name: t.editor.move }))
    editor().pasteClipboardAt(2, 0)
    editor().undo()
    expect(editor().cells['0,0']).toBe(A)
    expect(editor().cells['2,0']).toBeUndefined()
  })
})

describe('ToolPanel — arrepentirse de "Seleccionar"', () => {
  it('volver a tocarlo vuelve al lápiz y borra la marca', async () => {
    const user = userEvent.setup()
    useEditorStore.setState({ tool: 'pencil', selection: null })
    render(<ToolPanel />)

    await user.click(screen.getByRole('button', { name: t.editor.tools.select }))
    expect(editor().tool).toBe('select')
    useEditorStore.setState({ selection: { r0: 0, c0: 0, r1: 1, c1: 1 } })

    // Ya activo, el botón dice cómo salir.
    await user.click(screen.getByRole('button', { name: t.editor.tools.selectOff }))
    expect(editor().tool).toBe('pencil')
    expect(editor().selection).toBeNull()
  })

  it('"Borrar área" también se cancela tocándolo de nuevo', async () => {
    const user = userEvent.setup()
    useEditorStore.setState({ tool: 'pencil', selection: null })
    render(<ToolPanel />)
    await user.click(screen.getByRole('button', { name: t.editor.tools.rectErase }))
    expect(editor().tool).toBe('rectErase')
    await user.click(screen.getByRole('button', { name: t.editor.tools.rectEraseOff }))
    expect(editor().tool).toBe('pencil')
  })

  it('las demás herramientas no se apagan solas: el lápiz sigue siendo el lápiz', async () => {
    const user = userEvent.setup()
    useEditorStore.setState({ tool: 'pencil' })
    render(<ToolPanel />)
    await user.click(screen.getByRole('button', { name: t.editor.tools.pencil }))
    expect(editor().tool).toBe('pencil')
  })
})
