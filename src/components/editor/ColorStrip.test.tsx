import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useEditorStore } from '@/store/editorStore'
import { ColorPanel } from './ColorPanel'
import { ColorStrip } from './ColorStrip'

const BLACK = '#111111'
const GOLD = '#222222'

beforeEach(() => {
  useEditorStore.setState({
    cells: { '0,0': BLACK, '0,1': BLACK, '0,2': GOLD },
    slots: [BLACK, GOLD, '#8da2b0', '#ffffff'],
    activeSlot: 0,
    history: [],
    future: [],
    selection: null,
    colorSelectionMask: null,
    tool: 'pencil',
  })
})
const editor = () => useEditorStore.getState()

describe('ColorStrip — la tira de colores del celular', () => {
  it('muestra los colores del patrón con su letra y cambia de color con un solo toque', async () => {
    const user = userEvent.setup()
    render(<ColorStrip onOpenPalette={() => {}} />)

    const b = screen.getByRole('button', { name: 'Color B · 1 mostacilla' })
    expect(b).toHaveTextContent('B')
    await user.click(b)
    expect(editor().slots[editor().activeSlot]).toBe(GOLD)
    expect(b).toHaveAttribute('aria-pressed', 'true')
  })

  it('"Más colores" abre la paleta completa', async () => {
    const user = userEvent.setup()
    const open = vi.fn()
    render(<ColorStrip onOpenPalette={open} />)
    await user.click(screen.getByRole('button', { name: /Más colores/ }))
    expect(open).toHaveBeenCalledOnce()
  })
})

describe('Elegir un color nunca pisa el color activo', () => {
  it('un color rápido se agrega a la paleta y queda activo; el negro sigue ahí', async () => {
    const user = userEvent.setup()
    render(<ColorPanel />)

    await user.click(screen.getByRole('button', { name: '#ffffff' }))
    // '#ffffff' ya estaba en la paleta: se selecciona ese, no se duplica.
    expect(editor().slots).toEqual([BLACK, GOLD, '#8da2b0', '#ffffff'])
    expect(editor().activeSlot).toBe(3)

    await user.click(screen.getByRole('button', { name: '#000000' }))
    expect(editor().slots).toEqual([BLACK, GOLD, '#8da2b0', '#ffffff', '#000000'])
    expect(editor().slots[editor().activeSlot]).toBe('#000000')
  })

  it('al elegir un color, avisa para que la hoja del celular se cierre sola', async () => {
    const user = userEvent.setup()
    const chosen = vi.fn()
    render(<ColorPanel onColorChosen={chosen} />)
    await user.click(screen.getByRole('button', { name: '#000000' }))
    await user.click(screen.getByRole('button', { name: 'Color B · 1 mostacilla' }))
    expect(chosen).toHaveBeenCalledTimes(2)
  })

  it('el gotario selecciona el color tocado en vez de recolorear el activo', () => {
    useEditorStore.setState({ activeSlot: 1 }) // dorado activo
    editor().pickColor(0, 0) // negro
    expect(editor().slots).toEqual([BLACK, GOLD, '#8da2b0', '#ffffff'])
    expect(editor().activeSlot).toBe(0)
  })

  it('el selector personalizado está plegado hasta que se pide', async () => {
    const user = userEvent.setup()
    render(<ColorPanel />)
    const toggle = screen.getByRole('button', { name: /Personalizar/ })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    await user.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
  })
})
