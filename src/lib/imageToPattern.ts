import type { ColorMap, Technique } from '@/engine/types'
import type { MiyukiColor } from '@/data/colorTypes'
import { ALL_CATALOGS } from '@/data/catalog'
import { rowPitch } from '@/engine/geometry'
import { labToHex, nearestCatalogColor, rgbToLab, type RGB } from './color'
import { kMeansQuantize, mergeSimilarColors } from './quantize'

export interface ImageToPatternOptions {
  cols: number
  rows: number
  numColors: number
  catalog?: MiyukiColor[]
  /** CIEDE2000 threshold below which two quantized colors are merged as anti-aliasing artifacts of the same color. Passed straight to `mergeSimilarColors`. */
  mergeThreshold?: number
}

export interface ImageToPatternResult {
  cells: ColorMap
  /** Distinct Miyuki colors used, with how many cells got mapped to each — after merging near-duplicates. */
  palette: { color: MiyukiColor; count: number }[]
}

/**
 * Suggests a cols x rows grid that reproduces the photo's *physical* aspect
 * ratio once woven, not its raw pixel aspect ratio. A bead's cell is rarely
 * square (Miyuki Delica 11/0 is 1.6 x 1.3mm) and peyote/brick further
 * compact each row (see `rowPitch`), so a grid that merely copies the
 * photo's pixel ratio comes out visibly squashed or stretched once beaded —
 * this compensates so cols:rows matches width:height in real mm instead.
 */
export function suggestGridForImage(
  width: number,
  height: number,
  technique: Technique,
  beadWidthMm: number,
  beadHeightMm: number,
  maxSide = 60,
) {
  const photoRatio = width / height
  const adjustedRatio = photoRatio * ((rowPitch(technique) * beadHeightMm) / beadWidthMm)
  if (adjustedRatio >= 1) {
    const cols = maxSide
    const rows = Math.max(4, Math.round(maxSide / adjustedRatio))
    return { cols, rows }
  }
  const rows = maxSide
  const cols = Math.max(4, Math.round(maxSide * adjustedRatio))
  return { cols, rows }
}

/**
 * Pixelates `image` down to a cols x rows grid, reduces it to `numColors`
 * dominant colors via k-means (in Lab space), merges any that are
 * perceptually indistinguishable (CIEDE2000, typically anti-aliasing
 * artifacts along a flat region's edge — see `mergeSimilarColors`), then
 * maps each surviving color to the closest catalog swatch. Result is a
 * fully editable cell color map — nothing here is final, the user can
 * repaint any cell.
 */
export function imageToPattern(
  image: HTMLImageElement | ImageBitmap,
  { cols, rows, numColors, catalog = ALL_CATALOGS, mergeThreshold }: ImageToPatternOptions,
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
  const merged = mergeSimilarColors(centroids, counts, mergeThreshold)
  const centroidLabs = pixels.map((p) => rgbToLab(p))

  // Map each surviving centroid to the nearest catalog color once (not per-pixel).
  const centroidToCatalog = merged.centroids.map((c) => nearestCatalogColor(labToHex(c), catalog))

  const cells: ColorMap = {}
  const paletteCounts = new Map<string, number>()

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const i = row * cols + col
      let best = 0
      let bestDist = Infinity
      for (let c = 0; c < merged.centroids.length; c++) {
        const d = sqDist(centroidLabs[i], merged.centroids[c])
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

  return { cells, palette }
}

function sqDist(a: { l: number; a: number; b: number }, b: { l: number; a: number; b: number }): number {
  const dl = a.l - b.l
  const da = a.a - b.a
  const db = a.b - b.b
  return dl * dl + da * da + db * db
}
