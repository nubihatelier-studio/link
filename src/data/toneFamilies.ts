/**
 * The chooser's tone grid: families of color, each from very light to very
 * dark. Plain colors, not any bead brand's catalog — the weaver picks freely
 * and buys whatever bead comes closest. Saturation is set per family so the
 * steps read as the beads they stand for (a muted brown, a clear turquoise)
 * rather than as screen-bright HSL.
 */
export interface ToneFamily {
  name: string
  tones: string[]
}

const FAMILIES: [name: string, hue: number, saturation: number][] = [
  ['Rojos', 356, 0.62],
  ['Naranjos', 22, 0.7],
  ['Dorados', 42, 0.62],
  ['Amarillos', 52, 0.78],
  ['Verdes', 125, 0.38],
  ['Verde agua', 165, 0.42],
  ['Turquesas', 190, 0.55],
  ['Azules', 222, 0.55],
  ['Morados', 272, 0.4],
  ['Rosados', 330, 0.5],
  ['Cafés', 26, 0.34],
  ['Grises', 250, 0.04],
]

/** Lightness of each step, light to dark. Seven, so a family is one row of the grid. */
const STEPS = [0.9, 0.78, 0.65, 0.52, 0.4, 0.28, 0.16]

function hslToHex(h: number, s: number, l: number): string {
  const a = s * Math.min(l, 1 - l)
  const f = (n: number) => {
    const k = (n + h / 30) % 12
    return Math.round((l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))) * 255)
      .toString(16)
      .padStart(2, '0')
  }
  return `#${f(0)}${f(8)}${f(4)}`
}

export const TONE_FAMILIES: ToneFamily[] = FAMILIES.map(([name, hue, saturation]) => ({
  name,
  tones: STEPS.map((l) => hslToHex(hue, saturation, l)),
}))

/** Tones per family — the grid's column count. */
export const TONES_PER_FAMILY = STEPS.length
