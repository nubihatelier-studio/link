import { describe, expect, it } from 'vitest'
import { describeColor } from './colorName'

describe('describeColor — un nombre común, sin códigos de marca', () => {
  it.each([
    ['#ffffff', 'Blanco'],
    ['#1c1c1e', 'Negro'],
    ['#808080', 'Gris'],
    ['#c9a227', 'Dorado'],
    ['#e7d49a', 'Dorado claro'],
    ['#3547b0', 'Azul'],
    ['#9bb3e8', 'Azul claro'],
    ['#1e3378', 'Azul oscuro'],
    ['#0b1333', 'Azul muy oscuro'],
    ['#2f5b66', 'Turquesa oscuro'],
    ['#d94f4f', 'Rojo'],
    ['#6f8f5a', 'Verde'],
    ['#7a4a2a', 'Café'],
    ['#f2e6cf', 'Beige'],
    ['#8e5bb5', 'Morado'],
    ['#e58fb0', 'Rosado claro'],
  ])('%s se llama "%s"', (hex, name) => {
    expect(describeColor(hex)).toBe(name)
  })

  it('nunca devuelve un código de catálogo', () => {
    for (let i = 0; i < 400; i++) {
      const hex = `#${((i * 2654435761) >>> 8).toString(16).padStart(6, '0').slice(0, 6)}`
      expect(describeColor(hex)).not.toMatch(/DB|\d/)
    }
  })

  it('sólo usa letras que el PDF puede imprimir (WinAnsi)', () => {
    for (let i = 0; i < 400; i++) {
      const hex = `#${((i * 40503) & 0xffffff).toString(16).padStart(6, '0')}`
      expect(describeColor(hex)).toMatch(/^[A-Za-záéíóúñ ]+$/)
    }
  })
})
