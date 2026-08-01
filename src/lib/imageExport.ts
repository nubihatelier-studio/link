import type { BeadTypeDef, ColorMap, FringeData, LoopData, RowShape, Technique } from '@/engine/types'
import { cellPosition, gridBoundsUnits, loopAnchorX, physicalSizeMm } from '@/engine/geometry'
import { isPaintableCell, maxFringeLength } from '@/engine/fringe'
import { cellKey } from '@/engine/cellKey'
import { loopBeadCount, loopBeadOffsets, loopReserveUnits, METAL_LOOP_INDICATOR_UNITS } from '@/engine/loop'
import { letterMap } from '@/engine/letters'
import { beadMetricsPx, beadPath as roundRect, contrastTextColor } from './beadStyle'
import { shareOrDownloadFile } from './shareFile'
import { t } from '@/i18n/es'

export interface ExportImageOptions {
  name: string
  technique: Technique
  cols: number
  rows: number
  cells: ColorMap
  /** Absent/undefined is treated as "no fringe" — see `engine/fringe.ts`. */
  fringe?: FringeData
  /** Absent/undefined is treated as a full rectangle — see `engine/shape.ts`. */
  rowShape?: RowShape[]
  /** Absent/undefined defaults to 0 — see `engine/geometry.ts#cellPosition`. */
  staggerPhase?: 0 | 1
  beadType: BeadTypeDef
  /** Hanging loop at the top tip — see `engine/types.ts#LoopData`. Absent = no loop. */
  loop?: LoopData
  /** Draw the materials-list letter (A/B/C…) inside each bead, colored for contrast. Default true. */
  showLetters?: boolean
}

const MIN_CELL_PX = 10
const MAX_CELL_PX = 64

/**
 * Pixel size of one bead-unit cell for a canvas export, sized so the
 * pattern's longer side lands near `targetLongSidePx`, clamped to
 * [MIN_CELL_PX, MAX_CELL_PX] so a tiny pattern doesn't render as a handful
 * of giant blocks and a huge one doesn't blow up canvas memory.
 */
export function computeExportCellPx(boundsWidth: number, boundsHeight: number, targetLongSidePx: number): number {
  const longSideUnits = Math.max(boundsWidth, boundsHeight, 1)
  return Math.max(MIN_CELL_PX, Math.min(MAX_CELL_PX, targetLongSidePx / longSideUnits))
}


/**
 * The `'metal'` loop's stand-in: a thin open ring sitting in the reserved space
 * above the body's top tip, drawn in a neutral gray so it reads as hardware
 * rather than as beadwork. `anchorX`/`bodyTopY` are the same anchor point the
 * woven ring's beads are laid out around.
 */
function drawMetalLoopIndicator(
  ctx: CanvasRenderingContext2D,
  anchorX: number,
  bodyTopY: number,
  cellPx: number,
  strokeStyle = '#9a9aa0',
) {
  const outer = (METAL_LOOP_INDICATOR_UNITS / 2) * cellPx
  const cy = bodyTopY - outer
  ctx.save()
  ctx.beginPath()
  ctx.arc(anchorX, cy, outer * 0.78, 0, Math.PI * 2)
  ctx.strokeStyle = strokeStyle
  ctx.lineWidth = Math.max(1, cellPx * 0.14)
  ctx.stroke()
  ctx.restore()
}

/**
 * Renders the pattern (body + fringe, letters for contrast) onto a fresh
 * offscreen canvas — the shared drawing core for both the plain high-res
 * export and the Instagram card composition. Only painted cells are drawn
 * (an uncolored bead shows the given `backgroundHex` through), matching
 * `PatternThumb`'s convention — this is a shareable graphic, not a working
 * chart, so a half-finished pattern shouldn't be cluttered with empty-slot
 * outlines.
 *
 * `targetLongSidePx` sizes the cell so the pattern's longer side lands near
 * that many pixels, clamped to [MIN_CELL_PX, MAX_CELL_PX] per cell so a tiny
 * pattern doesn't render as a handful of giant blocks and a huge one doesn't
 * blow up canvas memory.
 */
