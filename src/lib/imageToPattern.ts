import type { ColorMap, Technique } from '@/engine/types'
import type { MiyukiColor } from '@/data/colorTypes'
import { ALL_CATALOGS } from '@/data/catalog'
import { effectiveStaggerPhase, rowPitch } from '@/engine/geometry'
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
  /** The technique the pattern is being made for — decides how a staggered chart's columns line up (see `staggerAlignment`). */
  technique?: Technique
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
 * And it returns the **fundamental**, not the strongest lag, because every
 * multiple of the true pitch correlates just as well — taking the strongest
 * outright picked 34px on a 17px chart, halving the column count. Which lag is
 * strongest among the multiples is down to the motif: down one column of the
 * test chart 22, 43, 65 and 86px scored 0.76, 0.73, 0.75 and 0.77. "The
 * smallest lag within 10% of the best" held on that chart and read 108px — five
 * beads — on another, so the rule looks at the best lag's *divisors* instead
 * (see `fundamentalOf`).
 *
 * The period comes back fractional. A real pitch rarely lands on a whole
 * number of pixels, and rounding it is not harmless: on the test chart a
 * 10.8px spacing split the peak between lag 10 (0.499) and lag 11 (0.495) —
 * taking the winner gave 87 instead of 81, and the sampling points drifted
 * until the diamonds came out fat. The fraction is
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
  const centred = slopeOf(soften(detrend(profile, hi)))
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
  const fundamental = fundamentalOf(scores, best)
  return {
    period: refinePeriod(scores, fundamental.period),
    strength: Math.max(0, fundamental.strength - troughBeside(scores, fundamental.period)),
  }
}

/**
 * The shortest period the best lag is a multiple of: its halves, thirds,
 * quarters… are tried, and the smallest one that is itself a peak scoring
 * close to the best wins. Only divisors count — a lag that merely scores well
 * somewhere shorter isn't the pitch — and a half-bead echo doesn't pass: the
 * slope of a shaded bead turns negative half a bead along (-0.73 on the test
 * chart), so it is no peak at all.
 */
function fundamentalOf(scores: { period: number; strength: number }[], best: { period: number; strength: number }) {
  let pick = best
  for (let k = 2; best.period / k >= scores[0].period; k++) {
    const target = best.period / k
    const i = scores.reduce((m, s, j) => (Math.abs(s.period - target) <= 1 && (m < 0 || s.strength > scores[m].strength) ? j : m), -1)
    if (i < 0) continue
    const s = scores[i]
    const isPeak = (scores[i - 1]?.strength ?? -Infinity) <= s.strength && (scores[i + 1]?.strength ?? -Infinity) <= s.strength
    if (isPeak && s.strength >= best.strength * DIVISOR_SHARE) pick = s
  }
  return pick
}

/**
 * How close to the best lag's score a divisor must come to be taken as the real
 * period. Generous on purpose: a pitch that isn't a whole number of pixels
 * correlates worse at its own lag than at a multiple that happens to land on a
 * whole pixel — a 21.6px bead scored 0.56 at lag 22 and 0.91 at lag 108.
 */
const DIVISOR_SHARE = 0.5

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
 * A light blur, so a pitch that isn't a whole number of pixels still lines up
 * with itself. A one-pixel edge shifted by half a pixel no longer overlaps at
 * all, and the lag next to a 9.5px bead scored so low that 19px — two beads —
 * won instead.
 */
