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
