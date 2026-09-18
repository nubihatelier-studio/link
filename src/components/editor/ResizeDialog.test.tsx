import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useEditorStore } from '@/store/editorStore'
import { createEmptyFringe } from '@/engine/fringe'
import { createRectangleRowShape } from '@/engine/shape'
import { t } from '@/i18n/es'
import { ResizeDialog } from './ResizeDialog'

beforeEach(() => {
  useEditorStore.setState({
    patternId: null,
    technique: 'loom',
    cols: 4,
    rows: 3,
    beadTypeId: 'miyuki-delica-11',
    cells: { '0,0': '#111111', '0,3': '#222222' },
    fringe: createEmptyFringe(4),
    rowShape: createRectangleRowShape(4, 3),
    staggerPhase: 0,
    pair: undefined,
    loop: undefined,
    side: 'left',
    history: [],
    future: [],
  })
})

const editor = () => useEditorStore.getState()

describe('Cambiar tamaño', () => {
  it('sin cambios no deja aplicar', () => {
    render(<ResizeDialog onClose={() => {}} />)
    expect(screen.getByRole('button', { name: t.editor.resize.apply })).toBeDisabled()
    expect(screen.getByText(t.editor.resize.noLoss)).toBeInTheDocument()
  })

  it('avisa cuántas mostacillas pintadas se pierden antes de aplicar', async () => {
    const user = userEvent.setup()
    render(<ResizeDialog onClose={() => {}} />)
    const columnas = screen.getByRole('button', { name: `${t.configurator.columns} −` })
    await user.click(columnas)
    await user.click(columnas)
    // 4 → 2 columnas, quitando por ambos lados: se va una de cada punta.
    expect(screen.getByText(t.editor.resize.lost(2))).toBeInTheDocument()
    expect(editor().cols).toBe(4) // todavía no cambió nada
  })

  it('aplica donde se eligió y se cierra', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(<ResizeDialog onClose={onClose} />)
    await user.click(screen.getByRole('button', { name: `${t.configurator.columns} +` }))
    await user.click(screen.getByRole('button', { name: `${t.configurator.columns} +` }))
    const lados = within(screen.getByRole('group', { name: t.editor.resize.colSideLabel }))
    await user.click(lados.getByRole('button', { name: t.editor.resize.left }))
    await user.click(screen.getByRole('button', { name: t.editor.resize.apply }))
    expect(editor().cols).toBe(6)
    expect(editor().cells).toEqual({ '0,2': '#111111', '0,5': '#222222' })
    expect(onClose).toHaveBeenCalled()
  })

  it('en brick 2-drop las filas avanzan de a una pila', async () => {
    const user = userEvent.setup()
    useEditorStore.setState({ technique: 'brick', rows: 4, rowShape: createRectangleRowShape(4, 4), staggerPhase: { phase: 0, drop: 2 } })
    render(<ResizeDialog onClose={() => {}} />)
    await user.click(screen.getByRole('button', { name: `${t.configurator.rows} +` }))
    await user.click(screen.getByRole('button', { name: t.editor.resize.apply }))
    expect(editor().rows).toBe(6)
  })
})
