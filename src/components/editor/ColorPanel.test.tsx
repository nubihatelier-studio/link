import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import { useEditorStore } from '@/store/editorStore'
import { ColorPanel } from './ColorPanel'

function resetStore() {
  useEditorStore.setState({
    cells: { '0,0': '#111111', '0,1': '#111111', '0,2': '#222222' },
    colorLetters: { '#111111': 'A', '#222222': 'B' },
    slots: ['#111111', '#222222', '#8da2b0', '#ffffff'],
    activeSlot: 0,
    history: [],
    future: [],
    selection: null,
  })
}

describe('ColorPanel — reemplazar color globalmente', () => {
  beforeEach(() => {
    resetStore()
  })

  it('reemplaza todas las mostacillas del color elegido en una sola operación de deshacer', async () => {
    const user = userEvent.setup()
    render(<ColorPanel />)

    // Palette is sorted by letter — '#111111' (A) is the first row, so its "Reemplazar" button comes first.
    await user.click(screen.getAllByRole('button', { name: 'Reemplazar en todo el patrón' })[0])
    const panel = within(screen.getByTestId('replace-panel'))
    // First entry of QUICK_SWATCHES is always plain black — a fixed, known target.
    await user.click(panel.getByTitle('#000000'))
    await user.click(panel.getByRole('button', { name: 'Confirmar' }))

    const { cells, history } = useEditorStore.getState()
    expect(cells).toEqual({ '0,0': '#000000', '0,1': '#000000', '0,2': '#222222' })
    expect(history).toHaveLength(1)
  })

  it('doble clic en el swatch de la paleta abre el reemplazo directo', async () => {
    const user = userEvent.setup()
    render(<ColorPanel />)

    expect(screen.queryByText('Confirmar')).not.toBeInTheDocument()
    // The swatch span and the description text both carry title="#111111" — the swatch renders first.
    await user.dblClick(screen.getAllByTitle('#111111')[0])
    expect(screen.getByText('Confirmar')).toBeInTheDocument()
  })

  it('no deja abiertos a la vez el panel de reemplazo y el de fusión', async () => {
    const user = userEvent.setup()
    render(<ColorPanel />)

    await user.click(screen.getAllByRole('button', { name: 'Reemplazar en todo el patrón' })[0])
    expect(screen.getByText('Confirmar')).toBeInTheDocument()

    await user.click(screen.getAllByRole('button', { name: 'Fusionar colores' })[0])
    expect(screen.queryByText('Confirmar')).not.toBeInTheDocument()
  })
})
