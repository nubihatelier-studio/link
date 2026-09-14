import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { PatternDoc } from '@/engine/types'
import { assignLetters } from '@/engine/letters'
import { useEditorStore } from '@/store/editorStore'
import { usePatternsStore } from '@/store/patternsStore'
import { CanvasGrid } from './CanvasGrid'
import { ColorCard } from './ColorCard'
import { ColorChooser } from './ColorChooser'
import { ColorStrip } from './ColorStrip'

const AZUL = '#3547b0'
const DORADO = '#e7d49a'

function doc(over: Partial<PatternDoc> = {}): PatternDoc {
  return {
    id: 'p_bandeja',
    name: 'Bandeja',
    config: { technique: 'loom', cols: 4, rows: 4, beadTypeId: 'miyuki-delica-11' },
    cells: {},
    createdAt: 0,
    updatedAt: 0,
    ...over,
  }
}

function open(d: PatternDoc) {
  usePatternsStore.setState({ patterns: { [d.id]: d }, order: [d.id] })
  useEditorStore.getState().loadPattern(d)
}
const editor = () => useEditorStore.getState()
const saved = () => usePatternsStore.getState().patterns['p_bandeja']

function renderEditorBits() {
  return render(
    <>
      <ColorStrip onOpenPalette={() => {}} />
      <ColorChooser />
      <ColorCard />
    </>,
  )
}

beforeEach(() => {
  useEditorStore.setState({ history: [], future: [], selection: null, colorSelectionMask: null, tool: 'pencil' })
})

