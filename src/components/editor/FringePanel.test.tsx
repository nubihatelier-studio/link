import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import { createEmptyFringe } from '@/engine/fringe'
import { useEditorStore } from '@/store/editorStore'
import { t } from '@/i18n/es'
import { FringePanel } from './FringePanel'

function resetStore() {
  useEditorStore.setState({
    cols: 4,
    rows: 4,
    fringe: createEmptyFringe(4),
    cells: {},
    history: [],
    future: [],
  })
}

describe('FringePanel', () => {
  beforeEach(() => {
    resetStore()
  })

  it('el campo numérico de una columna edita el largo directamente, además de los botones +/-', () => {
    render(<FringePanel />)
    const input = screen.getByLabelText(t.editor.fringe.lengthInputLabel(1))
    fireEvent.change(input, { target: { value: '42' } })
    expect(useEditorStore.getState().fringe.lengths[0]).toBe(42)
  })

  it('el campo numérico de una columna respeta el máximo (MAX_FRINGE_LENGTH)', () => {
    render(<FringePanel />)
    const input = screen.getByLabelText(t.editor.fringe.lengthInputLabel(1))
    fireEvent.change(input, { target: { value: '999' } })
    expect(useEditorStore.getState().fringe.lengths[0]).toBe(100)
  })

  it('"Aplicar a todas" fija el mismo largo en todas las columnas de una pasada', async () => {
    const user = userEvent.setup()
    render(<FringePanel />)
    const applyAllInput = screen.getByLabelText(t.editor.fringe.applyToAllInputLabel)
    fireEvent.change(applyAllInput, { target: { value: '60' } })
    await user.click(screen.getByRole('button', { name: t.editor.fringe.applyToAllButton }))
    expect(useEditorStore.getState().fringe.lengths).toEqual([60, 60, 60, 60])
  })

  it('"Aplicar a todas" recorta mostacillas pintadas que quedan fuera del nuevo largo en un solo paso de deshacer, no una por columna', async () => {
    const user = userEvent.setup()
    // Two columns with painted fringe beads that a shorter "aplicar a todas" will cut off.
    useEditorStore.setState({
      fringe: { lengths: [5, 5, 5, 5], turnBeads: [false, false, false, false] },
      cells: { '8,0': '#111111', '8,1': '#222222' }, // depth 4 of columns 0 and 1 (rows 4.. are fringe) — beyond the new length of 2
    })
    render(<FringePanel />)
    const applyAllInput = screen.getByLabelText(t.editor.fringe.applyToAllInputLabel)
    fireEvent.change(applyAllInput, { target: { value: '2' } })
    await user.click(screen.getByRole('button', { name: t.editor.fringe.applyToAllButton }))
    expect(useEditorStore.getState().fringe.lengths).toEqual([2, 2, 2, 2])
    expect(useEditorStore.getState().cells['8,0']).toBeUndefined()
    expect(useEditorStore.getState().cells['8,1']).toBeUndefined()
    expect(useEditorStore.getState().history).toHaveLength(1) // both drops in one commit, not two
  })

  it('el bloque "+5" alarga todas las columnas manteniendo la forma ya esculpida', async () => {
    const user = userEvent.setup()
    useEditorStore.setState({ fringe: { lengths: [3, 5, 5, 3], turnBeads: [false, false, false, false] } })
    render(<FringePanel />)
    await user.click(screen.getByRole('button', { name: t.editor.fringe.lengthenBy(5) }))
    expect(useEditorStore.getState().fringe.lengths).toEqual([8, 10, 10, 8])
  })

  it('el bloque "−10" acorta todas las columnas sin bajar de 0', async () => {
    const user = userEvent.setup()
    useEditorStore.setState({ fringe: { lengths: [3, 5, 12, 3], turnBeads: [false, false, false, false] } })
    render(<FringePanel />)
    await user.click(screen.getByRole('button', { name: t.editor.fringe.shortenBy(10) }))
    expect(useEditorStore.getState().fringe.lengths).toEqual([0, 0, 2, 0])
  })

  it('el ajuste en bloque recorta mostacillas pintadas de varias columnas en un solo paso de deshacer, no una por columna', async () => {
    const user = userEvent.setup()
    useEditorStore.setState({
      fringe: { lengths: [6, 7, 6, 7], turnBeads: [false, false, false, false] },
      cells: { '9,0': '#111111', '10,1': '#222222' }, // deepest bead of columns 0 and 1
    })
    render(<FringePanel />)
    await user.click(screen.getByRole('button', { name: t.editor.fringe.shortenBy(5) }))
    expect(useEditorStore.getState().fringe.lengths).toEqual([1, 2, 1, 2])
    expect(useEditorStore.getState().cells['9,0']).toBeUndefined()
    expect(useEditorStore.getState().cells['10,1']).toBeUndefined()
    expect(useEditorStore.getState().history).toHaveLength(1) // both drops in one commit, not two
  })

  it('llegar a un largo de 80+ mostacillas por bloque funciona sin problemas (flecos largos, estilo pluma)', async () => {
    const user = userEvent.setup()
    render(<FringePanel />)
    const applyAllInput = screen.getByLabelText(t.editor.fringe.applyToAllInputLabel)
    fireEvent.change(applyAllInput, { target: { value: '70' } })
    await user.click(screen.getByRole('button', { name: t.editor.fringe.applyToAllButton }))
    await user.click(screen.getByRole('button', { name: t.editor.fringe.lengthenBy(10) }))
    expect(useEditorStore.getState().fringe.lengths).toEqual([80, 80, 80, 80])
  })
})
