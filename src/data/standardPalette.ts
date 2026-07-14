/**
 * Plain, brand/catalog-agnostic quick-pick swatches for the editor's color
 * panel — deliberately not sourced from any bead manufacturer's catalog.
 * The full color space is covered by the interactive saturation/value +
 * hue picker (see ColorPicker.tsx); this is just a handful of one-click
 * shortcuts for common colors, kept separate from `catalog.ts` (Miyuki
 * Delica data) so the two can evolve independently.
 */

function hslToHex(h: number, s: number, l: number): string {
  const a = s * Math.min(l, 1 - l)
  const f = (n: number) => {
    const k = (n + h / 30) % 12
    const color = l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))
    return Math.round(color * 255)
      .toString(16)
      .padStart(2, '0')
  }
  return `#${f(0)}${f(8)}${f(4)}`
}

const HUES = [0, 30, 50, 90, 150, 190, 220, 260, 300]

export const QUICK_SWATCHES: string[] = [
  '#000000',
  hslToHex(0, 0, 0.5),
  '#ffffff',
  ...HUES.map((h) => hslToHex(h, 0.65, 0.55)),
]