describe('La bandeja de colores', () => {
  it('un patrón nuevo abre con seis casillas vacías y ningún color elegido', () => {
    open(doc())
    renderEditorBits()
    expect(screen.getAllByRole('button', { name: /vacía: elegir un color/ })).toHaveLength(6)
    expect(editor().activeSlot).toBe(-1)
  })

  it('tocar una casilla vacía abre el selector; el color elegido queda puesto y listo para pintar', async () => {
    const user = userEvent.setup()
    open(doc())
    renderEditorBits()

    await user.click(screen.getByRole('button', { name: 'Casilla 3 vacía: elegir un color' }))
    const dialog = within(screen.getByRole('dialog'))
    expect(dialog.getByRole('heading', { name: 'Casilla 3' })).toBeInTheDocument()
    expect(dialog.getByRole('button', { name: 'Usar este color' })).toBeDisabled()

    await user.click(dialog.getAllByRole('button', { name: /^Azules · / })[3])
    await user.click(dialog.getByRole('button', { name: 'Usar este color' }))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(editor().activeSlot).toBe(2)
    expect(editor().slots[2]).toMatch(/^#/)
    expect(editor().slots.filter(Boolean)).toHaveLength(1)
  })

  it('la bandeja se guarda con el patrón: un color cargado sin pintar sigue ahí al volver a abrirlo', () => {
    open(doc())
    editor().fillSlot(1, DORADO)
    expect(saved().palette).toEqual([null, DORADO, null, null, null, null])

    open(saved())
    expect(editor().slots).toEqual([null, DORADO, null, null, null, null])
    expect(editor().activeSlot).toBe(1)
  })

  it('un color pintado lleva su letra; uno cargado sin pintar no', () => {
    open(doc({ cells: { '0,0': AZUL }, palette: [AZUL, DORADO, null, null, null, null] }))
    renderEditorBits()
    expect(screen.getByRole('button', { name: 'Color A · 1 mostacilla' })).toHaveTextContent('A')
    expect(screen.getByRole('button', { name: /cargado, todavía sin pintar/ })).toHaveTextContent('')
  })

  it('tocar un color lo deja activo, y tocarlo de nuevo abre su ficha', async () => {
    const user = userEvent.setup()
    open(doc({ cells: { '0,0': AZUL }, palette: [DORADO, AZUL, null, null, null, null] }))
    renderEditorBits()

    const a = screen.getByRole('button', { name: 'Color A · 1 mostacilla' })
    await user.click(a)
    expect(editor().activeSlot).toBe(1)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    await user.click(a)
    expect(within(screen.getByRole('dialog')).getByRole('heading', { name: 'Color A' })).toBeInTheDocument()
  })

  it('cambiar un color pintado recolorea todas sus mostacillas en un paso de deshacer, y conserva su letra', () => {
    open(doc({ cells: { '0,0': DORADO, '0,1': AZUL, '1,0': AZUL }, palette: [DORADO, AZUL, null, null, null, null] }))
    const letra = (hex: string) => assignLetters({ ...saved().config, cells: editor().cells }, saved().letters).find((e) => e.hex === hex)?.letter
    expect(letra(AZUL)).toBe('B')

    editor().recolorSlot(1, '#aa0000')
    expect(editor().cells).toEqual({ '0,0': DORADO, '0,1': '#aa0000', '1,0': '#aa0000' })
    expect(editor().slots[1]).toBe('#aa0000')
    expect(editor().history).toHaveLength(1)
    expect(letra('#aa0000')).toBe('B')

    // Deshacer devuelve el azul con su misma letra, y a su casilla.
    editor().undo()
    expect(letra(AZUL)).toBe('B')
    expect(editor().slots[1]).toBe(AZUL)
    editor().redo()
    expect(editor().slots[1]).toBe('#aa0000')
    expect(letra('#aa0000')).toBe('B')
  })

  it('"+ Casilla" agrega una séptima y abre el selector; cancelar no la deja vacía de más', async () => {
    const user = userEvent.setup()
    open(doc({ palette: [AZUL, DORADO, '#111111', '#222222', '#333333', '#444444'] }))
    renderEditorBits()

    await user.click(screen.getByRole('button', { name: 'Agregar una casilla' }))
    expect(editor().slots).toHaveLength(7)
    expect(within(screen.getByRole('dialog')).getByRole('heading', { name: 'Casilla 7' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Cancelar' }))
    expect(editor().slots).toHaveLength(6)
  })

  it('el gotario carga el color tocado en la primera casilla vacía sin pisar el activo', () => {
    open(doc({ cells: { '0,0': AZUL }, palette: [DORADO, null, null, null, null, null] }))
    editor().setActiveSlot(0)
    editor().pickColor(0, 0)
    expect(editor().slots).toEqual([DORADO, AZUL, null, null, null, null])
    expect(editor().activeSlot).toBe(1)
  })

  it('"Paleta" abre el panel completo', async () => {
    const user = userEvent.setup()
    const openPalette = vi.fn()
    open(doc())
    render(<ColorStrip onOpenPalette={openPalette} />)
    await user.click(screen.getByRole('button', { name: 'Paleta' }))
    expect(openPalette).toHaveBeenCalledOnce()
  })
})

describe('Pintar sin un color cargado', () => {
  it('tocar el lienzo abre el selector en la primera casilla vacía, y no pinta ni borra nada', () => {
    open(doc({ cells: { '1,1': AZUL }, palette: [null, AZUL, null, null, null, null] }))
    editor().emptySlot(1) // pintado: no se puede vaciar
    expect(editor().slots[1]).toBe(AZUL)

    useEditorStore.setState({ activeSlot: -1 })
    render(
      <>
        <CanvasGrid />
        <ColorChooser />
      </>,
    )
    const canvas = document.querySelector('canvas')!
    fireEvent.pointerDown(canvas, { pointerId: 1, clientX: 43, clientY: 43 })
    fireEvent.pointerUp(canvas, { pointerId: 1, clientX: 43, clientY: 43 })

    expect(editor().cells).toEqual({ '1,1': AZUL })
    expect(within(screen.getByRole('dialog')).getByRole('heading', { name: 'Casilla 1' })).toBeInTheDocument()
  })
})
