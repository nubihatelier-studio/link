import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useEditorStore } from '@/store/editorStore'
import { t } from '@/i18n/es'
import type { RGB } from '@/lib/color'
import { PhotoPaletteDialog } from './PhotoPaletteDialog'

const ROSADO = { r: 220, g: 120, b: 160 }
const VERDE = { r: 60, g: 130, b: 70 }
const FONDO = { r: 245, g: 243, b: 238 }
const pixels: RGB[] = [
  ...Array.from({ length: 600 }, () => FONDO),
  ...Array.from({ length: 300 }, () => ROSADO),
  ...Array.from({ length: 200 }, () => VERDE),
]

// jsdom no decodifica imágenes: la lectura de la foto se reemplaza por sus píxeles.
vi.mock('@/lib/photoPalette', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/photoPalette')>()
  return { ...actual, readPhotoPixels: vi.fn(async () => ({ pixels, url: 'blob:foto' })) }
})

const editor = () => useEditorStore.getState()

beforeEach(() => {
  useEditorStore.setState({
    patternId: null,
    cells: { '0,0': '#111111' },
    slots: ['#111111', '#8da2b0', null, null, null, null],
    activeSlot: 0,
    photoPaletteOpen: true,
    history: [],
    future: [],
  })
})

describe('Paleta desde una foto', () => {
  it('muestra los colores de la foto, deja descartar el fondo y suma el resto a la bandeja sin reemplazar nada', async () => {
    const user = userEvent.setup()
    render(<PhotoPaletteDialog />)

    const input = document.getElementById('photo-palette-file') as HTMLInputElement
    fireEvent.change(input, { target: { files: [new File(['x'], 'flor.jpg', { type: 'image/jpeg' })] } })
    await waitFor(() => expect(screen.getByRole('button', { name: t.editor.photoPalette.load(3) })).toBeInTheDocument())

    // El fondo es lo más grande de la foto: se descarta.
    await user.click(screen.getAllByRole('button', { pressed: true })[0])
    await user.click(screen.getByRole('button', { name: t.editor.photoPalette.load(2) }))

    const tray = editor().slots
    expect(tray.slice(0, 2)).toEqual(['#111111', '#8da2b0'])
    expect(tray.filter(Boolean)).toHaveLength(4)
    expect(tray[2]).not.toBeNull()
    expect(tray[3]).not.toBeNull()
    expect(editor().activeSlot).toBe(2)
    expect(editor().photoPaletteOpen).toBe(false)
  })

  it('cancelar no carga nada', async () => {
    const user = userEvent.setup()
    render(<PhotoPaletteDialog />)
    await user.click(screen.getByRole('button', { name: t.editor.photoPalette.cancel }))
    expect(editor().slots).toEqual(['#111111', '#8da2b0', null, null, null, null])
    expect(editor().photoPaletteOpen).toBe(false)
  })
})

describe('loadColors', () => {
  it('llena las casillas vacías, agrega casillas si faltan y se salta los colores que ya están', () => {
    useEditorStore.setState({ slots: ['#111111', null], activeSlot: 0 })
    editor().loadColors(['#111111', '#aa0000', '#00aa00', '#0000aa'])
    expect(editor().slots).toEqual(['#111111', '#aa0000', '#00aa00', '#0000aa'])
    expect(editor().activeSlot).toBe(1)
  })
})
