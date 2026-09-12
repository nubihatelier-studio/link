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
  /**
   * A bead grid found in the image (see `detectBeadGrid`). When given, each
   * cell is read from the centre of its bead instead of from an averaged
   * rectangle — the difference between reproducing a chart and blurring it.
   */
  grid?: BeadGrid | null
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
 * The strongest repeating period in a 1-D profile, by autocorrelation — the
 * bead pitch, when the profile is the image's edge energy along one axis.
 * Peak-picking doesn't survive a real chart (every bead outline produces two
 * peaks, one per side, and JPEG noise adds more); correlating the profile
 * against shifted copies of itself does, because it scores the whole profile
 * at once.
 *
 * Two things it has to get right, both learned the hard way on a real chart:
 *
 * It correlates the profile's **slope**, not the profile itself. Anything
 * smooth — a lighting gradient, a vignette, a plain background ramp —
 * correlates near-perfectly at every lag and would sail past any threshold;
 * its slope, though, is flat, and scores nothing. A bead grid's slope is a
 * train of spikes that still repeats at the bead pitch. (Subtracting a moving
 * average first isn't enough on its own: it leaves smooth residue at both ends
 * of the profile, which still scored 0.99 on a pure ramp.)
 *
 * And among lags that score alike it returns the **smallest**, because every
 * multiple of the true pitch correlates just as well — taking the strongest
 * outright picked 34px on a 17px chart, halving the column count.
 *
 * The period comes back fractional. A real pitch rarely lands on a whole
 * number of pixels, and rounding it is not harmless: this chart's rows are
 * 10.8px apart, which split the peak between lag 10 (0.499) and lag 11
 * (0.495) — taking the winner gave 87 rows instead of 81, and the sampling
 * points drifted between rows until the diamonds came out fat. The fraction is
 * recovered from the harmonics, where the same error is divided by n.
 *
 * `strength` is not the raw correlation but how far the winning lag rises
 * above the **trough beside it** — correlation alone can't tell "smooth" from
 * "periodic", and neither can comparing against the average or against the
 * lag next door. Three profiles, measured:
 *
 *   ramp        … 0.929, 0.911, 0.892 …    decays smoothly; no trough at all
 *   clean grid  … 0, -0.505, 1.0, -0.495 … a one-pixel spike
 *   real chart  … 0.072, 0.482, 0.519, 0.074 … a peak two pixels wide, sitting
 *                                          on troughs of about -0.23
 *
 * The real chart is why the neighbour has to be the trough and not the lag
 * next door: a bead outline is a couple of pixels thick, so its peak is broad,
 * and peak-minus-neighbour came out at 0.06 — rejecting the very charts this
 * is for. Against the trough halfway to the next multiple it scores ~0.75,
 * while the ramp still scores nothing. Below `MIN_GRID_STRENGTH` there's no
 * grid — the case for a photo of a finished, curved piece.
 */
export function dominantPeriod(profile: number[], minPeriod: number, maxPeriod: number): { period: number; strength: number } {
  const hi = Math.floor(maxPeriod)
  const lo = Math.max(2, Math.floor(minPeriod))
  if (hi < lo || profile.length < lo * 2) return { period: 0, strength: 0 }
  const centred = slopeOf(detrend(profile, hi))
  const scores: { period: number; strength: number }[] = []
  for (let lag = lo; lag <= hi; lag++) {
    let num = 0
    let a = 0
    let b = 0
    for (let i = 0; i + lag < centred.length; i++) {
      num += centred[i] * centred[i + lag]
      a += centred[i] * centred[i]
      b += centred[i + lag] * centred[i + lag]
    }
    const denom = Math.sqrt(a * b)
    scores.push({ period: lag, strength: denom > 1e-9 ? num / denom : 0 })
  }
  const best = scores.reduce((m, s) => (s.strength > m.strength ? s : m), { period: 0, strength: 0 })
  if (best.strength <= 0) return { period: 0, strength: 0 }
  // The fundamental, not one of its multiples — see the note above.
  const fundamental = scores.find((s) => s.strength >= best.strength * FUNDAMENTAL_MARGIN) ?? best
  return {
    period: refinePeriod(scores, fundamental.period),
    strength: Math.max(0, fundamental.strength - troughBeside(scores, fundamental.period)),
  }
}

/** Within this much of the best score, a shorter period is taken to be the real one. */
const FUNDAMENTAL_MARGIN = 0.9

/**
 * The fractional pitch behind an integer peak. The n-th harmonic sits at n
 * times the true pitch, so dividing its (interpolated) position by n recovers
 * the fraction with n times the precision — 21.5px at the 2nd harmonic says
 * 10.75, where the fundamental could only say "10 or 11".
 */
