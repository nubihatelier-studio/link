import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { HandsBusyView } from './HandsBusyView'

const BASE_PROPS = {
  unitLabel: 'Fila',
  unitIndex: 0,
  unitCount: 6,
  lineText: '3A, 2B',
  tapAnywhere: true,
  canAdvance: true,
}

function tap(el: HTMLElement, point = { x: 10, y: 10 }, pointerId = 1) {
  fireEvent.pointerDown(el, { clientX: point.x, clientY: point.y, pointerId })
  fireEvent.pointerUp(el, { clientX: point.x, clientY: point.y, pointerId })
}

describe('HandsBusyView — "Tocar el patrón para avanzar" (Endurecimiento 5)', () => {
  it('un tap en cualquier parte del contenedor avanza cuando tapAnywhere está activo', () => {
    const onAdvance = vi.fn()
    render(<HandsBusyView {...BASE_PROPS} onAdvance={onAdvance} />)
    tap(screen.getByRole('button'))
    expect(onAdvance).toHaveBeenCalledTimes(1)
  })

  it('no avanza si tapAnywhere está desactivado', () => {
    const onAdvance = vi.fn()
    render(<HandsBusyView {...BASE_PROPS} tapAnywhere={false} onAdvance={onAdvance} />)
    const container = screen.getByText('3A, 2B').parentElement!
    tap(container)
    expect(onAdvance).not.toHaveBeenCalled()
  })

  it('no avanza si no queda nada por tejer (canAdvance=false)', () => {
    const onAdvance = vi.fn()
    render(<HandsBusyView {...BASE_PROPS} canAdvance={false} onAdvance={onAdvance} />)
    // role="button" only renders when tapAnywhere is true regardless of canAdvance — query by text instead.
    const container = screen.getByText('3A, 2B').parentElement!
    tap(container)
    expect(onAdvance).not.toHaveBeenCalled()
  })

  it('un arrastre más allá del umbral (inicio de scroll/swipe) no avanza', () => {
    const onAdvance = vi.fn()
    render(<HandsBusyView {...BASE_PROPS} onAdvance={onAdvance} />)
    const el = screen.getByRole('button')
    fireEvent.pointerDown(el, { clientX: 10, clientY: 10, pointerId: 1 })
    fireEvent.pointerUp(el, { clientX: 60, clientY: 10, pointerId: 1 })
    expect(onAdvance).not.toHaveBeenCalled()
  })

  it('un pequeño temblor del dedo dentro del umbral igual cuenta como tap', () => {
    const onAdvance = vi.fn()
    render(<HandsBusyView {...BASE_PROPS} onAdvance={onAdvance} />)
    const el = screen.getByRole('button')
    fireEvent.pointerDown(el, { clientX: 10, clientY: 10, pointerId: 1 })
    fireEvent.pointerUp(el, { clientX: 14, clientY: 12, pointerId: 1 })
    expect(onAdvance).toHaveBeenCalledTimes(1)
  })

  it('un segundo dedo a mitad de gesto (inicio de pinch) cancela el tap', () => {
    const onAdvance = vi.fn()
    render(<HandsBusyView {...BASE_PROPS} onAdvance={onAdvance} />)
    const el = screen.getByRole('button')
    fireEvent.pointerDown(el, { clientX: 10, clientY: 10, pointerId: 1 })
    fireEvent.pointerDown(el, { clientX: 10, clientY: 10, pointerId: 2 })
    fireEvent.pointerUp(el, { clientX: 10, clientY: 10, pointerId: 1 })
    expect(onAdvance).not.toHaveBeenCalled()
  })

  it('no dispara doble avance: no queda ningún listener de click en el contenedor', () => {
    const onAdvance = vi.fn()
    render(<HandsBusyView {...BASE_PROPS} onAdvance={onAdvance} />)
    fireEvent.click(screen.getByRole('button'))
    expect(onAdvance).not.toHaveBeenCalled()
  })
})
