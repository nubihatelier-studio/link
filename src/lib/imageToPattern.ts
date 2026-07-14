import type { ColorMap } from '@/engine/types'
import type { MiyukiColor } from '@/data/colorTypes'
import { ALL_CATALOGS } from '@/data/catalog'
import { labToHex, nearestCatalogColor, rgbToLab, type RGB } from './color'
import { kMeansQuantize } from './quantize'

export interface ImageToPatternOptions {
  cols: number
  rows: number
  numColors: number
  catalog?: MiyukiColor[]
}

export interface ImageToPatternResult {
  cells: ColorMap
  /** Distinct Miyuki colors used, with how many cells got mapped to each. */
  palette: { color: MiyukiColor; count: number }[]
}

/** Suggests a cols x rows grid that keeps the photo's aspect ratio, capped to a max side. */
export function suggestGridForImage(width: number, height: number, maxSide = 60) {
  const ratio = width / height
  if (ratio >= 1) {
    const cols = maxSide
    const rows = Math.max(4, Math.round(maxSide / ratio))
    return { cols, rows }
  }
  const rows = maxSide
  const cols = Math.max(4, Math.round(maxSide * ratio))
  return { cols, rows }
}

/**
 * Pixelates `image` down to a cols x rows grid, reduces it to `numColors`
 * dominant colors via k-means (in Lab space), then maps each dominant color
 * to the closest catalog swatch (Lab distance). Result is a fully editable
 * cell color map — nothing here is final, the user can repaint any cell.
 */
export function imageToPattern(
  image: HTMLImageElement | ImageBitmap,
  { cols, rows, numColors, catalog = ALL_CATALOGS }: ImageToPatternOptions,
): ImageToPatternResult {
  const canvas = document.createElement('canvas')
  canvas.width = cols
  canvas.height = rows
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas 2D no disponible')

  ctx.imageSmoothingEnabled = true
  ctx.drawImage(image, 0, 0, cols, rows)
  const { data } = ctx.getImageData(0, 0, cols, rows)

  const pixels: RGB[] = []
  for (let i = 0; i < cols * rows; i++) {
    const o = i * 4
    pixels.push({ r: data[o], g: data[o + 1], b: data[o + 2] })
  }

  const { centroids, counts } = kMeansQuantize(pixels, numColors)
  const centroidLabs = pixels.map((p) => rgbToLab(p))

  // Map each centroid to the nearest catalog color once (not per-pixel).
  const centroidToCatalog = centroids.map((c) => nearestCatalogColor(labToHex(c), catalog))

  const cells: ColorMap = {}
  const paletteCounts = new Map<string, number>()

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const i = row * cols + col
      let best = 0
      let bestDist = Infinity
      for (let c = 0; c < centroids.length; c++) {
        const d = sqDist(centroidLabs[i], centroids[c])
        if (d < bestDist) {
          bestDist = d
          best = c
        }
      }
      const matched = centroidToCatalog[best]
      cells[`${row},${col}`] = matched.hex
      paletteCounts.set(matched.code, (paletteCounts.get(matched.code) ?? 0) + 1)
    }
  }

  const palette = Array.from(paletteCounts.entries())
    .map(([code, count]) => ({ color: catalog.find((c) => c.code === code)!, count }))
    .sort((a, b) => b.count - a.count)

  // counts (per k-means cluster) currently unused beyond debugging; kept for future palette preview.
  void counts

  return { cells, palette }
}

function sqDist(a: { l: number; a: number; b: number }, b: { l: number; a: number; b: number }): number {
  const dl = a.l - b.l
  const da = a.a - b.a
  const db = a.b - b.b
  return dl * dl + da * da + db * db
}
