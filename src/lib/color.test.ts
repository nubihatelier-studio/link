import { describe, expect, it } from 'vitest'
import type { MiyukiColor } from '@/data/colorTypes'
import { catalogMatchForHex, contrastTextColor, deltaE2000, hexToRgb, nearestCatalogColor, rgbToHex } from './color'

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

describe('deltaE2000', () => {
  it('is zero for identical colors', () => {
    expect(deltaE2000({ l: 50, a: 20, b: -30 }, { l: 50, a: 20, b: -30 })).toBe(0)
  })

  it('is symmetric', () => {
    const a = { l: 40, a: 10, b: 15 }
    const b = { l: 60, a: -5, b: 25 }
    expect(deltaE2000(a, b)).toBeCloseTo(deltaE2000(b, a), 10)
  })

  it('black to white is exactly 100 (achromatic: reduces to |dL|/Sl with Sl=1 at Lbar=50)', () => {
    expect(deltaE2000({ l: 0, a: 0, b: 0 }, { l: 100, a: 0, b: 0 })).toBeCloseTo(100, 6)
  })

  it('matches a hand-derived achromatic case (L 50->60, a=b=0)', () => {
    // Achromatic (C1=C2=0) collapses CIEDE2000 to dE00 = dL / Sl, Sl = 1 + 0.015*(Lbar-50)^2/sqrt(20+(Lbar-50)^2).
    // Lbar=55 -> Sl = 1 + 0.015*25/sqrt(45) = 1.0559004...; dE00 = 10/Sl.
    expect(deltaE2000({ l: 50, a: 0, b: 0 }, { l: 60, a: 0, b: 0 })).toBeCloseTo(9.470579, 5)
  })

  // Reference pairs from Sharma, Wu & Dalal (2005), "The CIEDE2000 Color-Difference
  // Formula: Implementation Notes, Supplementary Test Data, and Mathematical Observations".
  it('matches the published CIEDE2000 reference test pairs', () => {
    expect(deltaE2000({ l: 50, a: 2.6772, b: -79.7751 }, { l: 50, a: 0, b: -82.7485 })).toBeCloseTo(2.0425, 3)
    expect(deltaE2000({ l: 50, a: 3.1571, b: -77.2803 }, { l: 50, a: 0, b: -82.7485 })).toBeCloseTo(2.8615, 3)
  })

  it('ranks a small perturbation as closer than a large one', () => {
    const base = { l: 50, a: 20, b: 20 }
    const near = { l: 51, a: 21, b: 20 }
    const far = { l: 70, a: -20, b: 40 }
    expect(deltaE2000(base, near)).toBeLessThan(deltaE2000(base, far))
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
