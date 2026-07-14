import { describe, expect, it } from 'vitest'
import type { MiyukiColor } from '@/data/colorTypes'
import { catalogMatchForHex, contrastTextColor, hexToRgb, nearestCatalogColor, rgbToHex } from './color'

describe('hexToRgb / rgbToHex', () => {
  it('round-trips a 6-digit hex', () => {
    expect(hexToRgb('#c9a227')).toEqual({ r: 0xc9, g: 0xa2, b: 0x27 })
    expect(rgbToHex({ r: 0xc9, g: 0xa2, b: 0x27 })).toBe('#c9a227')
  })

  it('expands 3-digit shorthand hex', () => {
    expect(hexToRgb('#fff')).toEqual({ r: 255, g: 255, b: 255 })
  })
})

describe('contrastTextColor', () => {
  it('picks white text for a dark fill', () => {
    expect(contrastTextColor('#1c1c1e')).toBe('#ffffff')
    expect(contrastTextColor('#000000')).toBe('#ffffff')
  })

  it('picks black text for a light fill', () => {
    expect(contrastTextColor('#ffffff')).toBe('#1c1c1e')
    expect(contrastTextColor('#f5f0e6')).toBe('#1c1c1e')
  })

  it('picks white text for the brand gold — its relative luminance reads as dark despite looking bright', () => {
    expect(contrastTextColor('#c9a227')).toBe('#ffffff')
  })
})

const FAKE_CATALOG: MiyukiColor[] = [
  { code: 'DB-01', hex: '#000000', name: 'Negro', sampled: true },
  { code: 'DB-02', hex: '#ffffff', name: 'Blanco', sampled: true },
  { code: 'DB-03', hex: '#c9a227', name: 'Dorado', sampled: true },
]

describe('catalogMatchForHex', () => {
  it('marks an exact catalog hex as exact', () => {
    const result = catalogMatchForHex('#c9a227', FAKE_CATALOG)
    expect(result.exact).toBe(true)
    expect(result.color.code).toBe('DB-03')
  })

  it('is case-insensitive for exact matches', () => {
    const result = catalogMatchForHex('#C9A227', FAKE_CATALOG)
    expect(result.exact).toBe(true)
    expect(result.color.code).toBe('DB-03')
  })

  it('falls back to the nearest catalog color and marks it inexact for a freehand hex', () => {
    const result = catalogMatchForHex('#111111', FAKE_CATALOG)
    expect(result.exact).toBe(false)
    expect(result.color.code).toBe('DB-01')
  })
})

describe('nearestCatalogColor', () => {
  it('picks the perceptually closest swatch, not just the closest by raw hex value', () => {
    // Near-white should match white, not the numerically "closer in one channel" gold.
    expect(nearestCatalogColor('#fafafa', FAKE_CATALOG).code).toBe('DB-02')
    expect(nearestCatalogColor('#0a0a0a', FAKE_CATALOG).code).toBe('DB-01')
  })
})
