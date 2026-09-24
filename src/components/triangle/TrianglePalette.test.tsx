import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { PatternDoc } from '@/engine/types'
import { TONE_FAMILIES } from '@/data/toneFamilies'
import { usePatternsStore } from '@/store/patternsStore'
import { t } from '@/i18n/es'
import { TrianglePalette } from './TrianglePalette'

const ROJO = '#b8444c'
const AZUL = '#2f6fd0'
/** Un tono de la grilla del elegidor, para poder elegirlo con un clic. */
const VERDE = TONE_FAMILIES.find((f) => f.name === 'Verdes')!.tones[3]

const PATRON: PatternDoc = {
  id: 'tri',
  name: 'Aro triangular',
  config: { technique: 'triangle', cols: 10, rows: 10, rounds: 10, beadTypeId: 'delica-11' },
  cells: { '0:3:1': ROJO, '1:4:2': ROJO, '2:2:0': AZUL },
  palette: [ROJO, AZUL, null, null, null, null],
  createdAt: 0,
  updatedAt: 0,
}

beforeEach(() => {
  usePatternsStore.setState({ patterns: { tri: PATRON }, order: ['tri'] })
})

const patron = () => usePatternsStore.getState().patterns.tri

/** La muestra de un color dentro del elegidor — por su color, que es lo único que la distingue. */
function muestra(hex: string) {
  const css = `rgb(${parseInt(hex.slice(1, 3), 16)}, ${parseInt(hex.slice(3, 5), 16)}, ${parseInt(hex.slice(5, 7), 16)})`
  const el = within(screen.getByRole('dialog'))
    .getAllByRole('button')
    .find((b) => (b as HTMLElement).style.backgroundColor === css)
  if (!el) throw new Error(`el elegidor no ofrece el color ${hex}`)
  return el
}

function renderPalette(activeSlot = 0, onActiveSlot = vi.fn(), onBeforeRecolor = vi.fn()) {
  const doc = patron()
  render(
    <TrianglePalette
      patternId="tri"
      slots={doc.palette!}
      cells={doc.cells}
      activeSlot={activeSlot}
      onActiveSlot={onActiveSlot}
      onBeforeRecolor={onBeforeRecolor}
    />,
  )
  return { onActiveSlot, onBeforeRecolor }
}

describe('TrianglePalette', () => {
  it('una casilla vacía abre el elegidor y el color queda guardado con el patrón', async () => {
    const user = userEvent.setup()
    const { onActiveSlot } = renderPalette()
    await user.click(screen.getByRole('button', { name: t.editor.tray.emptySlot(3) }))

    expect(screen.getByRole('dialog')).toBeTruthy()
    await user.click(muestra(VERDE))
    await user.click(screen.getByRole('button', { name: t.editor.chooser.use }))

    expect(patron().palette![2]).toBe(VERDE)
    expect(onActiveSlot).toHaveBeenCalledWith(2)
  })

  it('tocar de nuevo el color activo lo cambia, y todas sus mostacillas con él', async () => {
    const user = userEvent.setup()
    const { onBeforeRecolor } = renderPalette(0)
    await user.click(screen.getByRole('button', { name: /tocar de nuevo para cambiarlo/i }))
    await user.click(muestra(VERDE))
    await user.click(screen.getByRole('button', { name: t.editor.chooser.use }))

    // Las dos rojas pasan al verde; la azul se queda como estaba.
    expect(patron().cells['0:3:1']).toBe(VERDE)
    expect(patron().cells['1:4:2']).toBe(VERDE)
    expect(patron().cells['2:2:0']).toBe(AZUL)
    expect(patron().palette![0]).toBe(VERDE)
    // La página tiene que poder deshacerlo.
    expect(onBeforeRecolor).toHaveBeenCalled()
  })

  it('cambiar un color por otro que ya está cargado junta las dos casillas', async () => {
    usePatternsStore.setState({
      patterns: { tri: { ...PATRON, palette: [ROJO, VERDE, null, null, null, null] } },
    })
    const user = userEvent.setup()
    const { onActiveSlot } = renderPalette(0)
    await user.click(screen.getByRole('button', { name: /tocar de nuevo para cambiarlo/i }))
    await user.click(muestra(VERDE))
    await user.click(screen.getByRole('button', { name: t.editor.chooser.use }))

    // El verde ya vivía en la casilla 2: no se carga dos veces, y se pinta con ésa.
    expect(patron().palette![0]).toBeNull()
    expect(patron().palette![1]).toBe(VERDE)
    expect(onActiveSlot).toHaveBeenCalledWith(1)
  })
})
