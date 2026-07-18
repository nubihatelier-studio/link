import { fireEvent, render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { createEmptyFringe } from '@/engine/fringe'
import { buildWeaveOrder } from '@/engine/weaveOrder'
import { WeaveCanvas } from './WeaveCanvas'

// jsdom has no canvas layout engine, so `getBoundingClientRect()` on the <canvas> always comes back
// zeroed — clientX/clientY on the pointer events below land directly in canvas-local coordinates,
// same units the component's own hit-test math uses (MARGIN=28, CELL_PX=24).
const NEXT_CELL_CENTER = { x: 40, y: 40 } // loom (row 0, col 0): MARGIN + 0*CELL_PX + CELL_PX/2

function renderCanvas(onTapNext = vi.fn()) {
  const order = buildWeaveOrder('loom', 2, 2)
  const utils = render(
    <WeaveCanvas
      technique="loom"
      cols={2}
      rows={2}
      cells={{}}
      fringe={createEmptyFringe(2)}
      order={order}
      currentIndex={-1}
      onTapNext={onTapNext}
    />,
  )
  const container = utils.container.firstChild as HTMLElement
  return { ...utils, container, onTapNext }
}

function tap(container: HTMLElement, point: { x: number; y: number }, pointerId = 1) {
  fireEvent.pointerDown(container, { clientX: point.x, clientY: point.y, pointerId })
  fireEvent.pointerUp(container, { clientX: point.x, clientY: point.y, pointerId })
}

describe('WeaveCanvas — avance por toque (Endurecimiento 5)', () => {
  it('un tap cerca de la próxima mostacilla avanza', () => {
    const { container, onTapNext } = renderCanvas()
    tap(container, NEXT_CELL_CENTER)
    expect(onTapNext).toHaveBeenCalledTimes(1)
  })

  it('el área de toque cubre todo el contenedor, no solo el <canvas> exacto (el listener vive en el div envolvente)', () => {
    const { container, onTapNext } = renderCanvas()
    // In jsdom the <canvas> itself never gets laid out (no width/height/style — the draw effect
    // bails out before setting them, since getContext('2d') returns null), so any tap on the
    // wrapping div lands "outside the canvas" in a literal DOM sense — proving the listener isn't
    // scoped to the canvas element.
    expect(container.tagName).not.toBe('CANVAS')
    tap(container, NEXT_CELL_CENTER)
    expect(onTapNext).toHaveBeenCalledTimes(1)
  })

  it('un tap lejos de la próxima mostacilla no avanza', () => {
    const { container, onTapNext } = renderCanvas()
    tap(container, { x: 500, y: 500 })
    expect(onTapNext).not.toHaveBeenCalled()
  })

  it('un arrastre que empieza cerca de la próxima mostacilla (inicio de scroll/pan) no avanza', () => {
    const { container, onTapNext } = renderCanvas()
    fireEvent.pointerDown(container, { clientX: NEXT_CELL_CENTER.x, clientY: NEXT_CELL_CENTER.y, pointerId: 1 })
    // Past TAP_SLOP_PX (10) — reads as the start of a pan, not a tap.
    fireEvent.pointerUp(container, { clientX: NEXT_CELL_CENTER.x + 40, clientY: NEXT_CELL_CENTER.y, pointerId: 1 })
    expect(onTapNext).not.toHaveBeenCalled()
  })

  it('un pequeño temblor del dedo dentro del umbral igual cuenta como tap', () => {
    const { container, onTapNext } = renderCanvas()
    fireEvent.pointerDown(container, { clientX: NEXT_CELL_CENTER.x, clientY: NEXT_CELL_CENTER.y, pointerId: 1 })
    fireEvent.pointerUp(container, { clientX: NEXT_CELL_CENTER.x + 4, clientY: NEXT_CELL_CENTER.y + 4, pointerId: 1 })
    expect(onTapNext).toHaveBeenCalledTimes(1)
  })

  it('un segundo dedo apoyado a mitad de gesto (inicio de pinch) cancela el tap del primero', () => {
    const { container, onTapNext } = renderCanvas()
    fireEvent.pointerDown(container, { clientX: NEXT_CELL_CENTER.x, clientY: NEXT_CELL_CENTER.y, pointerId: 1 })
    fireEvent.pointerDown(container, { clientX: NEXT_CELL_CENTER.x, clientY: NEXT_CELL_CENTER.y, pointerId: 2 })
    fireEvent.pointerUp(container, { clientX: NEXT_CELL_CENTER.x, clientY: NEXT_CELL_CENTER.y, pointerId: 1 })
    expect(onTapNext).not.toHaveBeenCalled()
  })

  it('no dispara doble avance: no queda ningún listener de click en el contenedor', () => {
    const { container, onTapNext } = renderCanvas()
    fireEvent.click(container, { clientX: NEXT_CELL_CENTER.x, clientY: NEXT_CELL_CENTER.y })
    expect(onTapNext).not.toHaveBeenCalled()
  })

  it('un pointerup de un pointerId distinto al que bajó no cuenta (ej. tras un pointercancel)', () => {
    const { container, onTapNext } = renderCanvas()
    fireEvent.pointerDown(container, { clientX: NEXT_CELL_CENTER.x, clientY: NEXT_CELL_CENTER.y, pointerId: 1 })
    fireEvent.pointerCancel(container, { pointerId: 1 })
    fireEvent.pointerUp(container, { clientX: NEXT_CELL_CENTER.x, clientY: NEXT_CELL_CENTER.y, pointerId: 1 })
    expect(onTapNext).not.toHaveBeenCalled()
  })
})
