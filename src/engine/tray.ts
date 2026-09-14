import type { ColorMap } from './types'

/**
 * The palette tray: the colors loaded to paint with, one per slot, `null` for
 * an empty slot. A new pattern opens with `TRAY_SIZE` empty slots for the
 * weaver to fill — no colors chosen for her — and the tray is kept with the
 * pattern, so a color loaded and not painted yet is still there next time.
 */
export type Tray = (string | null)[]

/** Empty slots a pattern opens with; "+ Casilla" adds more. */
export const TRAY_SIZE = 6

const same = (a: string | null, b: string) => a !== null && a.toLowerCase() === b.toLowerCase()

/** Every color painted in `cells`, in the order they were first painted into the map. */
function paintedColors(cells: ColorMap): string[] {
  const seen = new Map<string, string>()
  for (const hex of Object.values(cells)) if (hex && !seen.has(hex.toLowerCase())) seen.set(hex.toLowerCase(), hex)
  return [...seen.values()]
}

/** Pads with empty slots up to `TRAY_SIZE`. Never shortens: an added seventh slot stays. */
function padded(tray: Tray): Tray {
  return tray.length >= TRAY_SIZE ? tray : [...tray, ...Array<null>(TRAY_SIZE - tray.length).fill(null)]
}

/**
 * The tray a pattern opens with: the one saved with it, or — for a pattern
 * made before the tray was saved — its painted colors. Either way every
 * painted color gets a slot (a letter on the canvas with no swatch to pick
 * it from reads as a bug), duplicates collapse, and it's padded to six.
 */
export function trayFor(saved: Tray | undefined, cells: ColorMap): Tray {
  const tray: Tray = []
  for (const hex of saved ?? []) tray.push(hex && !tray.some((t) => same(t, hex)) ? hex : null)
  for (const hex of paintedColors(cells)) {
    if (tray.some((t) => same(t, hex))) continue
    const vacant = tray.indexOf(null)
    if (vacant >= 0) tray[vacant] = hex
    else tray.push(hex)
  }
  // Slots keep their place: the weaver put that color in that slot.
  return padded(tray)
}

/** Index of the slot holding `hex`, or -1. */
export function slotOf(tray: Tray, hex: string): number {
  return tray.findIndex((t) => same(t, hex))
}

/**
 * Puts `hex` in `slot` and returns the slot to paint with. A color already in
 * another slot isn't loaded twice: that slot is the one returned, and `slot`
 * stays as it was.
 */
export function fillSlot(tray: Tray, slot: number, hex: string): { tray: Tray; active: number } {
  const existing = slotOf(tray, hex)
  if (existing >= 0 && existing !== slot) return { tray, active: existing }
  const next = [...tray]
  while (next.length <= slot) next.push(null)
  next[slot] = hex
  return { tray: next, active: slot }
}

/** Loads `hex` into the first empty slot (adding one if the tray is full), unless it's already there. */
export function loadColor(tray: Tray, hex: string): { tray: Tray; active: number } {
  const existing = slotOf(tray, hex)
  if (existing >= 0) return { tray, active: existing }
  const vacant = tray.indexOf(null)
  return fillSlot(tray, vacant >= 0 ? vacant : tray.length, hex)
}

/** Keeps only the painted colors, first, and pads the rest with empty slots. */
export function withoutUnpainted(tray: Tray, cells: ColorMap): Tray {
  const painted = new Set(paintedColors(cells).map((h) => h.toLowerCase()))
  return padded(tray.filter((t): t is string => t !== null && painted.has(t.toLowerCase())))
}

/** The slot to paint with after `slot` was emptied: the first loaded color, or none. */
export function activeAfterEmptying(tray: Tray, active: number): number {
  if (active >= 0 && tray[active]) return active
  return tray.findIndex(Boolean)
}
