import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import { useEditorStore } from '@/store/editorStore'
import { t } from '@/i18n/es'
import { ColorCard } from './ColorCard'
import { ColorChooser } from './ColorChooser'
import { ColorPanel } from './ColorPanel'
import { ColorTray } from './ColorTray'

const NEGRO = '#111111'
const GRIS = '#222222'
const SIN_PINTAR = '#8da2b0'

beforeEach(() => {
  useEditorStore.setState({
    patternId: null,
    cells: { '0,0': NEGRO, '0,1': NEGRO, '0,2': GRIS },
    slots: [NEGRO, GRIS, SIN_PINTAR, null, null, null],
    activeSlot: 0,
    history: [],
    future: [],
    selection: null,
    colorSelectionMask: null,
    tool: 'pencil',
    colorCard: null,
    colorChooser: null,
  })
})
const editor = () => useEditorStore.getState()

function renderAll() {
  return render(
    <>
      <ColorPanel />
      <ColorCard />
      <ColorChooser />
    </>,
  )
}
const card = () => within(screen.getByRole('dialog'))

describe('La ficha del color', () => {
  it('se abre al tocar de nuevo el color activo, con su letra, nombre y cantidad', async () => {
    const user = userEvent.setup()
    render(
      <>
        <ColorTray layout="wrap" />
        <ColorCard />
      </>,
    )
    await user.click(screen.getByRole('button', { name: 'Color A · 2 mostacillas' }))
    expect(card().getByRole('heading', { name: 'Color A' })).toBeInTheDocument()
    expect(card().getByText(/Negro · 2 mostacillas/)).toBeInTheDocument()
  })

  it('tocar la fila de un color en la paleta abre su ficha', async () => {
    const user = userEvent.setup()
    renderAll()
    const lista = screen.getAllByRole('listitem')
    await user.click(within(lista[1]).getByRole('button'))
    expect(card().getByRole('heading', { name: 'Color B' })).toBeInTheDocument()
  })

  it('"Cambiar este color" abre el selector para recolorear todas sus mostacillas', async () => {
    const user = userEvent.setup()
    renderAll()
    editor().openColorCard(0)
    await user.click(await screen.findByRole('button', { name: /Cambiar este color/ }))
    expect(within(screen.getByRole('dialog')).getByRole('heading', { name: 'Cambiar el color A' })).toBeInTheDocument()
  })

  it('intercambiar cambia los dos colores en todo el patrón, en un paso de deshacer', async () => {
    const user = userEvent.setup()
    renderAll()
    editor().openColorCard(0)
    await user.click(await screen.findByRole('button', { name: 'Intercambiar con otro color' }))
    await user.click(card().getByRole('button', { name: 'Color B · 1 mostacilla' }))

    expect(editor().cells).toEqual({ '0,0': GRIS, '0,1': GRIS, '0,2': NEGRO })
    expect(editor().history).toHaveLength(1)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('fusionar pasa sus mostacillas al otro color y vacía su casilla', async () => {
    const user = userEvent.setup()
    renderAll()
    editor().openColorCard(1)
    await user.click(await screen.findByRole('button', { name: 'Fusionar con otro color' }))
    await user.click(card().getByRole('button', { name: 'Color A · 2 mostacillas' }))

    expect(editor().cells).toEqual({ '0,0': NEGRO, '0,1': NEGRO, '0,2': NEGRO })
    expect(editor().slots).toEqual([NEGRO, null, SIN_PINTAR, null, null, null])
    expect(editor().history).toHaveLength(1)

    // Deshacer la fusión devuelve el gris a sus mostacillas y a su casilla.
    editor().undo()
    expect(editor().cells).toEqual({ '0,0': NEGRO, '0,1': NEGRO, '0,2': GRIS })
    expect(editor().slots).toEqual([NEGRO, GRIS, SIN_PINTAR, null, null, null])
  })

  it('"Volver" sale de elegir el otro color sin hacer nada', async () => {
    const user = userEvent.setup()
    renderAll()
    editor().openColorCard(0)
    await user.click(await screen.findByRole('button', { name: 'Fusionar con otro color' }))
    await user.click(card().getByRole('button', { name: 'Volver' }))
    expect(card().getByRole('button', { name: 'Fusionar con otro color' })).toBeInTheDocument()
    expect(editor().history).toHaveLength(0)
  })

  it('seleccionar sus mostacillas las marca todas y cambia a la herramienta de selección', async () => {
    const user = userEvent.setup()
    renderAll()
    editor().openColorCard(0)
    await user.click(await screen.findByRole('button', { name: 'Seleccionar sus mostacillas' }))

    expect(editor().selection).toEqual({ r0: 0, c0: 0, r1: 0, c1: 1 })
    expect(editor().colorSelectionMask).toEqual(new Set(['0,0', '0,1']))
    expect(editor().tool).toBe('select')
  })

  it('vaciar la casilla sólo se puede con un color sin pintar', async () => {
    const user = userEvent.setup()
    renderAll()
    editor().openColorCard(0)
    expect(await screen.findByRole('button', { name: /Vaciar la casilla/ })).toBeDisabled()
    await user.click(card().getByRole('button', { name: 'Cerrar' }))

    editor().openColorCard(2)
    expect(await screen.findByRole('heading', { name: 'Color cargado' })).toBeInTheDocument()
    expect(card().queryByRole('button', { name: 'Intercambiar con otro color' })).not.toBeInTheDocument()
    await user.click(card().getByRole('button', { name: /Vaciar la casilla/ }))
    expect(editor().slots).toEqual([NEGRO, GRIS, null, null, null, null])
  })
})

describe('Degradado con todos los colores elegidos', () => {
  const COLORES = ['#111111', '#1f2f6b', '#4a2a6b', '#3ab0c8', '#d77aa8']

  beforeEach(() => {
    const cells: Record<string, string> = {}
    COLORES.forEach((hex, i) => (cells[`0,${i}`] = hex))
    useEditorStore.setState({
      technique: 'loom',
      cols: 5,
      rows: 20,
      fringe: { lengths: [0, 0, 0, 0, 0], turnBeads: [false, false, false, false, false] },
      rowShape: Array.from({ length: 20 }, () => ({ offset: 0, length: 5 })),
      cells,
      slots: [...COLORES, null],
      activeSlot: 0,
      history: [],
      future: [],
      selection: null,
      colorSelectionMask: null,
    })
  })

  it('parte con todos los colores del patrón en orden, y el degradado los usa todos', async () => {
    const user = userEvent.setup()
    render(<ColorPanel />)
    for (const [i, letter] of ['A', 'B', 'C', 'D', 'E'].entries()) {
      expect(screen.getByRole('button', { name: t.gradient.removeStop(letter, i + 1) })).toBeInTheDocument()
    }
    await user.click(screen.getByRole('button', { name: t.gradient.apply }))
    expect(new Set(Object.values(editor().cells))).toEqual(new Set(COLORES))
  })

  it('se puede quitar un color, volver a agregarlo al final e invertir el orden', async () => {
    const user = userEvent.setup()
    render(<ColorPanel />)

    await user.click(screen.getByRole('button', { name: t.gradient.removeStop('B', 2) }))
    expect(screen.getByRole('button', { name: t.gradient.removeStop('C', 2) })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: t.gradient.addStop('B') }))
    expect(screen.getByRole('button', { name: t.gradient.removeStop('B', 5) })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: t.gradient.reverse }))
    expect(screen.getByRole('button', { name: t.gradient.removeStop('B', 1) })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: t.gradient.apply }))
    // El primer color de la lista queda arriba.
    expect(editor().cells['0,0']).toBe('#1f2f6b')
  })

  it('con menos de dos colores no se puede aplicar', async () => {
    const user = userEvent.setup()
    render(<ColorPanel />)
    for (const letter of ['A', 'B', 'C', 'D']) {
      await user.click(screen.getByRole('button', { name: new RegExp(`^Quitar ${letter} `) }))
    }
    expect(screen.getByRole('button', { name: t.gradient.apply })).toBeDisabled()
    expect(screen.getByText(t.gradient.needsTwoColors)).toBeInTheDocument()
  })
})