function soften(values: number[]): number[] {
  const kernel = [1, 4, 6, 4, 1]
  return values.map((_, i) => {
    let sum = 0
    let weight = 0
    for (let k = -2; k <= 2; k++) {
      const v = values[i + k]
      if (v === undefined) continue
      sum += v * kernel[k + 2]
      weight += kernel[k + 2]
    }
    return sum / weight
  })
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
 * Whether the chart's columns sit level (`'straight'`, a loom chart) or every
 * other column half a bead lower (`'staggered'`, a peyote chart). `'auto'`
 * reads it from the image; the other two are the weaver's override when the
 * reading is wrong.
 */
export type ChartStagger = 'auto' | 'straight' | 'staggered'

export const CHART_STAGGER_ORDER: ChartStagger[] = ['auto', 'straight', 'staggered']

/** A bead grid found in an image: where it starts, how far apart the beads are, and how many there are. */
export interface BeadGrid {
  x0: number
  /** Top edge of the first bead in the even columns (0, 2, 4…). */
  y0: number
  pitchX: number
  /** Height of one bead, measured down a single column. */
  pitchY: number
  cols: number
  /** Beads per column. */
  rows: number
  /**
   * How much lower the odd columns start than the even ones, in px: 0 on a
   * straight chart, about ±pitchY/2 on a staggered one (negative when the odd
   * columns are the high ones).
   */
  staggerY: number
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
 * Below this, the colour changes down the columns don't line up on any
 * boundary lattice — the chart's colours differ only in lightness — and the
 * phase is read from brightness instead.
 */
const MIN_BOUNDARY_CONTRAST = 1.15

/** The pixels of an image, as `getImageData` hands them over. */
export interface PixelImage {
  data: Uint8ClampedArray
  width: number
  height: number
}

function readPixels(image: CanvasImageSource & { width: number; height: number }): PixelImage | null {
  const canvas = document.createElement('canvas')
  canvas.width = image.width
  canvas.height = image.height
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  ctx.drawImage(image, 0, 0)
  return { data: ctx.getImageData(0, 0, canvas.width, canvas.height).data, width: canvas.width, height: canvas.height }
}

/**
 * Finds the bead grid in a picture of a *chart* (or of a piece photographed
 * flat and square-on). Returns null when there's no regular grid — the caller
 * then falls back to plain pixelation. See `findBeadGrid`.
 */
export function detectBeadGrid(
  image: CanvasImageSource & { width: number; height: number },
  stagger: ChartStagger = 'auto',
): BeadGrid | null {
  const pixels = readPixels(image)
  return pixels ? findBeadGrid(pixels, stagger) : null
}

/**
 * Trims the paper margin, measures the bead pitch on each axis, and locks the
 * phase onto bead centres.
 *
 * The vertical pitch is measured **down each family of columns separately**
 * (even ones, odd ones), never across the whole width. On a peyote chart every
 * other column sits half a bead lower, so a profile averaged over all columns
 * has an edge every *half* bead — and it repeats there almost as strongly as at
 * the real bead (0.675 against 0.686 on the test chart), which read a 13 × 40
 * chart as 81 rows, every bead sampled twice and once across its seam: the
 * motif came out thick and a two-colour chart counted seven. One family on its
 * own is a straight stack of beads with only one period in it.
 *
 * The bead count, the stagger and which columns are the high ones are then
 * decided in one search over every reading (see below). What doesn't work is
 * one phase for all columns followed by "is it staggered?" — that phase is
 * already a compromise between the two families and always answers no.
 */
export function findBeadGrid({ data, width: W, height: H }: PixelImage, stagger: ChartStagger = 'auto'): BeadGrid | null {
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
  const px = dominantPeriod(colProfile, MIN_BEAD_PITCH_PX, innerW / 3)
  if (px.strength < MIN_GRID_STRENGTH || px.period < MIN_BEAD_PITCH_PX) return null
  const cols = countAlongEdges(colProfile, innerW, px.period)
  if (cols < MIN_BEADS_PER_SIDE || cols > MAX_BEADS_PER_SIDE) return null
  // Re-derive the pitch from the whole run instead of the raw lag: rounding a
  // 17.31px pitch to 17 drifts a full bead across 13 columns.
  const pitchX = innerW / cols

  // Phases lock onto bead *boundaries* — where the edges are — not onto the
  // flattest spot. Flatness was the criterion before and a shaded chart
  // defeats it: the dark lower half of a drawn bead is flatter than its
  // highlighted middle, so it chose the seams and read every bead half
  // across its neighbour. The left edge of the content box is a boundary too,
  // so the phase is a small nudge either way — never most of a bead, which
  // would push the last column off the image.
  const x0 = left + wrapHalf(boundaryPhase(pitchX, innerW, (i) => colProfile[i - 1] ?? 0).offset, pitchX)
  const colCentre = (col: number) => x0 + col * pitchX + pitchX / 2
  const familyCols = (family: 0 | 1) => Array.from({ length: cols }, (_, c) => c).filter((c) => c % 2 === family)
  /** The pixel columns down the middle of these bead columns — clear of the outlines between them. */
  const middleXs = (columns: number[]) => {
    const band = Math.max(1, Math.floor(pitchX / 4))
    return columns.flatMap((c) => {
      const cx = Math.round(colCentre(c))
      const out: number[] = []
      for (let x = cx - band; x <= cx + band; x++) if (x >= 0 && x < W) out.push(x)
      return out
    })
  }

  /**
   * Brightness down the middle of one family's columns. Brightness itself, not
   * edge energy like `colProfile`: a drawn bead is shaded — light, then dark —
   * so the *size* of the change has two bumps per bead and repeats every half
   * bead (lag 11 scored 0.36 on the test chart, beating the real 22), while
   * `dominantPeriod` takes the slope of what it's given and keeps its sign:
   * light-to-dark and dark-to-light no longer look alike, and lag 11 falls to
   * -0.73 against 0.76 for the bead.
   */
  const familyProfile = (family: 0 | 1) => {
    const xs = middleXs(familyCols(family))
    const profile: number[] = []
    for (let y = top + 1; y < bottom; y++) {
      let sum = 0
      for (const x of xs) sum += lum(x, y)
      profile.push(sum / Math.max(1, xs.length))
    }
    return profile
  }
  const py = ([0, 1] as const).map((f) => dominantPeriod(familyProfile(f), MIN_BEAD_PITCH_PX, innerH / 3))
  const strongest = py[0].strength >= py[1].strength ? py[0] : py[1]
  // Both families are the same beads, so a clean reading of both should
  // agree; when they don't, the stronger one is the better witness.
  const agree = py[0].period > 0 && py[1].period > 0 && Math.abs(py[0].period - py[1].period) < 0.1 * strongest.period
  const roughPitchY = agree ? (py[0].period + py[1].period) / 2 : strongest.period
  const strength = Math.min(px.strength, strongest.strength)
  if (strength < MIN_GRID_STRENGTH || roughPitchY < MIN_BEAD_PITCH_PX) return null

  /**
   * Where the colour changes down one family's columns. Chromaticity — each
   * channel's share of the total — rather than brightness, because shading
   * only scales a colour: a bead's highlight and shadow keep its chromaticity,
   * while a blue bead meeting a gold one swaps it. Brightness is kept as the
   * fallback for a chart whose colours differ only in lightness (black, grey,
   * white), where chromaticity has nothing to say.
   */
  const familyEdges = (family: 0 | 1, kind: 'chroma' | 'lum') => {
    const xs = middleXs(familyCols(family))
    const chroma = (x: number, y: number) => {
      const o = at(x, y)
      const total = data[o] + data[o + 1] + data[o + 2] + 1
      return [data[o] / total, data[o + 1] / total, data[o + 2] / total]
    }
    const edges: number[] = []
    for (let y = top; y <= bottom; y++) {
      const up = Math.max(0, y - 1)
      const down = Math.min(H - 1, y + 1)
      let sum = 0
      for (const x of xs) {
        if (kind === 'lum') {
          sum += Math.abs(lum(x, down) - lum(x, up))
        } else {
          const [a, b] = [chroma(x, up), chroma(x, down)]
          sum += Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2])
        }
      }
      edges.push(sum / Math.max(1, xs.length))
    }
    return edges
  }
  const chromaEdges = [familyEdges(0, 'chroma'), familyEdges(1, 'chroma')]
  const colourLinesUp = boundaryPhase(roughPitchY, innerH, (i) => chromaEdges[0][i] ?? 0).contrast >= MIN_BOUNDARY_CONTRAST
  const edges = colourLinesUp ? chromaEdges : [familyEdges(0, 'lum'), familyEdges(1, 'lum')]

  /**
   * How well a lattice of bead boundaries sits on a family's colour changes:
   * the average strongest edge within a pixel of each boundary, from `start`
   * pixels below the top, `count` beads long.
   */
  const latticeScore = (family: 0 | 1, start: number, pitch: number, count: number) => {
    let score = 0
    for (let k = 0; k <= count; k++) {
      const i = Math.round(start + k * pitch)
      score += Math.max(edges[family][i - 1] ?? 0, edges[family][i] ?? 0, edges[family][i + 1] ?? 0)
    }
    return score / (count + 1)
  }

  // The bead count, the stagger and which columns are the high ones are
  // decided together, by trying each reading and keeping the one whose
  // boundaries land on the colour changes. Dividing the height by the
  // measured pitch isn't precise enough: the lag comes back a few percent off
  // (21.07px for 21.6) and by row 40 that is a whole bead. A staggered chart
  // stands half a bead taller than its rows, since its low columns hang below
  // the others — so the same height holds a different count read each way.
  // The first boundary sits on the top of the content box, give or take a
  // quarter bead for an antialiased edge.
  type Reading = { rows: number; pitch: number; start: number; highFamily: 0 | 1 | null; score: number }
  let best: Reading | null = null
  const consider = (rows: number, highFamily: 0 | 1 | null) => {
    if (rows < MIN_BEADS_PER_SIDE || rows > MAX_BEADS_PER_SIDE) return
    const pitch = innerH / (highFamily === null ? rows : rows + 0.5)
    for (let step = -6; step <= 6; step++) {
      const start = (step / 24) * pitch
      const score =
        highFamily === null
          ? (latticeScore(0, start, pitch, rows) + latticeScore(1, start, pitch, rows)) / 2
          : (latticeScore(highFamily, start, pitch, rows) + latticeScore(highFamily === 0 ? 1 : 0, start + pitch / 2, pitch, rows)) / 2
      if (!best || score > best.score) best = { rows, pitch, start, highFamily, score }
    }
  }
  const estimate = innerH / roughPitchY
  for (let d = -2; d <= 2; d++) {
    if (stagger !== 'staggered') consider(Math.round(estimate) + d, null)
    if (stagger !== 'straight') {
      consider(Math.round(estimate - 0.5) + d, 0)
      consider(Math.round(estimate - 0.5) + d, 1)
    }
  }
  const reading = best as Reading | null
  if (!reading) return null
  const pitchY = reading.pitch
  const rows = reading.rows
  const highTop = top + reading.start
  const evenTop = reading.highFamily === 1 ? highTop + pitchY / 2 : highTop
  const oddTop = reading.highFamily === 0 ? highTop + pitchY / 2 : highTop

  return { x0, y0: evenTop, pitchX, pitchY, cols, rows, staggerY: oddTop - evenTop, strength }
}

