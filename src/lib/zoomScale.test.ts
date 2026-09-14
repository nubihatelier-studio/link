import { describe, expect, it } from 'vitest'
import { MAX_ZOOM, MIN_ZOOM, sliderToZoom, ZOOM_SLIDER_STEPS, zoomToSlider } from './zoomScale'

describe('zoomScale — el deslizador de zoom', () => {
  it('los extremos del deslizador son los extremos del zoom', () => {
    expect(sliderToZoom(0)).toBe(MIN_ZOOM)
    expect(sliderToZoom(ZOOM_SLIDER_STEPS)).toBe(MAX_ZOOM)
    expect(zoomToSlider(MIN_ZOOM)).toBe(0)
    expect(zoomToSlider(MAX_ZOOM)).toBe(ZOOM_SLIDER_STEPS)
  })

  it('100% queda justo a la mitad: se acerca tanto como se aleja', () => {
    expect(zoomToSlider(100)).toBe(ZOOM_SLIDER_STEPS / 2)
  })

  it('ida y vuelta devuelve el mismo zoom, a lo más un punto de diferencia cerca de 400%', () => {
    for (let zoom = MIN_ZOOM; zoom <= MAX_ZOOM; zoom++) expect(Math.abs(sliderToZoom(zoomToSlider(zoom)) - zoom)).toBeLessThanOrEqual(1)
  })

  it('el mismo tramo de deslizador multiplica el zoom por lo mismo, cerca o lejos', () => {
    const tramo = 100
    const lejos = sliderToZoom(100 + tramo) / sliderToZoom(100)
    const cerca = sliderToZoom(800 + tramo) / sliderToZoom(800)
    expect(lejos).toBeCloseTo(cerca, 1)
  })

  it('un paso del deslizador nunca salta más de un punto de zoom', () => {
    for (let p = 0; p < ZOOM_SLIDER_STEPS; p++) expect(sliderToZoom(p + 1) - sliderToZoom(p)).toBeLessThanOrEqual(2)
  })

  it('fuera de rango se queda en los bordes', () => {
    expect(zoomToSlider(10)).toBe(0)
    expect(zoomToSlider(900)).toBe(ZOOM_SLIDER_STEPS)
    expect(sliderToZoom(-5)).toBe(MIN_ZOOM)
  })
})