function refinePeriod(scores: { period: number; strength: number }[], period: number): number {
  const interpolate = (around: number) => {
    const i = scores.findIndex((s) => s.period === around)
    if (i <= 0 || i >= scores.length - 1) return around
    // Parabolic interpolation through the peak and its two shoulders.
    const [a, b, c] = [scores[i - 1].strength, scores[i].strength, scores[i + 1].strength]
    const denom = a - 2 * b + c
    if (Math.abs(denom) < 1e-9) return around
    return around + (0.5 * (a - c)) / denom
  }
  let best = interpolate(period)
  for (const n of [3, 2]) {
    const target = Math.round(period * n)
    const harmonic = scores.find((s) => s.period === target)
    if (!harmonic || harmonic.strength < 0.2) continue
    const refined = interpolate(target) / n
    // Only trust the harmonic if it agrees with the fundamental to within half a pixel.
    if (Math.abs(refined - best) < 0.5) return refined
  }
  return best
}

/**
 * The lowest score between this period and half-way to its next multiple —
 * the floor a genuine peak rises from. Smooth drift has no such floor: its
 * curve only decays, so peak-minus-trough lands near zero.
 */
function troughBeside(scores: { period: number; strength: number }[], period: number): number {
  const from = scores.findIndex((s) => s.period === period)
  if (from < 0) return 0
  const until = scores.findIndex((s) => s.period >= period * 1.5)
  const window = scores.slice(from + 1, until < 0 ? scores.length : until + 1)
  if (window.length === 0) return scores[Math.max(0, from - 1)]?.strength ?? 0
  return Math.min(...window.map((s) => s.strength))
}

/**
 * Point-to-point slope, mean-centred: what separates a grid from anything
 * smooth. Flat for a ramp, spiky and periodic for a row of beads.
 */
function slopeOf(values: number[]): number[] {
  const out: number[] = []
  for (let i = 1; i < values.length; i++) out.push(values[i] - values[i - 1])
  const mean = out.reduce((a, b) => a + b, 0) / (out.length || 1)
  return out.map((v) => v - mean)
}

/**
 * Removes the slow drift from a profile (a lighting gradient, a vignette) by
 * subtracting a moving average, so the slope above is driven by the beads
 * rather than by the drift.
 */
function detrend(profile: number[], window: number): number[] {
  const w = Math.max(2, Math.round(window))
  const out: number[] = []
  for (let i = 0; i < profile.length; i++) {
    let sum = 0
    let n = 0
    for (let j = Math.max(0, i - w); j <= Math.min(profile.length - 1, i + w); j++) {
      sum += profile[j]
      n++
    }
    out.push(profile[i] - sum / n)
  }
  return out
}

/**
 * Where the first bead starts, given the pitch: the offset whose sampling
 * points land on bead centres rather than on the outlines between them.
 * Scored by `costAt`, which should return how *mixed* the colour is around a
 * point — a centre is flat, an edge is not. Half a bead off is the difference
 * between reading a chart and reading its gridlines, which is what turned a
 * gold bead into grey.
 */
export function bestPhase(pitch: number, costAt: (offset: number) => number, steps = 12): number {
  let best = { offset: 0, cost: Infinity }
  for (let i = 0; i < steps; i++) {
    const offset = (pitch * i) / steps
    const cost = costAt(offset)
    if (cost < best.cost) best = { offset, cost }
  }
  return best.offset
}

/** A bead grid found in an image: where it starts, how far apart the beads are, and how many there are. */
export interface BeadGrid {
  x0: number
  y0: number
  pitchX: number
  pitchY: number
  cols: number
  rows: number
  /** Autocorrelation strength of the weaker axis (0-1) — see `MIN_GRID_STRENGTH`. */
  strength: number
}

/** Below this, the image has no regular bead grid (a photo of a curved piece, a drawing, a gradient). */
export const MIN_GRID_STRENGTH = 0.35
/** A chart photographed or exported this small has no readable beads; and past this many, it's not a bead chart. */
const MIN_BEAD_PITCH_PX = 4
const MAX_BEADS_PER_SIDE = 120
/**
 * A bead grid repeats many times across an image; anything smooth can fake one
 * strong peak at some huge period — a gradient with a blob on it scored 0.63
 * as a "4 x 4 grid". Demanding a real run of repetitions is what separates the
 * two, and no chart worth importing is under this many beads a side.
 */
const MIN_BEADS_PER_SIDE = 8

/**
 * Finds the bead grid in a picture of a *chart* (or of a piece photographed
 * flat and square-on): trims the paper margin, measures the bead pitch on each
 * axis, and locks the phase onto bead centres. Returns null when there's no
 * regular grid — the caller then falls back to plain pixelation.
 *
 * This is what the importer was missing: it used to guess the grid from the
 * photo's aspect ratio alone, which on a 13-column chart came out as 8
 * columns — each sampled cell straddling two beads, so a gold bead averaged
 * with its blue neighbours and landed on grey.
 */
