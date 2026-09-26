import { describe, expect, it } from 'vitest'
import { calcularAnillo, calcularPulsera, diametroAnillo } from './sizeGuide'

describe('calcularPulsera', () => {
  it('suma la holgura a la muñeca', () => {
    expect(calcularPulsera(16, 1.5)).toEqual({ grupo: 'mujer', talla: 'XS', largoPulsera: 17.5 })
  })

  it('bajo 16 cm busca en la tabla de niños', () => {
    expect(calcularPulsera(12.4, 0.5)?.grupo).toBe('ninos')
    expect(calcularPulsera(12.4, 0.5)?.talla).toBe('1 año')
  })

  it('desde 20,9 cm es talla de hombre', () => {
    expect(calcularPulsera(22.2, 1.5)).toEqual({ grupo: 'hombre', talla: 'M', largoPulsera: 23.7 })
  })

  it('una talla con rango se compara con su medio', () => {
    // S va de 16,5 a 17: 16,8 está más cerca de S que de XS o M.
    expect(calcularPulsera(16.8, 0.5)?.talla).toBe('S')
  })

  it('sin medida no hay resultado', () => {
    expect(calcularPulsera(0, 1.5)).toBeNull()
    expect(calcularPulsera(Number.NaN, 1.5)).toBeNull()
  })
})

describe('calcularAnillo', () => {
  it('una medida exacta da su talla', () => {
    expect(calcularAnillo(5.7)).toEqual({ talla: 8, diametro: 1.81, entreTallas: false })
  })

  it('entre dos tallas sugiere la mayor', () => {
    expect(calcularAnillo(5.5)).toEqual({ talla: 8, diametro: 1.75, entreTallas: true })
  })

  it('más grande que la 13 no tiene talla', () => {
    expect(calcularAnillo(7.5)?.talla).toBeNull()
  })

  it('el diámetro de la talla 7 es contorno ÷ π', () => {
    expect(diametroAnillo(5.4)).toBe(1.72)
  })
})
