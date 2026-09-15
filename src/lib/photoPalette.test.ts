import { describe, expect, it } from 'vitest'
import { paletteFromPixels, suggestPhotoColorCount } from './photoPalette'
import type { RGB } from './color'

/** Una "foto": bloques de color con luz y sombra (el mismo color, más claro y más oscuro). */
function photo(blocks: { rgb: RGB; n: number }[]): RGB[] {
  const out: RGB[] = []
  for (const { rgb, n } of blocks) {
    for (let i = 0; i < n; i++) {
      const light = (i % 5) - 2 // -2..2: sombra a luz
      out.push({ r: rgb.r + light * 6, g: rgb.g + light * 6, b: rgb.b + light * 6 })
    }
  }
  return out
}

const ROSADO = { r: 220, g: 120, b: 160 }
const VERDE = { r: 60, g: 130, b: 70 }
const AMARILLO = { r: 235, g: 205, b: 70 }
const FONDO = { r: 245, g: 243, b: 238 }

describe('paleta desde una foto', () => {
  it('cuenta los colores que la foto tiene de verdad, sin separar luz y sombra', () => {
    const pixels = photo([{ rgb: FONDO, n: 900 }, { rgb: ROSADO, n: 500 }, { rgb: VERDE, n: 400 }, { rgb: AMARILLO, n: 200 }])
    expect(suggestPhotoColorCount(pixels)).toBe(4)
  })

  it('devuelve los colores principales, del que más ocupa al que menos', () => {
    const pixels = photo([{ rgb: FONDO, n: 900 }, { rgb: ROSADO, n: 500 }, { rgb: VERDE, n: 400 }, { rgb: AMARILLO, n: 200 }])
    const palette = paletteFromPixels(pixels, 4)
    expect(palette).toHaveLength(4)
    expect(palette.map((c) => c.share)).toEqual(palette.map((c) => c.share).sort((a, b) => b - a))
    expect(palette.reduce((a, c) => a + c.share, 0)).toBeCloseTo(1, 5)
    // El fondo es lo más grande: aparece primero, para descartarlo fácil.
    expect(palette[0].share).toBeCloseTo(900 / 2000, 1)
  })

  it('nunca pasa de 12 ni baja de 2, y una foto vacía no da colores', () => {
    const many = Array.from({ length: 2000 }, (_, i) => ({ r: (i * 37) % 256, g: (i * 91) % 256, b: (i * 17) % 256 }))
    expect(paletteFromPixels(many, 40).length).toBeLessThanOrEqual(12)
    expect(suggestPhotoColorCount(photo([{ rgb: ROSADO, n: 100 }]))).toBe(2)
    expect(paletteFromPixels([], 5)).toEqual([])
  })
})
