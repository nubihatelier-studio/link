import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { useEditorStore } from '@/store/editorStore'
import { sliderToZoom, zoomToSlider } from '@/lib/zoomScale'
import { t } from '@/i18n/es'
import { ZoomBar } from './ZoomBar'

beforeEach(() => useEditorStore.setState({ zoom: 100, fitZoomRequest: 0 }))
const zoom = () => useEditorStore.getState().zoom

describe('ZoomBar — acercar y alejar con precisión', () => {
  it('el deslizador parte donde está el zoom y lo mueve de a poco', () => {
    render(<ZoomBar />)
    const slider = screen.getByRole('slider', { name: 'Zoom' }) as HTMLInputElement
    expect(Number(slider.value)).toBe(zoomToSlider(100))

    fireEvent.change(slider, { target: { value: String(zoomToSlider(100) + 10) } })
    expect(zoom()).toBe(sliderToZoom(zoomToSlider(100) + 10))
    expect(zoom()).toBeGreaterThan(100)
    expect(zoom()).toBeLessThan(110)
    expect(screen.getByText(`${zoom()}%`)).toBeInTheDocument()
  })

  it('"Ajustar a pantalla" le pide el encuadre al canvas, que es el que sabe cuánto espacio hay', () => {
    render(<ZoomBar />)
    fireEvent.click(screen.getByRole('button', { name: t.editor.fitToScreen }))
    expect(useEditorStore.getState().fitZoomRequest).toBe(1)
    // Pedirlo dos veces seguidas tiene que volver a encuadrar, no quedar mudo.
    fireEvent.click(screen.getByRole('button', { name: t.editor.fitToScreen }))
    expect(useEditorStore.getState().fitZoomRequest).toBe(2)
    expect(zoom()).toBe(100) // el zoom lo pone el canvas, no la barra
  })

  it('− y + saltan de a 25, como el teclado, sin salirse del rango', () => {
    render(<ZoomBar />)
    fireEvent.click(screen.getByRole('button', { name: 'Acercar' }))
    expect(zoom()).toBe(125)
    fireEvent.click(screen.getByRole('button', { name: 'Alejar' }))
    fireEvent.click(screen.getByRole('button', { name: 'Alejar' }))
    fireEvent.click(screen.getByRole('button', { name: 'Alejar' }))
    fireEvent.click(screen.getByRole('button', { name: 'Alejar' }))
    expect(zoom()).toBe(25)
  })
})
