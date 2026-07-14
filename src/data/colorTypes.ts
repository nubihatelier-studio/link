/**
 * Brand-agnostic bead color entry. Keeping this shape independent of any
 * single brand's naming lets the catalog module merge multiple bead lines
 * (Miyuki Delica today; Toho / Preciosa / Matubo / generic rocalla as
 * future milestones) behind one lookup API.
 */
export interface MiyukiColor {
  /** Manufacturer code, e.g. "DB-10", "DBC-1", "DBL-27". */
  code: string
  /** Hex color used for rendering, exports, and swatches. */
  hex: string
  /** Short descriptive label (finish/hue), not an official product name. */
  name: string
  /** Whether `hex` was extracted from the official sample card scan vs. visually approximated. */
  sampled: boolean
}
