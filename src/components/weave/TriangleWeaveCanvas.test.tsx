import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { t } from '@/i18n/es'
import { TriangleWeaveCanvas } from './TriangleWeaveCanvas'

// jsdom no tiene canvas de verdad (`getContext('2d')` devuelve null), así que
// acá se verifica que se arme y responda al toque; el dibujo se revisó a mano
// en el navegador, igual que en `WeaveCanvas`.
function renderCanvas(props: Partial<Parameters<typeof TriangleWeaveCanvas>[0]> = {}) {
  const onTapNext = vi.fn()
  render(
    <TriangleWeaveCanvas
      rounds={5}
      pointingUp
      cells={{}}
      currentIndex={-1}
      onTapNext={onTapNext}
      tapAnywhere={false}
      {...props}
    />,
  )
  return { onTapNext }
}

describe('TriangleWeaveCanvas', () => {
  it('se arma sin romperse y se anuncia como el triángulo', () => {
    renderCanvas()
    expect(screen.getByRole('img', { name: t.weave.triangleCanvasLabel })).toBeTruthy()
  })

  it('con "tocar en cualquier parte" apagado, sólo el lienzo avanza', () => {
    const { onTapNext } = renderCanvas()
    fireEvent.click(screen.getByRole('img', { name: t.weave.triangleCanvasLabel }))
    expect(onTapNext).toHaveBeenCalledTimes(1)
  })

  it('con "tocar en cualquier parte" encendido, toda el área avanza', () => {
    const { onTapNext } = renderCanvas({ tapAnywhere: true })
    fireEvent.click(screen.getByRole('img', { name: t.weave.triangleCanvasLabel }).parentElement!)
    expect(onTapNext).toHaveBeenCalledTimes(1)
  })

  it('aguanta una pieza recién terminada, sin paso siguiente', () => {
    expect(() => renderCanvas({ rounds: 3, currentIndex: 999 })).not.toThrow()
  })

  it('aguanta una pieza sin vueltas', () => {
    expect(() => renderCanvas({ rounds: 0 })).not.toThrow()
  })
})
