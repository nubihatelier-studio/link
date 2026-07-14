import type { MiyukiColor } from './colorTypes'
import { MIYUKI_DELICA_11_COLORS } from './miyukiDelica11'

/**
 * All color catalogs merged into one lookup surface. Adding a new brand is
 * just adding another array here (see the commented placeholders below) —
 * nothing in the UI needs to change since it only talks to the helpers.
 */
export const ALL_CATALOGS: MiyukiColor[] = [
  ...MIYUKI_DELICA_11_COLORS,
  // Próximos hitos (fuera de alcance de esta iteración):
  // ...TOHO_COLORS,
  // ...PRECIOSA_COLORS,
  // ...MATUBO_COLORS,
  // ...GENERIC_ROCALLA_COLORS,
]

const byCode = new Map(ALL_CATALOGS.map((c) => [c.code.toUpperCase(), c]))

export function findColorByCode(code: string): MiyukiColor | undefined {
  return byCode.get(code.toUpperCase())
}

export function searchColors(query: string): MiyukiColor[] {
  const q = query.trim().toLowerCase()
  if (!q) return ALL_CATALOGS
  return ALL_CATALOGS.filter(
    (c) => c.code.toLowerCase().includes(q) || c.name.toLowerCase().includes(q),
  )
}