export function detectBeadGrid(image: CanvasImageSource & { width: number; height: number }): BeadGrid | null {
  const canvas = document.createElement('canvas')
  canvas.width = image.width
  canvas.height = image.height
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  ctx.drawImage(image, 0, 0)
  const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height)
  const W = canvas.width
  const H = canvas.height
  const at = (x: number, y: number) => (y * W + x) * 4
  const lum = (x: number, y: number) => {
    const o = at(x, y)
    return 0.299 * data[o] + 0.587 * data[o + 1] + 0.114 * data[o + 2]
  }
  const isPaper = (x: number, y: number) => {
    const o = at(x, y)
    return data[o] > 235 && data[o + 1] > 235 && data[o + 2] > 235
  }

  // Trim the blank margin: a chart image is usually padded with white.
  const bounds = contentBounds(W, H, isPaper)
  if (!bounds) return null
  const { left, right, top, bottom } = bounds
  const innerW = right - left + 1
  const innerH = bottom - top + 1
  if (innerW < 8 || innerH < 8) return null

  const colProfile: number[] = []
  for (let x = left + 1; x < right; x++) {
    let sum = 0
    for (let y = top + 1; y < bottom; y++) sum += Math.abs(lum(x + 1, y) - lum(x - 1, y))
    colProfile.push(sum / Math.max(1, innerH))
  }
  const rowProfile: number[] = []
  for (let y = top + 1; y < bottom; y++) {
    let sum = 0
    for (let x = left + 1; x < right; x++) sum += Math.abs(lum(x, y + 1) - lum(x, y - 1))
    rowProfile.push(sum / Math.max(1, innerW))
  }

  const px = dominantPeriod(colProfile, MIN_BEAD_PITCH_PX, innerW / 3)
  const py = dominantPeriod(rowProfile, MIN_BEAD_PITCH_PX, innerH / 3)
  const strength = Math.min(px.strength, py.strength)
  if (strength < MIN_GRID_STRENGTH || px.period < MIN_BEAD_PITCH_PX || py.period < MIN_BEAD_PITCH_PX) return null

  // Rounding the span by the raw period is half a bead off as often as not:
  // 876px at 10px gave 88 rows, whose sampling points land between rows and
  // drag colour in from the neighbour — the diamonds came out fat. Each
  // candidate around it is tried for real and scored by how *pure* the colours
  // it reads are (a centre is one flat colour; a straddled edge is a blend),
  // which picked 81 rows: 99.8% pure against 97.6% for 88.
  // Straight division by the measured pitch. Refining the count by "which
  // reading looks flattest" was tried and reverted: flatness rewards the blank
  // margin, so the count drifted outward and invented a 14th column of white
  // down the edge of a 13-column chart. Landing a bead or two off on a long
  // piece is the lesser error, and the weaver can nudge the sliders.
  const cols = Math.round(innerW / px.period)
  const rows = Math.round(innerH / py.period)
  if (cols < MIN_BEADS_PER_SIDE || rows < MIN_BEADS_PER_SIDE || cols > MAX_BEADS_PER_SIDE || rows > MAX_BEADS_PER_SIDE) return null
  // Re-derive the pitch from the whole run instead of the raw lag: rounding a
  // 17.31px pitch to 17 drifts a full bead across 13 columns.
  const pitchX = innerW / cols
  const pitchY = innerH / rows

  /** How mixed the colour is around a point — flat inside a bead, noisy on an outline. */
  const spread = (cx: number, cy: number) => {
    let n = 0
    const sum = [0, 0, 0]
    const sumSq = [0, 0, 0]
    const rx = Math.max(1, Math.round(pitchX / 6))
    const ry = Math.max(1, Math.round(pitchY / 6))
    for (let dy = -ry; dy <= ry; dy++) {
      for (let dx = -rx; dx <= rx; dx++) {
        const o = at(clamp(cx + dx, 0, W - 1), clamp(cy + dy, 0, H - 1))
        n++
        for (let k = 0; k < 3; k++) {
          sum[k] += data[o + k]
          sumSq[k] += data[o + k] * data[o + k]
        }
      }
    }
    let variance = 0
    for (let k = 0; k < 3; k++) {
      const mean = sum[k] / n
      variance += sumSq[k] / n - mean * mean
    }
    return variance
  }
  const phaseCost = (axis: 'x' | 'y') => (offset: number) => {
    let total = 0
    let n = 0
    for (let row = 0; row < rows; row += Math.max(1, Math.floor(rows / 12))) {
      for (let col = 0; col < cols; col += Math.max(1, Math.floor(cols / 12))) {
        const cx = Math.round(left + (axis === 'x' ? offset : 0) + col * pitchX + pitchX / 2)
        const cy = Math.round(top + (axis === 'y' ? offset : 0) + row * pitchY + pitchY / 2)
        total += spread(cx, cy)
        n++
      }
    }
    return total / Math.max(1, n)
  }

  return {
    x0: left + bestPhase(pitchX, phaseCost('x')),
    y0: top + bestPhase(pitchY, phaseCost('y')),
    pitchX,
    pitchY,
    cols,
    rows,
    strength,
  }
}