/**
 * How many beads fit across a span, given the pitch the autocorrelation
 * measured and the edge profile it came from.
 *
 * Dividing the span by the pitch isn't safe on its own: the pitch comes back a
 * few percent off whenever the beads aren't drawn perfectly evenly — the test
 * chart alternates 15px and 18px columns, measured 16.1px for a real 17 and
 * read 13 columns as 14. So the neighbouring counts are tried as well, and the
 * one whose bead boundaries land on the profile's edges wins: with the right
 * count they stay on the outlines from one side to the other, with a wrong one
 * they drift off them by the middle.
 *
 * This scores *edges*, not flatness. Choosing the count whose reading looked
 * flattest was tried and reverted: flatness rewards the blank margin, so the
 * count drifted outward and invented a column of white down the chart's edge.
 */
function countAlongEdges(profile: number[], span: number, period: number): number {
  const mean = profile.reduce((a, b) => a + b, 0) / (profile.length || 1)
  if (mean <= 0) return Math.round(span / period)
  const estimate = Math.round(span / period)
  let best = { count: estimate, score: -Infinity }
  for (let count = Math.max(1, estimate - 1); count <= estimate + 1; count++) {
    const pitch = span / count
    let score = 0
    for (let k = 1; k < count; k++) {
      // The profile starts one pixel into the span (see its loop).
      const i = Math.round(k * pitch) - 1
      let peak = 0
      for (let j = i - 1; j <= i + 1; j++) if (j >= 0 && j < profile.length) peak = Math.max(peak, profile[j])
      score += peak
    }
    score /= Math.max(1, count - 1) * mean
    if (score > best.score) best = { count, score }
  }
  return best.count
}