export function renderPatternCanvas(
  opts: ExportImageOptions,
  backgroundHex: string,
  targetLongSidePx: number,
): HTMLCanvasElement {
  const { technique, cols, rows, cells, fringe, rowShape, staggerPhase = 0, loop } = opts
  const loopBeads = loopBeadCount(loop)
  const loopRows = loopReserveUnits(loop)
  const bounds = gridBoundsUnits(technique, cols, rows, maxFringeLength(fringe))
  const cellPx = computeExportCellPx(bounds.width, bounds.height + loopRows, targetLongSidePx)
  const margin = cellPx * 0.6
  // Extra room reserved above the body for the loop's ring — X stays plain `margin`.
  const topMargin = margin + loopRows * cellPx
  const width = Math.ceil(bounds.width * cellPx + margin * 2)
  const height = Math.ceil(bounds.height * cellPx + topMargin + margin)

  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, width)
  canvas.height = Math.max(1, height)
  const ctx = canvas.getContext('2d')
  if (!ctx) return canvas
  ctx.fillStyle = backgroundHex
  ctx.fillRect(0, 0, canvas.width, canvas.height)

  const letterForHex = letterMap({ technique, cols, rows, cells, fringe, rowShape, loop })
  const showLetters = (opts.showLetters ?? true) && cellPx >= 16

  // Same bead style as the editor — see lib/beadStyle.ts.
  const { inset, radius } = beadMetricsPx(cellPx)
  if (showLetters) {
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.font = `600 ${Math.max(9, cellPx * 0.42)}px system-ui, sans-serif`
  }

  function drawCell(context: CanvasRenderingContext2D, row: number, col: number) {
    // Defensive: a shaped (rowShape) body's painted cells should already stay inside its own
    // silhouette (the editor's paint tools gate on this), but checking here too — the same single
    // gate handles both the body loop and the fringe loop below — keeps the export correct even if
    // shape and cell data ever drift apart, same reasoning as weaveOrder/wordChart in engine/.
    if (!isPaintableCell(row, col, cols, rows, fringe, rowShape)) return
    const hex = cells[cellKey(row, col)]
    if (!hex) return
    const pos = cellPosition(technique, row, col, rows, staggerPhase)
    const x = margin + pos.x * cellPx + inset
    const y = topMargin + pos.y * cellPx + inset
    const w = cellPx - inset * 2
    const h = cellPx - inset * 2

    context.beginPath()
    roundRect(context, x, y, w, h, radius)
    context.fillStyle = hex
    context.fill()

    if (showLetters) {
      const letter = letterForHex.get(hex)
      if (letter) {
        context.fillStyle = contrastTextColor(hex)
        context.fillText(letter, x + w / 2, y + h / 2 + 0.5)
      }
    }
  }

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) drawCell(ctx, row, col)
  }
  for (let col = 0; col < cols; col++) {
    const length = fringe?.lengths[col] ?? 0
    for (let depth = 0; depth < length; depth++) drawCell(ctx, rows + depth, col)
  }

  // Hanging loop, over the body's top tip. Woven: real beads, drawn as circles
  // (not squares) so the ring reads as a ring, with the same `loopAnchorX` anchor
  // and letter-for-contrast treatment as every body/fringe cell. Metal: no beads
  // at all — just a discreet outlined ring standing in for the bought finding.
  if (loop) {
    const anchorXUnits = loopAnchorX(technique, cols, rowShape, staggerPhase)
    const origin = cellPosition(technique, 0, 0, rows, staggerPhase)
    const anchorX = margin + (anchorXUnits - origin.x) * cellPx

    if (loop.variant === 'woven' && loopBeads > 0) {
      const beadRadius = cellPx * 0.42
      for (const { dx, dy } of loopBeadOffsets(loopBeads)) {
        const cx = anchorX + dx * cellPx
        const cy = topMargin + dy * cellPx
        ctx.beginPath()
        ctx.arc(cx, cy, beadRadius, 0, Math.PI * 2)
        ctx.fillStyle = loop.color
        ctx.fill()
        if (showLetters) {
          const letter = letterForHex.get(loop.color)
          if (letter) {
            ctx.fillStyle = contrastTextColor(loop.color)
            ctx.fillText(letter, cx, cy + 0.5)
          }
        }
      }
    } else if (loop.variant === 'metal') {
      drawMetalLoopIndicator(ctx, anchorX, topMargin, cellPx)
    }
  }

  return canvas
}

/** Standard Instagram feed portrait size (4:5). */
export const INSTAGRAM_CARD_WIDTH = 1080
export const INSTAGRAM_CARD_HEIGHT = 1350

const LOGO_LOAD_TIMEOUT_MS = 3000

/** Bounded by a timeout — a stuck/slow fetch (offline, blocked) shouldn't hang the whole export. */
function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const timer = setTimeout(() => reject(new Error(`Tiempo agotado cargando ${src}`)), LOGO_LOAD_TIMEOUT_MS)
    img.onload = () => {
      clearTimeout(timer)
      resolve(img)
    }
    img.onerror = () => {
      clearTimeout(timer)
      reject(new Error(`No se pudo cargar ${src}`))
    }
    img.src = src
  })
}

/**
 * Composes the branded, shareable "Instagram card": title + spec line, the
 * pattern centered in a white panel, brand footer. Deliberately one fixed
 * dark teal/gold look regardless of the app's light/dark theme — a social
 * share card is a standalone artifact meant to look the same wherever it
 * lands (feed, story, saved), not a theme-aware UI surface.
 */