/** The bounding box of everything that isn't blank paper, or null if the image is blank. */
function contentBounds(W: number, H: number, isPaper: (x: number, y: number) => boolean) {
  const step = Math.max(1, Math.floor(Math.min(W, H) / 120))
  let left = -1
  let right = -1
  let top = -1
  let bottom = -1
  for (let x = 0; x < W && left < 0; x++) for (let y = 0; y < H; y += step) if (!isPaper(x, y)) { left = x; break }
  for (let x = W - 1; x >= 0 && right < 0; x--) for (let y = 0; y < H; y += step) if (!isPaper(x, y)) { right = x; break }
  for (let y = 0; y < H && top < 0; y++) for (let x = 0; x < W; x += step) if (!isPaper(x, y)) { top = y; break }
  for (let y = H - 1; y >= 0 && bottom < 0; y--) for (let x = 0; x < W; x += step) if (!isPaper(x, y)) { bottom = y; break }
  if (left < 0 || right <= left || top < 0 || bottom <= top) return null
  return { left, right, top, bottom }
}

function clamp(v: number, min: number, max: number) {
  return v < min ? min : v > max ? max : v
}

/** Median of a small patch at a bead's centre: immune to a highlight, a shadow, or an outline creeping in. */
function medianPatch(data: Uint8ClampedArray, W: number, H: number, cx: number, cy: number, rx: number, ry: number): RGB {
  const r: number[] = []
  const g: number[] = []
  const b: number[] = []
  for (let dy = -ry; dy <= ry; dy++) {
    for (let dx = -rx; dx <= rx; dx++) {
      const o = (clamp(cy + dy, 0, H - 1) * W + clamp(cx + dx, 0, W - 1)) * 4
      r.push(data[o])
      g.push(data[o + 1])
      b.push(data[o + 2])
    }
  }
  const mid = (a: number[]) => a.sort((u, v) => u - v)[a.length >> 1]
  return { r: mid(r), g: mid(g), b: mid(b) }
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
  { cols, rows, numColors, catalog = ALL_CATALOGS, mergeThreshold, grid }: ImageToPatternOptions,
): ImageToPatternResult {
  const canvas = document.createElement('canvas')
  canvas.width = cols
  canvas.height = rows
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas 2D no disponible')

  ctx.imageSmoothingEnabled = true
  ctx.drawImage(image, 0, 0, cols, rows)
  const { data } = ctx.getImageData(0, 0, cols, rows)

  // Con una grilla detectada se lee el centro de cada mostacilla; si no, se
  // cae al pixelado de siempre, que es lo correcto para una foto sin grilla.
  const pixels: RGB[] = grid ? sampleAtBeadCentres(image, grid, cols, rows) : []
  if (pixels.length === 0) {
    for (let i = 0; i < cols * rows; i++) {
      const o = i * 4
      pixels.push({ r: data[o], g: data[o + 1], b: data[o + 2] })
    }
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

/**
 * One colour per cell, read from the centre of the matching bead in the
 * original image. The grid may hold more beads than the requested cols/rows
 * (or fewer, if the weaver overrode the sliders), so positions are mapped
 * proportionally instead of assumed equal.
 */
function sampleAtBeadCentres(
  image: CanvasImageSource & { width: number; height: number },
  grid: BeadGrid,
  cols: number,
  rows: number,
): RGB[] {
  const canvas = document.createElement('canvas')
  canvas.width = image.width
  canvas.height = image.height
  const ctx = canvas.getContext('2d')
  if (!ctx) return []
  ctx.drawImage(image, 0, 0)
  const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height)
  const rx = Math.max(1, Math.round(grid.pitchX / 5))
  const ry = Math.max(1, Math.round(grid.pitchY / 5))

  const out: RGB[] = []
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const gridCol = cols === grid.cols ? col : Math.min(grid.cols - 1, Math.floor((col * grid.cols) / cols))
      const gridRow = rows === grid.rows ? row : Math.min(grid.rows - 1, Math.floor((row * grid.rows) / rows))
      const cx = Math.round(grid.x0 + gridCol * grid.pitchX + grid.pitchX / 2)
      const cy = Math.round(grid.y0 + gridRow * grid.pitchY + grid.pitchY / 2)
      out.push(medianPatch(data, canvas.width, canvas.height, cx, cy, rx, ry))
    }
  }
  return out
}