/**
 * The offset (in [0, pitch)) at which a lattice of bead boundaries lands on
 * the most edge energy, and how clearly it stands out: the best offset's
 * energy over the average offset's. `energyAt(i)` is the energy i pixels into
 * the span; each boundary takes the strongest pixel within one of it, since
 * an outline is a couple of pixels thick and the pitch is fractional.
 */
function boundaryPhase(pitch: number, span: number, energyAt: (i: number) => number, steps = 24): { offset: number; contrast: number } {
  let best = { offset: 0, score: -Infinity }
  let total = 0
  for (let s = 0; s < steps; s++) {
    const offset = (pitch * s) / steps
    let score = 0
    let n = 0
    for (let pos = offset; pos < span; pos += pitch) {
      const i = Math.round(pos)
      score += Math.max(energyAt(i - 1), energyAt(i), energyAt(i + 1))
      n++
    }
    score /= Math.max(1, n)
    total += score
    if (score > best.score) best = { offset, score }
  }
  const mean = total / steps
  return { offset: best.offset, contrast: mean > 1e-9 ? best.score / mean : 0 }
}

/** `value` brought into [-period/2, period/2) — the shortest way round a repeating phase. */
function wrapHalf(value: number, period: number): number {
  return ((((value + period / 2) % period) + period) % period) - period / 2
}

