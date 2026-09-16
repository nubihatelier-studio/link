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
