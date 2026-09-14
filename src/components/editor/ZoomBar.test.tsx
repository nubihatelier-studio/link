import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { useEditorStore } from '@/store/editorStore'
import { sliderToZoom, zoomToSlider } from '@/lib/zoomScale'
import { ZoomBar } from './ZoomBar'

beforeEach(() => useEditorStore.setState({ zoom: 100 }))
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
