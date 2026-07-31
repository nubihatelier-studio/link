import type { MeasurementUnit } from './types'

const MM_PER_UNIT: Record<MeasurementUnit, number> = {
  mm: 1,
  cm: 10,
  in: 25.4,
}

export function toMm(value: number, unit: MeasurementUnit): number {
  return value * MM_PER_UNIT[unit]
}

export function fromMm(mm: number, unit: MeasurementUnit): number {
  return mm / MM_PER_UNIT[unit]
}

export function formatMeasurement(mm: number, unit: MeasurementUnit): string {
  const value = fromMm(mm, unit)
  const decimals = unit === 'in' ? 2 : 1
  return `${value.toFixed(decimals)} ${unit}`
}

/**
 * "7.8 × 102.0 mm" — the one formatter every surface that reports a finished
 * piece's size must use (configurator summary, PDF header, "por tamaño
 * final"). Deliberately shared rather than re-implemented per call site: the
 * three used to round independently, so the same pattern could read one way
 * on screen and another on the printed sheet.
 */
export function formatSizeMm(widthMm: number, heightMm: number, unit: MeasurementUnit = 'mm'): string {
  const decimals = unit === 'in' ? 2 : 1
  return `${fromMm(widthMm, unit).toFixed(decimals)} × ${fromMm(heightMm, unit).toFixed(decimals)} ${unit}`
}
