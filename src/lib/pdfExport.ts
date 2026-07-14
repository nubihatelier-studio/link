import type { ColorMap, Technique } from '@/engine/types'
import type { BeadTypeDef } from '@/engine/types'
import type { jsPDF as JsPDF } from 'jspdf'
import { cellPosition, gridBoundsUnits, physicalSizeMm, beadCount } from '@/engine/geometry'
import { cellKey } from '@/engine/cellKey'
import { paletteFromCells, letterForIndex } from './palette'
import { catalogMatchForHex } from './color'

export interface ExportPatternOptions {
  name: string
  technique: Technique
  cols: number
  rows: number
  cells: ColorMap
  beadType: BeadTypeDef
}

/**
 * Chart cell size in mm, tuned per technique for on-paper legibility —
 * intentionally NOT the bead's real physical size (a Delica 11/0 is
 * ~1.6mm, which would be unreadable at 1:1). Proportions ported from the
 * Lovable build's `baseBeadPx` (peyote tall, brick wide, loom square); the
 * bead's *actual* physical size is still shown separately in the spec line
 * via `physicalSizeMm`, so the finished-piece dimensions stay accurate even
 * though the printed chart is enlarged.
 */
function chartCellMm(technique: Technique): { w: number; h: number } {
  if (technique === 'peyote') return { w: 3.2, h: 3.9 }
  if (technique === 'brick') return { w: 3.9, h: 3.2 }
  return { w: 3.5, h: 3.5 }
}

/**
 * Draws the colored pattern grid directly as PDF vector primitives (rects +
 * text) instead of rasterizing an HTML canvas to a PNG and embedding that
 * image. This keeps the chart crisp at any zoom/print size and produces a
 * much smaller file for large patterns.
 *
 * Returns the y-coordinate (mm) immediately below the drawn grid, so the
 * caller knows where to continue laying out content on the same page.
 */
function drawGridVector(
  doc: JsPDF,
  opts: ExportPatternOptions,
  originX: number,
  originY: number,
  cellW: number,
  cellH: number,
): number {
  const { technique, cols, rows, cells } = opts
  const bounds = gridBoundsUnits(technique, cols, rows)

  // Row/col numbering — every Nth for large grids, same thresholds as before.
  const step = cols > 60 ? 10 : cols > 30 ? 5 : 1
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(6)
  doc.setTextColor(120)
  for (let c = 0; c < cols; c += step) {
    const pos = cellPosition(technique, 0, c)
    doc.text(String(c + 1), originX + pos.x * cellW + cellW / 2, originY - 2, { align: 'center' })
  }
  for (let r = 0; r < rows; r += step) {
    const pos = cellPosition(technique, r, 0)
    doc.text(String(r + 1), originX - 2, originY + pos.y * cellH + cellH / 2 + 1, { align: 'right' })
  }

  doc.setLineWidth(0.05)
  doc.setDrawColor(200)
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const hex = cells[cellKey(row, col)]
      const pos = cellPosition(technique, row, col)
      const x = originX + pos.x * cellW
      const y = originY + pos.y * cellH

      if (hex) {
        doc.setFillColor(hex)
        doc.rect(x, y, cellW, cellH, 'FD')
      } else {
        doc.rect(x, y, cellW, cellH, 'S')
      }
    }
  }
  doc.setTextColor(0)

  return originY + bounds.height * cellH
}

/**
 * Exports the current pattern to a single-page PDF: a vector-drawn colored
 * chart with row/col numbering, technical specs (real finished size in mm),
 * and a compact color legend (letra / código / cantidad) sharing the page.
 */
export async function exportPatternToPdf(opts: ExportPatternOptions): Promise<void> {
  // Lazy-loaded: jsPDF is only needed the first time someone actually exports.
  const { jsPDF } = await import('jspdf')
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  const margin = 14

  const palette = paletteFromCells(opts.cells)
  const letterForHex = new Map(palette.map((p, i) => [p.hex, letterForIndex(i)]))

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(16)
  doc.text(opts.name || 'Patrón Nubih', margin, 14)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.setTextColor(100)
  const size = physicalSizeMm(opts.technique, opts.cols, opts.rows, opts.beadType.widthMm, opts.beadType.heightMm)
  const total = beadCount(opts.technique, opts.cols, opts.rows)
  const techLabel = { loom: 'Loom', peyote: 'Peyote intercalado', brick: 'Brick stitch' }[opts.technique]
  const specs = `${techLabel} · ${opts.cols} × ${opts.rows} mostacillas · ${opts.beadType.label} · ${size.widthMm.toFixed(1)} × ${size.heightMm.toFixed(1)} mm · Total: ${total} mostacillas`
  doc.text(specs, margin, 20)
  doc.setTextColor(0)

  // Everything fits on one page: the chart takes the left/main area and the
  // materials legend runs down a narrow column on the right.
  const chartTop = 26
  const legendWidth = 50
  const gap = 6

  const base = chartCellMm(opts.technique)
  const bounds = gridBoundsUnits(opts.technique, opts.cols, opts.rows)
  const availW = pageWidth - margin * 2 - legendWidth - gap
  const availH = pageHeight - chartTop - margin
  const scale = Math.min(availW / (bounds.width * base.w), availH / (bounds.height * base.h), 1)
  const cellW = base.w * scale
  const cellH = base.h * scale

  drawGridVector(doc, opts, margin, chartTop, cellW, cellH)

  // Materials legend column
  const legendX = pageWidth - margin - legendWidth
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  doc.setTextColor(0)
  doc.text('Materiales', legendX, chartTop)

  const legendAvailH = pageHeight - margin - (chartTop + 5)
  const rowH = Math.max(3, Math.min(5, legendAvailH / Math.max(1, palette.length)))
  const fontSize = rowH > 4.2 ? 7 : rowH > 3.4 ? 6 : 5
  const boxSize = Math.min(3.2, rowH - 0.8)

  let y = chartTop + 5 + rowH
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(fontSize)
  for (const p of palette) {
    const match = catalogMatchForHex(p.hex)
    doc.setFillColor(p.hex)
    doc.setDrawColor(120)
    doc.rect(legendX, y - boxSize, boxSize, boxSize, 'FD')
    doc.setTextColor(0)
    doc.text(
      `${letterForHex.get(p.hex) ?? '?'} ${match.exact ? '' : '≈ '}${match.color.code} ×${p.count}`,
      legendX + boxSize + 2,
      y,
    )
    y += rowH
  }

  await savePdf(doc, `${(opts.name || 'patron').replace(/\s+/g, '_')}.pdf`)
}

/**
 * On the web, jsPDF's own `doc.save()` triggers a normal browser download.
 * Inside a Capacitor WebView there's no browser download UI to trigger, so
 * instead we write the PDF to the app's cache directory (the only folder
 * Capacitor shares files from without extra native config) and hand it to
 * the native share sheet — the standard Capacitor pattern for "export a
 * generated file" (Filesystem.writeFile + Filesystem.getUri + Share.share).
 */
async function savePdf(doc: JsPDF, filename: string): Promise<void> {
  const { Capacitor } = await import('@capacitor/core')
  if (!Capacitor.isNativePlatform()) {
    doc.save(filename)
    return
  }

  const { Filesystem, Directory } = await import('@capacitor/filesystem')
  const { Share } = await import('@capacitor/share')

  const base64 = doc.output('datauristring').split(',')[1]
  await Filesystem.writeFile({ path: filename, data: base64, directory: Directory.Cache })
  const { uri } = await Filesystem.getUri({ path: filename, directory: Directory.Cache })
  await Share.share({ title: filename, files: [uri] })
}
