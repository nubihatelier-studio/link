import { ALL_CATALOGS } from '@/data/catalog'
import type { MiyukiColor } from '@/data/colorTypes'

export interface RGB {
  r: number
  g: number
  b: number
}

export interface Lab {
  l: number
  a: number
  b: number
}

export function hexToRgb(hex: string): RGB {
  const clean = hex.replace('#', '')
  const full = clean.length === 3 ? clean.split('').map((c) => c + c).join('') : clean
  const num = parseInt(full, 16)
  return { r: (num >> 16) & 255, g: (num >> 8) & 255, b: num & 255 }
}

/** WCAG relative luminance, used to pick a legible letter/text color for a given fill. */
export function relativeLuminance(hex: string): number {
  const { r, g, b } = hexToRgb(hex)
  const lin = (v: number) => {
    const c = v / 255
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
  }
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
}

/** Black or white, whichever reads clearly on top of the given fill color. */
export function contrastTextColor(hex: string): string {
  return relativeLuminance(hex) > 0.4 ? '#1c1c1e' : '#ffffff'
}

export function rgbToHex({ r, g, b }: RGB): string {
  const toHex = (v: number) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`
}

export interface HSV {
  h: number // 0-360
  s: number // 0-1
  v: number // 0-1
}

/** Used by the interactive saturation/value square + hue slider color picker. */
export function rgbToHsv({ r, g, b }: RGB): HSV {
  const rn = r / 255
  const gn = g / 255
  const bn = b / 255
  const max = Math.max(rn, gn, bn)
  const min = Math.min(rn, gn, bn)
  const delta = max - min

  let h = 0
  if (delta !== 0) {
    if (max === rn) h = 60 * (((gn - bn) / delta) % 6)
    else if (max === gn) h = 60 * ((bn - rn) / delta + 2)
    else h = 60 * ((rn - gn) / delta + 4)
  }
  if (h < 0) h += 360

  const s = max === 0 ? 0 : delta / max
  const v = max

  return { h, s, v }
}

export function hsvToRgb({ h, s, v }: HSV): RGB {
  const c = v * s
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
  const m = v - c

  let [r, g, b] = [0, 0, 0]
  if (h < 60) [r, g, b] = [c, x, 0]
  else if (h < 120) [r, g, b] = [x, c, 0]
  else if (h < 180) [r, g, b] = [0, c, x]
  else if (h < 240) [r, g, b] = [0, x, c]
  else if (h < 300) [r, g, b] = [x, 0, c]
  else [r, g, b] = [c, 0, x]

  return { r: (r + m) * 255, g: (g + m) * 255, b: (b + m) * 255 }
}

export function hexToHsv(hex: string): HSV {
  return rgbToHsv(hexToRgb(hex))
}

export function hsvToHex(hsv: HSV): string {
  return rgbToHex(hsvToRgb(hsv))
}

function srgbToLinear(c: number): number {
  const v = c / 255
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)
}

/** CIE D65 reference white, sRGB -> XYZ -> Lab. Used for perceptual color matching. */
export function rgbToLab({ r, g, b }: RGB): Lab {
  const lr = srgbToLinear(r)
  const lg = srgbToLinear(g)
  const lb = srgbToLinear(b)

  const x = lr * 0.4124564 + lg * 0.3575761 + lb * 0.1804375
  const y = lr * 0.2126729 + lg * 0.7151522 + lb * 0.072175
  const z = lr * 0.0193339 + lg * 0.119192 + lb * 0.9503041

  const xn = 0.95047
  const yn = 1.0
  const zn = 1.08883

  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116)

  const fx = f(x / xn)
  const fy = f(y / yn)
  const fz = f(z / zn)

  return {
    l: 116 * fy - 16,
    a: 500 * (fx - fy),
    b: 200 * (fy - fz),
  }
}

export function hexToLab(hex: string): Lab {
  return rgbToLab(hexToRgb(hex))
}

function linearToSrgb(c: number): number {
  const v = c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055
  return Math.max(0, Math.min(255, v * 255))
}

/** Inverse of rgbToLab — used to preview k-means cluster centroids as real colors. */
export function labToRgb({ l, a, b }: Lab): RGB {
  const fy = (l + 16) / 116
  const fx = fy + a / 500
  const fz = fy - b / 200

  const fInv = (t: number) => (t ** 3 > 0.008856 ? t ** 3 : (t - 16 / 116) / 7.787)

  const xn = 0.95047
  const yn = 1.0
  const zn = 1.08883

  const x = fInv(fx) * xn
  const y = fInv(fy) * yn
  const z = fInv(fz) * zn

  const lr = x * 3.2404542 + y * -1.5371385 + z * -0.4985314
  const lg = x * -0.969266 + y * 1.8760108 + z * 0.041556
  const lb = x * 0.0556434 + y * -0.2040259 + z * 1.0572252

  return {
    r: linearToSrgb(lr),
    g: linearToSrgb(lg),
    b: linearToSrgb(lb),
  }
}

export function labToHex(lab: Lab): string {
  return rgbToHex(labToRgb(lab))
}

/** Euclidean distance in Lab space (CIE76 deltaE) — good enough for nearest-swatch matching. */
export function deltaE(a: Lab, b: Lab): number {
  const dl = a.l - b.l
  const da = a.a - b.a
  const db = a.b - b.b
  return Math.sqrt(dl * dl + da * da + db * db)
}

const catalogLabCache = new Map<string, Lab>()
function labFor(color: MiyukiColor): Lab {
  let lab = catalogLabCache.get(color.code)
  if (!lab) {
    lab = hexToLab(color.hex)
    catalogLabCache.set(color.code, lab)
  }
  return lab
}

/** Finds the closest catalog color to an arbitrary RGB/hex, using perceptual (Lab) distance. */
export function nearestCatalogColor(hex: string, catalog: MiyukiColor[] = ALL_CATALOGS): MiyukiColor {
  const target = hexToLab(hex)
  let best = catalog[0]
  let bestDist = Infinity
  for (const color of catalog) {
    const dist = deltaE(target, labFor(color))
    if (dist < bestDist) {
      bestDist = dist
      best = color
    }
  }
  return best
}

const exactHexIndex = new Map<string, MiyukiColor>()
function buildExactIndex(catalog: MiyukiColor[]) {
  if (exactHexIndex.size > 0) return
  for (const c of catalog) exactHexIndex.set(c.hex.toLowerCase(), c)
}

/**
 * Resolves a hex to a catalog color: an exact swatch match if the hex came
 * straight from the catalog, otherwise the nearest one (marked `exact: false`)
 * so callers (palette list, PDF legend) can show "~ DB-xx" for freehand colors.
 */
export function catalogMatchForHex(
  hex: string,
  catalog: MiyukiColor[] = ALL_CATALOGS,
): { color: MiyukiColor; exact: boolean } {
  buildExactIndex(catalog)
  const exact = exactHexIndex.get(hex.toLowerCase())
  if (exact) return { color: exact, exact: true }
  return { color: nearestCatalogColor(hex, catalog), exact: false }
}
