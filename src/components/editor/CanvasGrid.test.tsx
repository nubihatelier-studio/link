import { fireEvent, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { PatternDoc } from '@/engine/types'
import { usePatternsStore } from '@/store/patternsStore'
import { useEditorStore } from '@/store/editorStore'
import { CanvasGrid, PINCH_GRACE_MS } from './CanvasGrid'

const GOLD = '#c9a227'
const DOC: PatternDoc = {
  id: 'p_pinch',
  name: 'Tira',
  config: { technique: 'loom', cols: 4, rows: 4, beadTypeId: 'miyuki-delica-11' },
  cells: {},
  createdAt: 0,
  updatedAt: 0,
}
/** Centro de la celda 0,0: margen de la regla (28) + media celda (15) al 100%. */
const CELL_00 = { clientX: 43, clientY: 43 }
const CELL_33 = { clientX: 28 + 3 * 30 + 15, clientY: 28 + 3 * 30 + 15 }

let now = 0
beforeEach(() => {
  now = 1000
  vi.spyOn(performance, 'now').mockImplementation(() => now)
  usePatternsStore.setState({ patterns: { [DOC.id]: DOC }, order: [DOC.id] })
  useEditorStore.getState().loadPattern(DOC)
  useEditorStore.setState({ slots: [GOLD], activeSlot: 0, zoom: 100 })
})
afterEach(() => vi.restoreAllMocks())

function canvas() {
  render(<CanvasGrid />)
  return document.querySelector('canvas')!
}
const editor = () => useEditorStore.getState()

describe('CanvasGrid — pellizcar para hacer zoom no pinta', () => {
  it('el primer dedo de un pellizco no deja la mostacilla pintada ni un paso para deshacer', () => {
    useEditorStore.setState({ tool: 'pencil' })
    const c = canvas()
    fireEvent.pointerDown(c, { ...CELL_00, pointerId: 1 })
    expect(editor().cells['0,0']).toBe(GOLD) // se ve al tiro mientras pinta…
    now += 80
    fireEvent.pointerDown(c, { ...CELL_33, pointerId: 2 })
    fireEvent.pointerUp(c, { ...CELL_33, pointerId: 2 })
    fireEvent.pointerUp(c, { ...CELL_00, pointerId: 1 })
    expect(editor().cells['0,0']).toBeUndefined() // …pero el pellizco la retira
    expect(editor().history).toHaveLength(0)
  })

  it('si el segundo dedo llega tarde, lo que se venía pintando se queda', () => {
    useEditorStore.setState({ tool: 'pencil' })
    const c = canvas()
    fireEvent.pointerDown(c, { ...CELL_00, pointerId: 1 })
    now += PINCH_GRACE_MS + 50
    fireEvent.pointerDown(c, { ...CELL_33, pointerId: 2 })
    fireEvent.pointerUp(c, { ...CELL_33, pointerId: 2 })
    fireEvent.pointerUp(c, { ...CELL_00, pointerId: 1 })
    expect(editor().cells['0,0']).toBe(GOLD)
    expect(editor().history).toHaveLength(1)
  })

  it('el balde no rellena si el toque termina siendo un pellizco', () => {
    useEditorStore.setState({ tool: 'fill' })
    const c = canvas()
    fireEvent.pointerDown(c, { ...CELL_00, pointerId: 1 })
    fireEvent.pointerDown(c, { ...CELL_33, pointerId: 2 })
    fireEvent.pointerUp(c, { ...CELL_33, pointerId: 2 })
    fireEvent.pointerUp(c, { ...CELL_00, pointerId: 1 })
    expect(Object.keys(editor().cells)).toHaveLength(0)
  })

  it('un toque normal con el balde sí rellena, al levantar el dedo', () => {
    useEditorStore.setState({ tool: 'fill' })
    const c = canvas()
    fireEvent.pointerDown(c, { ...CELL_00, pointerId: 1 })
    expect(Object.keys(editor().cells)).toHaveLength(0)
    fireEvent.pointerUp(c, { ...CELL_00, pointerId: 1 })
    expect(Object.keys(editor().cells)).toHaveLength(16)
  })

  it('borrar un rectángulo no borra nada al terminar un pellizco', () => {
    useEditorStore.setState({ tool: 'rectErase', cells: { '0,0': GOLD } })
    const c = canvas()
    fireEvent.pointerDown(c, { ...CELL_00, pointerId: 1 })
    fireEvent.pointerDown(c, { ...CELL_33, pointerId: 2 })
    fireEvent.pointerUp(c, { ...CELL_33, pointerId: 2 })
    fireEvent.pointerUp(c, { ...CELL_00, pointerId: 1 })
    expect(editor().cells['0,0']).toBe(GOLD)
  })
})