/**
 * How the beads of a chart land on the rows of the pattern.
 *
 * On a straight chart, or for a technique that doesn't stagger its columns,
 * bead r of each column is simply row r.
 *
 * Peyote, though, draws its columns in a fixed order that follows from how
 * the piece is started (`effectiveStaggerPhase`: the last column strung is a
 * high one). A chart drawn the other way round — its high columns where the
 * pattern's low ones are — is lined up by moving the chart's high columns up
 * one bead: their first bead (the one poking out above the top) is dropped,
 * and so is the last bead of the other columns (poking out below), which
 * leaves one row fewer. The drawing itself stays exactly where it was. The
 * alternative, turning the chart upside down, only fits an odd column count
 * and puts the motif on its head in the editor.
 */
export function staggerAlignment(grid: BeadGrid, technique: Technique): { rows: number; shiftedParity: 0 | 1 | null } {
  if (grid.staggerY === 0 || technique !== 'peyote') return { rows: grid.rows, shiftedParity: null }
  const chartLowParity = grid.staggerY > 0 ? 1 : 0
  // `cellPosition` lowers column c when c + phase is odd.
  const patternLowParity = effectiveStaggerPhase({ technique, cols: grid.cols }) === 0 ? 1 : 0
  if (chartLowParity === patternLowParity) return { rows: grid.rows, shiftedParity: null }
  return { rows: grid.rows - 1, shiftedParity: patternLowParity }
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
  { cols, rows, numColors, catalog = ALL_CATALOGS, mergeThreshold, grid, technique = 'loom' }: ImageToPatternOptions,
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
  const pixels: RGB[] = grid ? sampleAtBeadCentres(image, grid, cols, rows, technique) : []
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
 * original image — each column at its own height, so a staggered chart is
 * read bead by bead instead of across the seams. The pattern may have more
 * cells than the grid has beads (or fewer, if the weaver overrode the
 * sliders), so positions are mapped proportionally instead of assumed equal.
 */
function sampleAtBeadCentres(
  image: CanvasImageSource & { width: number; height: number },
  grid: BeadGrid,
  cols: number,
  rows: number,
  technique: Technique,
): RGB[] {
  const pixels = readPixels(image)
  return pixels ? sampleGrid(pixels, grid, cols, rows, technique) : []
}

export function sampleGrid({ data, width, height }: PixelImage, grid: BeadGrid, cols: number, rows: number, technique: Technique): RGB[] {
  const { rows: gridRows, shiftedParity } = staggerAlignment(grid, technique)
  const rx = Math.max(1, Math.round(grid.pitchX / 5))
  const ry = Math.max(1, Math.round(grid.pitchY / 5))

  const out: RGB[] = []
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const gridCol = cols === grid.cols ? col : Math.min(grid.cols - 1, Math.floor((col * grid.cols) / cols))
      const gridRow = rows === gridRows ? row : Math.min(gridRows - 1, Math.floor((row * gridRows) / rows))
      const odd = gridCol % 2 === 1
      const bead = gridRow + (shiftedParity === gridCol % 2 ? 1 : 0)
      const cx = Math.round(grid.x0 + gridCol * grid.pitchX + grid.pitchX / 2)
      const cy = Math.round(grid.y0 + (odd ? grid.staggerY : 0) + bead * grid.pitchY + grid.pitchY / 2)
      out.push(medianPatch(data, width, height, cx, cy, rx, ry))
    }
  }
  return out
}

