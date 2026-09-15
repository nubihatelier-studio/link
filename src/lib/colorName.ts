import { hexToRgb } from './color'

/**
 * A plain name for any color — "Azul oscuro", "Dorado claro", "Gris" — for
 * the materials list, the PDF legend and the palette.
 *
 * The app used to name colors by the nearest Miyuki Delica code ("~DB-178 ·
 * Azul"). That tied a free choice to one brand's catalog: colors here are
 * picked freely, and the weaver buys whatever bead comes closest in whatever
 * brand she likes. A name that says what the color looks like is what helps
 * at the shop; the swatch next to it does the rest.
 */
export function describeColor(hex: string): string {
  const { h, s, l } = hexToHsl(hex)

  if (s < NEUTRAL_SATURATION || l > 0.96 || l < 0.06) {
    if (l >= 0.92) return 'Blanco'
    if (l <= 0.12) return 'Negro'
    return withShade('Gris', l)
  }
  // Warm, muted and dark reads as brown; warm, muted and very light as beige.
  if (h >= 10 && h < 50 && l < 0.4 && s < 0.85) return withShade('Café', l + 0.2)
  if (h >= 25 && h < 60 && l > 0.78 && s < 0.6) return 'Beige'

  const family = HUE_FAMILIES.find(([from, to]) => (from <= to ? h >= from && h < to : h >= from || h < to))
  const name = family ? family[2] : 'Rojo'
  // A red that light is what everyone calls pink: "Rosado claro", not "Rojo muy claro".
  if (name === 'Rojo' && l >= LIGHT_RED_IS_PINK) return withShade('Rosado', l)
  return withShade(name, l)
}

/** From this lightness on, a red hue reads as pink. */
const LIGHT_RED_IS_PINK = 0.7

/** A saturation below this has no hue worth naming — it's a gray. */
const NEUTRAL_SATURATION = 0.1

/** [from°, to°, name]. Red wraps round 0°. */
const HUE_FAMILIES: [number, number, string][] = [
  [345, 12, 'Rojo'],
  [12, 35, 'Naranjo'],
  [35, 50, 'Dorado'],
  [50, 68, 'Amarillo'],
  [68, 150, 'Verde'],
  [150, 175, 'Verde agua'],
  [175, 200, 'Turquesa'],
  [200, 250, 'Azul'],
  [250, 290, 'Morado'],
  [290, 345, 'Rosado'],
]

function withShade(name: string, l: number): string {
  if (l >= 0.8) return `${name} muy claro`
  if (l >= 0.62) return `${name} claro`
  if (l < 0.2) return `${name} muy oscuro`
  if (l < 0.36) return `${name} oscuro`
  return name
}

function hexToHsl(hex: string): { h: number; s: number; l: number } {
  const { r, g, b } = hexToRgb(hex)
  const [rn, gn, bn] = [r / 255, g / 255, b / 255]
  const max = Math.max(rn, gn, bn)
  const min = Math.min(rn, gn, bn)
  const l = (max + min) / 2
  if (max === min) return { h: 0, s: 0, l }
  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  let h = max === rn ? (gn - bn) / d + (gn < bn ? 6 : 0) : max === gn ? (bn - rn) / d + 2 : (rn - gn) / d + 4
  h *= 60
  return { h, s, l }
}
