import { labToHex, type RGB } from './color'
import { countDistinctColors } from './imageToPattern'
import { kMeansQuantize, mergeSimilarColors } from './quantize'

/** A color found in a photo, and how much of the photo it covers (0–1). */
export interface PhotoColor {
  hex: string
  share: number
}

/** Most colors a photo palette offers — past this it stops being a palette to buy beads from. */
export const MAX_PHOTO_COLORS = 12
export const MIN_PHOTO_COLORS = 2

/**
 * Two photo colors this close (CIEDE2000) are the same color under different
 * light. Wider than the default 6: a photo's shading splits one bead color
 * into a light and a dark cluster far more than a drawn chart does.
 */
const PHOTO_MERGE_THRESHOLD = 10
/**
 * After asking for a number of colors, only near-identical clusters are
 * merged — the weaver asked for that many, so distinct shades stay distinct.
 */
const REQUESTED_MERGE_THRESHOLD = 4

/** How many colors to open with: the ones the photo really has, counted — see `countDistinctColors`. */
export function suggestPhotoColorCount(pixels: RGB[]): number {
  return Math.max(MIN_PHOTO_COLORS, countDistinctColors(pixels, PHOTO_MERGE_THRESHOLD, MAX_PHOTO_COLORS))
}

/**
 * The main colors of a photo, biggest first: k-means over the pixels in Lab
 * (so "close" means close to the eye), near-identical clusters merged.
 */
export function paletteFromPixels(pixels: RGB[], count: number): PhotoColor[] {
  if (pixels.length === 0) return []
  const k = Math.max(MIN_PHOTO_COLORS, Math.min(MAX_PHOTO_COLORS, count))
  const { centroids, counts } = kMeansQuantize(pixels, k)
  const merged = mergeSimilarColors(centroids, counts, REQUESTED_MERGE_THRESHOLD)
  const total = merged.counts.reduce((a, b) => a + b, 0) || 1
  const seen = new Set<string>()
  return merged.centroids
    .map((lab, i) => ({ hex: labToHex(lab), share: merged.counts[i] / total }))
    .sort((a, b) => b.share - a.share)
    .filter((c) => (seen.has(c.hex) ? false : (seen.add(c.hex), true)))
}

/** Below this opacity a pixel is the empty background of a PNG, not part of the picture. */
const MIN_VISIBLE_ALPHA = 20

/**
 * A photo's pixels as they look on screen. A PNG can carry colour that's
 * partly see-through — a red at 30% reads as pink over the white it's shown
 * on — and its raw RGB is the red, not the pink. Reading it raw used to turn
 * a pink cap drawn that way into "Rojo 99%" (and pixels under 50% were
 * dropped outright). So each pixel is blended over white, the way the photo
 * preview itself shows it; only the nearly invisible ones are left out.
 */
export function visiblePixels(data: ArrayLike<number>): RGB[] {
  const pixels: RGB[] = []
  for (let i = 0; i + 3 < data.length; i += 4) {
    const alpha = data[i + 3]
    if (alpha < MIN_VISIBLE_ALPHA) continue
    const a = alpha / 255
    const over = (c: number) => Math.round(c * a + 255 * (1 - a))
    pixels.push({ r: over(data[i]), g: over(data[i + 1]), b: over(data[i + 2]) })
  }
  return pixels
}

/** The longest side a photo is shrunk to before its colors are counted — plenty for a palette, and fast on a phone. */
const SAMPLE_SIDE = 160

/** Reads a photo's pixels, shrunk to `SAMPLE_SIDE`. The photo never leaves the device. */
export function readPhotoPixels(file: Blob): Promise<{ pixels: RGB[]; url: string }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      const scale = Math.min(1, SAMPLE_SIDE / Math.max(img.width, img.height))
      const w = Math.max(1, Math.round(img.width * scale))
      const h = Math.max(1, Math.round(img.height * scale))
      const canvas = document.createElement('canvas')
      canvas.width = w
      canvas.height = h
      const ctx = canvas.getContext('2d')
      if (!ctx) {
        reject(new Error('Canvas 2D no disponible'))
        return
      }
      ctx.drawImage(img, 0, 0, w, h)
      const { data } = ctx.getImageData(0, 0, w, h)
      resolve({ pixels: visiblePixels(data), url })
    }
    img.onerror = () => reject(new Error('No se pudo leer la imagen'))
    img.src = url
  })
}