export async function composeInstagramCard(opts: ExportImageOptions): Promise<HTMLCanvasElement> {
  const card = document.createElement('canvas')
  card.width = INSTAGRAM_CARD_WIDTH
  card.height = INSTAGRAM_CARD_HEIGHT
  const ctx = card.getContext('2d')
  if (!ctx) return card

  const bg = ctx.createLinearGradient(0, 0, 0, INSTAGRAM_CARD_HEIGHT)
  bg.addColorStop(0, '#2f5b66')
  bg.addColorStop(1, '#14181a')
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, INSTAGRAM_CARD_WIDTH, INSTAGRAM_CARD_HEIGHT)

  ctx.textAlign = 'center'
  ctx.fillStyle = '#f5f4f6'
  ctx.font = '700 56px system-ui, sans-serif'
  ctx.fillText(opts.name || 'Patrón Nubih', INSTAGRAM_CARD_WIDTH / 2, 130, INSTAGRAM_CARD_WIDTH - 160)

  const size = physicalSizeMm(
    opts.technique,
    opts.cols,
    opts.rows,
    opts.beadType,
    maxFringeLength(opts.fringe),
    loopBeadCount(opts.loop),
  )
  ctx.font = '400 30px system-ui, sans-serif'
  ctx.fillStyle = 'rgba(245,244,246,0.8)'
  ctx.fillText(
    `${t.technique[opts.technique]} · ${opts.cols}×${opts.rows} · ${size.widthMm.toFixed(0)}×${size.heightMm.toFixed(0)} mm`,
    INSTAGRAM_CARD_WIDTH / 2,
    180,
  )

  const panelMargin = 90
  const panelTop = 240
  const panelBottom = INSTAGRAM_CARD_HEIGHT - 170
  const panelW = INSTAGRAM_CARD_WIDTH - panelMargin * 2
  const panelH = panelBottom - panelTop
  ctx.fillStyle = '#ffffff'
  ctx.beginPath()
  roundRect(ctx, panelMargin, panelTop, panelW, panelH, 36)
  ctx.fill()

  const patternPadding = 60
  const patternCanvas = renderPatternCanvas(
    opts,
    '#ffffff',
    Math.max(1, Math.min(panelW, panelH) - patternPadding * 2),
  )
  const fitScale = Math.min(
    (panelW - patternPadding * 2) / patternCanvas.width,
    (panelH - patternPadding * 2) / patternCanvas.height,
    1,
  )
  const drawW = patternCanvas.width * fitScale
  const drawH = patternCanvas.height * fitScale
  ctx.drawImage(patternCanvas, panelMargin + (panelW - drawW) / 2, panelTop + (panelH - drawH) / 2, drawW, drawH)

  // Footer: circular logo + wordmark, centered as one group. Logo fetch can
  // fail (offline, blocked) without breaking the export — it's a nice-to-have.
  const wordmark = 'Nubih Creator'
  const footerY = INSTAGRAM_CARD_HEIGHT - 82
  const logoSize = 44
  const gap = 16
  ctx.font = '700 34px system-ui, sans-serif'
  const wordmarkWidth = ctx.measureText(wordmark).width
  const groupWidth = logoSize + gap + wordmarkWidth
  const groupStartX = INSTAGRAM_CARD_WIDTH / 2 - groupWidth / 2

  try {
    const logo = await loadImage('/logo.png')
    const logoCx = groupStartX + logoSize / 2
    const logoCy = footerY - logoSize * 0.32
    ctx.save()
    ctx.beginPath()
    ctx.arc(logoCx, logoCy, logoSize / 2, 0, Math.PI * 2)
    ctx.clip()
    ctx.drawImage(logo, logoCx - logoSize / 2, logoCy - logoSize / 2, logoSize, logoSize)
    ctx.restore()
  } catch {
    // Nice-to-have — proceed without the logo.
  }

  ctx.textAlign = 'left'
  ctx.fillStyle = '#c9a227'
  ctx.font = '700 34px system-ui, sans-serif'
  ctx.fillText(wordmark, groupStartX + logoSize + gap, footerY)

  return card
}

function canvasToBlob(canvas: HTMLCanvasElement, mimeType: string, quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('No se pudo generar la imagen'))), mimeType, quality)
  })
}

function sanitizeFilename(name: string): string {
  return (name || 'patron').replace(/\s+/g, '_')
}

/** High-res PNG export of the pattern chart alone (no card framing) — the "share the actual chart" option. */
export async function exportPatternImage(opts: ExportImageOptions): Promise<void> {
  const canvas = renderPatternCanvas(opts, '#ffffff', 1800)
  const blob = await canvasToBlob(canvas, 'image/png')
  await shareOrDownloadFile(blob, `${sanitizeFilename(opts.name)}.png`)
}

/** The branded Instagram card (see `composeInstagramCard`), shared/downloaded as a JPEG. */
export async function exportInstagramCardImage(opts: ExportImageOptions): Promise<void> {
  const card = await composeInstagramCard(opts)
  const blob = await canvasToBlob(card, 'image/jpeg', 0.92)
  await shareOrDownloadFile(blob, `${sanitizeFilename(opts.name)}_instagram.jpg`)
}
