import { describe, expect, it } from 'vitest'
import {
  letterFontSizePx,
  shouldShowLetters,
  LETTER_VISIBILITY_ORDER,
  MIN_LETTER_CELL_PX,
} from './letterVisibility'

/** Tamaño de celda (px CSS) del caso reportado: un 4 × 41 al zoom que lo deja entrar entero. */
const FIT_ZOOM_CELL_PX = 12

describe('shouldShowLetters', () => {
  it('en automático, el 4 × 41 al zoom de ajuste conserva sus letras (el caso reportado)', () => {
    // Con el umbral viejo de 16px esto daba false y las letras desaparecían
    // sin explicación. Éste es el test que impide que vuelva a pasar.
    expect(shouldShowLetters('auto', FIT_ZOOM_CELL_PX)).toBe(true)
  })

  it('en automático se muestran desde el umbral y se ocultan bajo él', () => {
    expect(shouldShowLetters('auto', MIN_LETTER_CELL_PX)).toBe(true)
    expect(shouldShowLetters('auto', MIN_LETTER_CELL_PX + 20)).toBe(true)
    expect(shouldShowLetters('auto', MIN_LETTER_CELL_PX - 1)).toBe(false)
  })

  it('"siempre" las fuerza aunque las mostacillas queden muy chicas', () => {
    expect(shouldShowLetters('always', 4)).toBe(true)
    expect(shouldShowLetters('always', MIN_LETTER_CELL_PX - 1)).toBe(true)
  })

  it('"ocultas" las esconde aunque haya espacio de sobra', () => {
    expect(shouldShowLetters('never', 60)).toBe(false)
    expect(shouldShowLetters('never', MIN_LETTER_CELL_PX)).toBe(false)
  })

  it('el umbral automático quedó en el rango legible pedido (11–12px)', () => {
    expect(MIN_LETTER_CELL_PX).toBeGreaterThanOrEqual(11)
    expect(MIN_LETTER_CELL_PX).toBeLessThanOrEqual(12)
  })
})

describe('letterFontSizePx', () => {
  it('crece con la mostacilla en vez de quedarse fijo', () => {
    expect(letterFontSizePx(30)).toBeGreaterThan(letterFontSizePx(20))
    expect(letterFontSizePx(20)).toBeGreaterThan(letterFontSizePx(14))
  })

  it('la letra siempre cabe dentro de su mostacilla', () => {
    for (let cellPx = MIN_LETTER_CELL_PX; cellPx <= 120; cellPx++) {
      expect(letterFontSizePx(cellPx)).toBeLessThanOrEqual(cellPx)
    }
  })

  it('nunca baja de un tamaño legible, ni siquiera forzada a zoom mínimo', () => {
    for (const cellPx of [1, 4, 7.5, FIT_ZOOM_CELL_PX]) {
      expect(letterFontSizePx(cellPx)).toBeGreaterThanOrEqual(7)
    }
  })

  it('no se dispara en mostacillas grandes', () => {
    expect(letterFontSizePx(200)).toBeLessThanOrEqual(13)
  })
})

describe('LETTER_VISIBILITY_ORDER', () => {
  it('el ciclo del botón pasa por los tres estados y vuelve al principio', () => {
    expect(LETTER_VISIBILITY_ORDER).toEqual(['auto', 'always', 'never'])
  })
})