/**
 * How many colours an image really has, counted rather than assumed: cluster
 * generously, then collapse the clusters that are the same colour seen through
 * anti-aliasing or a highlight. A chart of three colours answers three.
 *
 * The importer used to open at a fixed 12, which on a three-colour chart
 * invents nine shades of the same bead and hands the weaver a materials list
 * she has to undo by dragging the slider back down.
 */
export function countDistinctColors(pixels: RGB[], threshold = CHART_COLOR_THRESHOLD, ceiling = MAX_SUGGESTED_COLORS): number {
  if (pixels.length === 0) return 2
  const { centroids, counts } = kMeansQuantize(pixels, ceiling)
  const merged = mergeSimilarColors(centroids, counts, threshold)
  // Clusters holding a sliver of the image are edge blends, not colours of their own.
  const floor = pixels.length * MIN_COLOR_SHARE
  const real = merged.counts.filter((c) => c >= floor).length
  return Math.max(2, Math.min(ceiling, real))
}

/**
 * Beads are flat, well-separated colours, so two clusters this close are the
 * same bead — a wider net than the `mergeSimilarColors` default (6), which is
 * tuned for photographs where real colours do sit that close together.
 */
const CHART_COLOR_THRESHOLD = 12
/** Below this share of the image, a cluster is an edge artifact rather than a bead colour. */
const MIN_COLOR_SHARE = 0.01
/** Never suggest more than this — past it the materials list stops being a shopping list. */
const MAX_SUGGESTED_COLORS = 12

/** The colour count to open with for `image`, read at the grid it will be reduced to. */
export function suggestColorCount(
  image: CanvasImageSource & { width: number; height: number },
  cols: number,
  rows: number,
  grid?: BeadGrid | null,
  technique: Technique = 'loom',
): number {
  if (grid) return countDistinctColors(sampleAtBeadCentres(image, grid, cols, rows, technique))
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, cols)
  canvas.height = Math.max(1, rows)
  const ctx = canvas.getContext('2d')
  if (!ctx) return MAX_SUGGESTED_COLORS
  ctx.imageSmoothingEnabled = true
  ctx.drawImage(image, 0, 0, cols, rows)
  const { data } = ctx.getImageData(0, 0, cols, rows)
  const pixels: RGB[] = []
  for (let i = 0; i < cols * rows; i++) {
    const o = i * 4
    pixels.push({ r: data[o], g: data[o + 1], b: data[o + 2] })
  }
  return countDistinctColors(pixels)
}
