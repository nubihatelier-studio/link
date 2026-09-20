import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useEditorStore } from '@/store/editorStore'
import { usePatternsStore } from '@/store/patternsStore'
import { createEmptyFringe } from '@/engine/fringe'
import { createRectangleRowShape } from '@/engine/shape'
import { physicalSizeMm } from '@/engine/geometry'
import { formatSizeMm } from '@/engine/units'
import { getBeadType } from '@/data/beadTypes'
import { t } from '@/i18n/es'
import { BeadTypeDialog } from './BeadTypeDialog'

const CELLS = { '0,0': '#111111', '2,3': '#222222' }

beforeEach(() => {
  useEditorStore.setState({
    patternId: null,
    technique: 'peyote',
    cols: 6,
    rows: 60,
    beadTypeId: 'miyuki-delica-11',
    cells: { ...CELLS },
    fringe: createEmptyFringe(6),
    rowShape: createRectangleRowShape(6, 60),
    staggerPhase: 0,
    pair: undefined,
    loop: undefined,
    side: 'left',
    history: [],
    future: [],
  })
})

const editor = () => useEditorStore.getState()
const sizeWith = (id: string) => {
  const { widthMm, heightMm } = physicalSizeMm('peyote', 6, 60, getBeadType(id), 0, 0)
  return formatSizeMm(widthMm, heightMm)
}

describe('Cambiar la mostacilla', () => {
  it('sin cambiarla no deja aplicar', () => {
    render(<BeadTypeDialog onClose={() => {}} />)
    expect(screen.getByRole('button', { name: t.editor.beadType.apply })).toBeDisabled()
  })

  it('muestra cuánto mediría la pieza antes de aplicar', async () => {
    const user = userEvent.setup()
    render(<BeadTypeDialog onClose={() => {}} />)
    await user.click(screen.getByRole('button', { name: /Rocalla 11\/0/ }))
    expect(screen.getByText(sizeWith('miyuki-delica-11'))).toBeInTheDocument()
    expect(screen.getByText(sizeWith('rocalla-11'))).toBeInTheDocument()
    expect(editor().beadTypeId).toBe('miyuki-delica-11') // todavía no cambió nada
  })

  it('cambia la mostacilla y no toca ni un color', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(<BeadTypeDialog onClose={onClose} />)
    await user.click(screen.getByRole('button', { name: /Rocalla 11\/0/ }))
    await user.click(screen.getByRole('button', { name: t.editor.beadType.apply }))
    expect(editor().beadTypeId).toBe('rocalla-11')
    expect(editor().cells).toEqual(CELLS)
    expect(editor().history).toEqual([]) // no es un paso de deshacer: nada se movió
    expect(onClose).toHaveBeenCalled()
  })

  it('la guarda en el patrón, sin tocar el dibujo', async () => {
    const user = userEvent.setup()
    const id = usePatternsStore.getState().createPattern({ technique: 'peyote', cols: 6, rows: 60, beadTypeId: 'miyuki-delica-11' })
    usePatternsStore.getState().setCells(id, { ...CELLS })
    useEditorStore.setState({ patternId: id })

    render(<BeadTypeDialog onClose={() => {}} />)
    await user.click(screen.getByRole('button', { name: /Rocalla 11\/0/ }))
    await user.click(screen.getByRole('button', { name: t.editor.beadType.apply }))

    const doc = usePatternsStore.getState().getPattern(id)!
    expect(doc.config.beadTypeId).toBe('rocalla-11')
    expect(doc.cells).toEqual(CELLS)
  })
})
