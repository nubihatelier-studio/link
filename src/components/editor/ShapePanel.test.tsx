import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import { useEditorStore } from '@/store/editorStore'
import { ShapePanel } from './ShapePanel'

function resetStore() {
  useEditorStore.setState({
    cols: 5,
    rows: 2,
    rowShape: [
      { offset: 1, length: 3 },
      { offset: 0, length: 5 },
    ],
  })
}

describe('ShapePanel', () => {
  beforeEach(() => {
    resetStore()
  })

  it('renders one row of controls per body row, showing each row\'s current width', () => {
    render(<ShapePanel />)
    expect(screen.getByText('Fila 1')).toBeInTheDocument()
    expect(screen.getByText('Fila 2')).toBeInTheDocument()
    // Row 1 (index 0) has length 3, row 2 (index 1) has length 5.
    const widths = screen.getAllByText(/^[0-9]+$/).map((el) => el.textContent)
    expect(widths).toEqual(['3', '5'])
  })

  it('clicking "agrandar por la derecha" grows that row through the store', async () => {
    const user = userEvent.setup()
    render(<ShapePanel />)

    await user.click(screen.getAllByRole('button', { name: 'Agrandar por la derecha' })[0])
    expect(useEditorStore.getState().rowShape[0]).toEqual({ offset: 1, length: 4 })
  })

  it('clicking "achicar por la izquierda" shrinks that row through the store', async () => {
    const user = userEvent.setup()
    render(<ShapePanel />)

    await user.click(screen.getAllByRole('button', { name: 'Achicar por la izquierda' })[0])
    expect(useEditorStore.getState().rowShape[0]).toEqual({ offset: 2, length: 2 })
  })

  it('disables the shrink buttons once a row is down to 1 bead', () => {
    useEditorStore.setState({ rowShape: [{ offset: 2, length: 1 }], rows: 1 })
    render(<ShapePanel />)
    expect(screen.getByRole('button', { name: 'Achicar por la izquierda' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Achicar por la derecha' })).toBeDisabled()
  })

  it('disables growLeft/growRight at the grid\'s own edge', () => {
    // A full-width row (offset 0, length = cols) can't grow further in either direction.
    useEditorStore.setState({ rowShape: [{ offset: 0, length: 5 }], rows: 1, cols: 5 })
    render(<ShapePanel />)
    expect(screen.getByRole('button', { name: 'Agrandar por la izquierda' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Agrandar por la derecha' })).toBeDisabled()
  })
})
