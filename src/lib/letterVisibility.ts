/**
 * Whether the chart shows a color's letter inside each bead: follow the cell
 * size (`'auto'`), or override it in either direction. The override exists
 * because "is this legible?" isn't ours to decide alone — on a long narrow
 * pattern the fit zoom lands on small cells, and a weaver who knows her own
 * screen would rather squint at a letter than lose it (see
 * `MIN_LETTER_CELL_PX`); someone working a two-color piece may prefer the
 * clean silhouette even at full zoom.
 */
export type LetterVisibility = 'auto' | 'always' | 'never'

export const LETTER_VISIBILITY_ORDER: LetterVisibility[] = ['auto', 'always', 'never']

/**
 * Smallest cell (in CSS px) that still carries a readable letter in `'auto'`.
 *
 * Was 16px, which quietly dropped the letters on exactly the patterns that
 * need them most: a 4 × 41 strip zoomed to fit sits around 12–15px a cell, so
 * the labels vanished with nothing to explain why. The canvas is drawn at
 * `devicePixelRatio`, so on the retina screens these are read on 11px of
 * layout is 22 device px of glyph — comfortably legible, and `'always'` is
 * there for anyone who wants to push past it.
 */
export const MIN_LETTER_CELL_PX = 11

/** Font size floor. Below ~7px a letter stops being a letter and becomes a smudge. */
const MIN_LETTER_FONT_PX = 7
/** Past this the letter starts crowding the bead instead of labelling it. */
const MAX_LETTER_FONT_PX = 13
/** Fraction of the cell the glyph aims for — tuned to sit inside the bead's rounded inset. */
const LETTER_FONT_RATIO = 0.46

export function shouldShowLetters(mode: LetterVisibility, cellPx: number): boolean {
  if (mode === 'never') return false
  if (mode === 'always') return true
  return cellPx >= MIN_LETTER_CELL_PX
}

/**
 * Letter size for a given cell size — scales with the bead rather than
 * sitting at one fixed size, so zooming in gives bigger labels instead of the
 * same small ones floating in roomy cells. Clamped at both ends: the floor
 * keeps small cells readable (a letter forced on at `'always'` and tiny zoom
 * will overflow its bead a little, which is the honest trade for showing it
 * at all), the ceiling keeps big ones from being shouted at.
 */
export function letterFontSizePx(cellPx: number): number {
  return Math.max(MIN_LETTER_FONT_PX, Math.min(MAX_LETTER_FONT_PX, cellPx * LETTER_FONT_RATIO))
}
