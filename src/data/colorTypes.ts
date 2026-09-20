/**
 * Brand-agnostic bead color entry. Keeping this shape independent of any
 * single brand's naming lets the catalog module merge multiple bead lines
 * (Miyuki Delica today; Toho / Preciosa / Matubo / generic rocalla as
 * future milestones) behind one lookup API.
 */
export interface MiyukiColor {
  /** Código del fabricante, por ejemplo "DB-10". */
  code: string
  /** El color leído de la cartilla — aproximado, ver `miyukiDelica11.ts`. */
  hex: string
}
